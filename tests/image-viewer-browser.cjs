/* Application-local full-resolution image viewer. Private service/fixtures only;
   no user records, installed desktop profile, or running service is accessed. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.MSX_PLAYWRIGHT||'playwright');
(async()=>{
 const root=process.cwd(),platform=process.platform==='win32'?'windows':'wsl';
 const run=path.join(root,'.mediaslimx','import-tests',platform+'-image-viewer-'+crypto.randomUUID()),source=path.join(run,'source'),data=path.join(run,'data');
 const python=process.env.MSX_PYTHON||path.join(root,platform==='windows'?'.venv-win/Scripts/python.exe':'.venv/bin/python');
 await fs.mkdir(source,{recursive:true});
 const generate="from PIL import Image; from pathlib import Path; import sys; p=Path(sys.argv[1]); im=Image.effect_noise((4096,2048),35).convert('RGB'); im.save(p/'photo.jpg',quality=100,subsampling=0); Image.new('RGB',(1,1),'red').save(p/'pixel.png',optimize=True)";
 await new Promise((resolve,reject)=>{const fixture=spawn(python,['-X','utf8','-c',generate,source],{cwd:root,stdio:['ignore','ignore','pipe']});let stderr='';fixture.stderr.on('data',d=>stderr+=d);fixture.on('error',reject);fixture.on('exit',code=>code===0?resolve():reject(Error(stderr)));});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(python,['-m','mediaslimx','--port',String(port),'--data-dir',data,'--allow-root',source,'--no-browser'],{cwd:root,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',browser,token,url;child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 const base='http://127.0.0.1:'+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],layouts:[],errors:[],popups:0};
 async function api(route,body){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-MediaSlimX-Token':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(response.ok,route+': '+await response.clone().text());return response.json();}
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{await api('/api/environment');break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url,'private service starts');
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||(platform==='windows'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'/usr/bin/google-chrome'),headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('popup',()=>report.popups++);
  await page.addInitScript(()=>{window.open=()=>{throw Error('new windows are forbidden by this test host');};});
  await page.goto(url);await page.locator('#connection[data-connected=true]').waitFor();
  const scan=await api('/api/scans',{path:source}),created=await api('/api/tasks',{scan_id:scan.id,selected:scan.entries.filter(e=>e.status==='ready').map(e=>e.id),preset:'balanced',mode:'export',output:path.join(run,'exports')});
  let task;for(let i=0;i<600;i++){task=await api('/api/tasks/'+created.id);if(task.status==='completed')break;await delay(100);}assert.equal(task.status,'completed');
  const picture=task.entries.find(e=>e.relative==='photo.jpg'),pixel=task.entries.find(e=>e.relative==='pixel.png');assert.equal(picture.status,'success',picture.reason);assert.equal(pixel.status,'no_gain',pixel.reason);
  await page.evaluate(id=>openTask(id),task.id);
  async function openDetail(entry=picture){const row=page.locator('#result-body tr').filter({has:page.locator('td').first().filter({hasText:entry.relative})});const button=row.locator('button').first();await button.click();await page.locator('#detail-dialog[open]').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('#preview-grid img')].every(i=>i.complete&&i.naturalWidth>0));return button;}
  async function openImage(slot='original'){
   const button=page.locator('#preview-grid .image-preview-trigger').nth(slot==='original'?0:1);await button.click();await page.waitForFunction(()=>document.querySelector('#image-viewer-dialog').dataset.state==='ready');await page.locator('#image-viewer-dialog').evaluate(async d=>{await Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{})));});return button;
  }
  async function closeImage(key=false){if(key)await page.keyboard.press('Escape');else await page.click('#close-image-viewer');await page.waitForFunction(()=>!document.querySelector('#image-viewer-dialog').open);assert.equal(await page.locator('#detail-dialog').evaluate(n=>n.open),true);assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('image-preview-trigger')),true);}
  await openDetail();
  for(const slot of ['original','result']){
   const button=await openImage(slot),sourceUrl=await button.locator('img').getAttribute('src');assert.equal(await page.locator('#image-viewer-image').getAttribute('src'),sourceUrl,'viewer uses the clicked authenticated image');
   assert.ok(sourceUrl.endsWith('/'+slot));assert.equal(await page.locator('#close-image-viewer').textContent(),'');
   const natural=await page.locator('#image-viewer-image').evaluate(i=>[i.naturalWidth,i.naturalHeight]);assert.deepEqual(natural,[4096,2048]);
   await page.click('#image-viewer-original');
   const actual=await page.locator('#image-viewer-stage').evaluate(stage=>{const image=document.querySelector('#image-viewer-image');return {width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,scrollWidth:stage.scrollWidth,clientWidth:stage.clientWidth};});
   assert.equal(actual.width,4096);assert.equal(actual.height,2048);assert.ok(actual.scrollWidth>actual.clientWidth,'full pixels are internally scrollable');
   await page.locator('#image-viewer-stage').evaluate(n=>{n.scrollLeft=n.scrollWidth;n.scrollTop=n.scrollHeight;});assert.ok(await page.locator('#image-viewer-stage').evaluate(n=>n.scrollLeft>0&&n.scrollTop>0));
   await page.click('#image-viewer-plus');assert.equal(await page.locator('#image-viewer-scale').textContent(),'150%');
   await page.keyboard.press('-');assert.equal(await page.locator('#image-viewer-scale').textContent(),'100%');
   await page.keyboard.press('0');assert.equal(await page.locator('#image-viewer-fit').getAttribute('aria-pressed'),'true');
   await page.keyboard.press('1');assert.equal(await page.locator('#image-viewer-scale').textContent(),'100%');
   await closeImage(slot==='original');
  }
  await page.keyboard.press('Escape');assert.equal(await page.locator('#detail-dialog').evaluate(n=>n.open),false);
  report.checks.push('original/result open the exact clicked authenticated image without new windows; 100% renders 4096×2048 and scrolls; pointer/keyboard zoom and both Esc/close return to the triggering preview before detail Esc closes the parent');
  for(const language of ['zh-CN','en'])for(const theme of ['dark','light'])for(const [width,height] of [[320,568],[390,844],[768,900],[1440,900],[844,390]]){
   await page.setViewportSize({width,height});if(await page.locator('html').getAttribute('lang')!==language)await page.click('#language-toggle');if(await page.locator('html').getAttribute('data-theme')!==theme)await page.click('#theme-toggle');
   await openDetail();await page.locator('#preview-grid .image-preview-trigger').first().focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#image-viewer-dialog').dataset.state==='ready');await page.locator('#image-viewer-dialog').evaluate(async d=>{await Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{})));});
   await page.locator('#image-viewer-title').evaluate(n=>n.textContent='nested/'+('非常长的文件名称-long-file-'.repeat(25))+'.jpg');
   const metrics=await page.locator('#image-viewer-dialog').evaluate(dialog=>{const r=dialog.getBoundingClientRect(),close=document.querySelector('#close-image-viewer').getBoundingClientRect(),stage=document.querySelector('#image-viewer-stage'),title=document.querySelector('#image-viewer-title'),offenders=[];let minFont=100;
    for(const node of dialog.querySelectorAll('*')){if(!node.getClientRects().length)continue;const cs=getComputedStyle(node);if(node.textContent.trim())minFont=Math.min(minFont,parseFloat(cs.fontSize));if(node.matches('button,a,[tabindex]')){const b=node.getBoundingClientRect();if(node.tagName==='BUTTON'&&(b.width<43.9||b.height<43.9))offenders.push(node.id);}}
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,minFont,offenders,close:{top:close.top,bottom:close.bottom,width:close.width,height:close.height},titleHeight:title.clientHeight,titleLine:parseFloat(getComputedStyle(title).lineHeight),overflow:document.documentElement.scrollWidth-innerWidth,stageHeight:stage.clientHeight,scroll:dialog.scrollWidth-dialog.clientWidth};
   });
   assert.ok(metrics.left>=0&&metrics.right<=width+1&&metrics.top>=0&&metrics.bottom<=height+1,JSON.stringify(metrics));assert.ok(metrics.minFont>=12);assert.deepEqual(metrics.offenders,[]);assert.ok(metrics.titleHeight<=metrics.titleLine*3+1);assert.ok(metrics.overflow<=1&&metrics.scroll<=1);assert.ok(metrics.stageHeight>30);assert.ok(metrics.close.top>=0&&metrics.close.bottom<=height);assert.equal(await page.locator('#close-image-viewer').getAttribute('aria-label'),language==='en'?'Close image preview':'关闭图片预览');
   if(language==='en')assert.equal(await page.locator('#image-viewer-fit').textContent(),'Fit to window');
   await closeImage(true);await page.click('#close-detail');report.layouts.push({language,theme,width,height,...metrics});
  }
  report.checks.push('20 Chinese/English/theme/viewport combinations: ≥12px text, 44px controls, three-line long title, fixed reachable close, internal image scroll and no horizontal page overflow; keyboard Enter opens the viewer');
  await page.setViewportSize({width:1440,height:900});await openDetail(pixel);await openImage();assert.equal(await page.locator('#image-viewer-scale').textContent(),'100%','fit does not upscale a tiny source');await closeImage();await page.click('#close-detail');
  await openDetail();await page.route('**/preview/*/original',route=>route.abort());await page.locator('#preview-grid .image-preview-trigger').first().click();
  await page.waitForFunction(()=>document.querySelector('#image-viewer-dialog').dataset.state==='error');assert.equal(await page.locator('#image-viewer-image').isVisible(),false);assert.match(await page.locator('#image-viewer-message').textContent(),/无法预览|cannot be previewed|unavailable/i);assert.equal(await page.locator('#image-viewer-plus').isDisabled(),true);await closeImage(true);await page.unroute('**/preview/*/original');
  let release;const gate=new Promise(resolve=>release=resolve);let routed=false;
  await page.route('**/preview/*/original',async route=>{routed=true;await gate;await route.abort().catch(()=>{});});
  await page.locator('#preview-grid .image-preview-trigger').first().click();await page.waitForFunction(()=>document.querySelector('#image-viewer-dialog').dataset.state==='loading');
  for(let i=0;i<50&&!routed;i++)await delay(10);assert.ok(routed);await closeImage(true);release();await page.unroute('**/preview/*/original');assert.equal(await page.locator('#image-viewer-dialog').evaluate(n=>n.open),false);await page.click('#close-detail');
  report.checks.push('tiny source stays at 100%; failed image stays inside the viewer with disabled zoom and a readable reason; closing while bytes are pending preserves parent focus and does not reopen on late completion');
  // Abort faults can remain in Chromium's document image cache; use a fresh page
  // before later success checks so those deliberately failed resources are gone.
  await page.reload();await page.locator('#connection[data-connected=true]').waitFor();await page.evaluate(id=>openTask(id),task.id);
  await page.emulateMedia({reducedMotion:'reduce'});await openDetail();await openImage();
  const motion=await page.locator('#image-viewer-dialog').evaluate(dialog=>({animations:dialog.getAnimations().length,duration:parseFloat(getComputedStyle(dialog).animationDuration)}));assert.ok(motion.duration<=.001);assert.equal(motion.animations,0);await closeImage(true);await page.click('#close-detail');await page.emulateMedia({reducedMotion:'no-preference'});
  if(await page.locator('html').getAttribute('lang')!=='zh-CN')await page.click('#language-toggle');if(await page.locator('html').getAttribute('data-theme')!=='dark')await page.click('#theme-toggle');
  await openDetail();await openImage('result');await page.screenshot({path:path.join(run,'image-viewer-desktop.png')});await closeImage();await page.click('#close-detail');
  assert.equal(report.popups,0);assert.equal(context.pages().length,1);assert.deepEqual(report.errors,[]);report.checks.push('reduced motion remains static; no external/new-window opens, no page errors, desktop evidence saved');
  await fs.writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,layouts:report.layouts.length,errors:report.errors,popups:report.popups,evidence:run},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){
   if(platform==='windows')await new Promise(resolve=>{const stop=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.on('exit',resolve);stop.on('error',resolve);});
   else child.kill();
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);
  }
  let listening=true;
  for(let i=0;i<50;i++){
   listening=await new Promise(resolve=>{const connection=net.connect({host:'127.0.0.1',port});connection.setTimeout(300);connection.once('connect',()=>{connection.destroy();resolve(true);});connection.once('error',()=>resolve(false));connection.once('timeout',()=>{connection.destroy();resolve(true);});});
   if(!listening)break;await delay(100);
  }
  assert.equal(listening,false,'private service listener must stop, including Windows venv descendants');
  console.log('Private image-viewer test service stopped; port closed.');
 }

})().catch(error=>{console.error(error);process.exitCode=1;});
