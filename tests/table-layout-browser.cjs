/* Table boundaries and selection-cell targets, using a private synthetic scan/export. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.MSX_PLAYWRIGHT||'playwright');
(async()=>{
 const project=process.cwd(),platform=process.platform==='win32'?'windows':'wsl';
 const run=path.join(project,'.mediaslimx','import-tests',platform+'-table-layout-'+crypto.randomUUID()),source=path.join(run,'source'),data=path.join(run,'data');
 await fs.mkdir(path.join(source,'images'),{recursive:true});
 const jpg=await fs.readFile(path.join(project,'.test-media','images','landscape.jpg'));
 const png=await fs.readFile(path.join(project,'.test-media','images','alpha.png'));
 for(const name of ['banner','cover','detail','feature','gallery','hero','product','thumbnail'])await fs.writeFile(path.join(source,'images',name+'.jpg'),jpg);
 await fs.writeFile(path.join(source,'images','logo.png'),png);
 await fs.writeFile(path.join(source,'images','broken.jpg'),'damaged synthetic image');
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==='windows'?'.venv-win/Scripts/python.exe':'.venv/bin/python');
 const child=spawn(python,['-m','mediaslimx','--port',String(port),'--data-dir',data,'--allow-root',source,'--no-browser'],{cwd:project,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',browser;child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 const delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],layouts:[],errors:[]};
 try{
  let url;
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]+/);if(match){url=match[0];try{if((await fetch(url.split('/#')[0]+'/')).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url,'isolated service started');
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(url);await page.locator('#connection[data-connected=true]').waitFor();
  await page.fill('#media-path',source);await page.click('#scan-button');await page.locator('#settings-section').waitFor();
  assert.equal(await page.locator('#scan-body input:not([disabled])').count(),9);
  const selection=page.locator('#scan-body .selection-cell').filter({has:page.locator('input:not([disabled])')}).first();
  const checkbox=selection.locator('input');
  await checkbox.evaluate(n=>{window.cellChanges=0;n.addEventListener('change',()=>window.cellChanges++);});
  const selectedCount=()=>page.evaluate(()=>state.selected.size);
  const before=await selectedCount();
  const hit=await selection.boundingBox();await page.mouse.click(hit.x+3,hit.y+hit.height/2);
  assert.equal(await selectedCount(),before-1);assert.equal(await page.evaluate(()=>cellChanges),1,'cell blank click changes once');
  await checkbox.click();assert.equal(await selectedCount(),before);assert.equal(await page.evaluate(()=>cellChanges),2,'native click changes once');
  await checkbox.focus();await page.keyboard.press('Space');assert.equal(await selectedCount(),before-1);assert.equal(await page.evaluate(()=>cellChanges),3,'Space changes once');
  await page.keyboard.press('Space');assert.equal(await selectedCount(),before);
  const disabled=page.locator('#scan-body .selection-cell').filter({has:page.locator('input[disabled]')});
  await disabled.click({position:{x:3,y:15}});assert.equal(await selectedCount(),before,'unsupported cell remains disabled');
  await disabled.locator('input').click({force:true});assert.equal(await selectedCount(),before,'disabled checkbox remains disabled');
  await page.locator('#scan-body tr').first().locator('td').nth(1).click();assert.equal(await selectedCount(),before,'path clicks do not change selection');
  report.checks.push('selection-cell blank, checkbox and Space each toggle exactly once; disabled and path cells do not toggle');
  async function layouts(stage){
   const selector=stage==='scan'?'#scan-section':'#results-section';
   for(const lang of ['zh-CN','en']){
    if(await page.locator('html').getAttribute('lang')!==lang)await page.click('#language-toggle');
    for(const theme of ['dark','light']){
     if(await page.locator('html').getAttribute('data-theme')!==theme)await page.click('#theme-toggle');
     for(const [width,height]of [[320,568],[390,844],[768,900],[1001,640],[1440,900]]){
      await page.setViewportSize({width,height});await page.locator(selector).scrollIntoViewIfNeeded();
      const geometry=await page.locator(selector).evaluate((panel,stage)=>{
       const wrap=panel.querySelector('.table-wrap');wrap.scrollLeft=0;wrap.scrollTop=0;
       const table=wrap.querySelector('table'),headers=[...table.querySelectorAll('thead th')],row=table.querySelector('tbody tr'),cells=[...row.children];
       const rect=n=>n.getBoundingClientRect(),p=rect(panel),w=rect(wrap);
       const textLeft=n=>{const r=document.createRange();r.selectNodeContents(n);return r.getBoundingClientRect().left;};
       const guide=panel.querySelector(stage==='scan'?'.section-title':'.metrics');
       const aligned=headers.map((h,i)=>{const td=cells[i];return i===0&&stage==='scan'?Math.abs(rect(h).x+rect(h).width/2-rect(td.querySelector('input')).x-22):Math.abs(textLeft(h)-textLeft(td));});
       return {left:w.left-p.left-1,right:p.right-w.right-1,guide:Math.abs(rect(guide).left-w.left),firstPath:stage==='results'?Math.abs(textLeft(cells[0])-rect(guide).left):0,aligned,checkboxWidth:stage==='scan'?rect(cells[0].querySelector('input')).width:44,columnWidth:stage==='scan'?rect(cells[0]).width:64,minFont:Math.min(...[...table.querySelectorAll('td,th,.reason,button')].map(n=>parseFloat(getComputedStyle(n).fontSize))),overflow:document.documentElement.scrollWidth-innerWidth,wrapClient:wrap.clientWidth,tableWidth:rect(table).width,sticky:getComputedStyle(table.tHead).position};
      },stage);
      const label=[stage,lang,theme,width].join('/'),gutter=width<768?15:stage==='scan'?20:22;
      assert.ok(Math.abs(geometry.left-gutter)<1&&Math.abs(geometry.right-gutter)<1,label+' symmetric panel gutter '+JSON.stringify(geometry));
      assert.ok(geometry.guide<1&&geometry.firstPath<1,label+' content guide alignment');
      assert.ok(geometry.aligned.every(n=>n<1),label+' header/data left alignment '+geometry.aligned);
      assert.equal(geometry.checkboxWidth,44,label+' checkbox target');assert.equal(geometry.columnWidth,64,label+' selection column');
      assert.ok(geometry.minFont>=12,label+' readable text');assert.ok(geometry.overflow<=1,label+' no page overflow');
      assert.equal(geometry.sticky,'sticky');if(width<768)assert.ok(geometry.tableWidth>geometry.wrapClient,label+' local horizontal scroll');
      const sticky=await page.locator(selector+' .table-wrap').evaluate(w=>{w.scrollTop=w.scrollHeight;const t=w.querySelector('thead').getBoundingClientRect(),r=w.getBoundingClientRect();return {scroll:w.scrollTop,delta:Math.abs(t.top-r.top)};});
      if(sticky.scroll>0)assert.ok(sticky.delta<2,label+' sticky heading');
      report.layouts.push({stage,lang,theme,width});
     }
    }
   }
  }
  await layouts('scan');
  await page.setViewportSize({width:1440,height:900});await page.click('#select-all');await page.fill('#output-path',path.join(run,'exports'));await page.click('#start-button');
  await page.waitForFunction(()=>state.task?.status==='completed',{},{timeout:60000});
  assert.equal(await page.evaluate(()=>state.task.entries.filter(e=>e.result_fp).length),9);
  assert.deepEqual(await fs.readFile(path.join(source,'images','banner.jpg')),jpg,'export preserves originals');
  await layouts('results');
  if(await page.locator('html').getAttribute('lang')!=='zh-CN')await page.click('#language-toggle');
  if(await page.locator('html').getAttribute('data-theme')!=='dark')await page.click('#theme-toggle');
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('#results-section .table-wrap').evaluate(w=>{w.scrollLeft=0;w.scrollTop=0;});await delay(300);await page.screenshot({path:path.join(run,'table-results.png')});
  const reportResponse=page.waitForResponse(r=>r.url().endsWith('/report.csv'));
  const download=page.waitForEvent('download');await page.locator('#export-report').click();
  assert.equal((await reportResponse).status(),200);const csvPath=path.join(run,'report.csv');await (await download).saveAs(csvPath);assert.match(await fs.readFile(csvPath,'utf8'),/images\/banner\.jpg/);
  report.checks.push('real scan/export, nine verified results and unchanged originals; 20 scan plus 20 result layouts across two locales, two themes and five viewports; CSV action remains usable');
  assert.deepEqual(report.errors,[]);await fs.writeFile(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,evidence:run,checks:report.checks,layouts:report.layouts.length,errors:report.errors},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==='win32')await new Promise(r=>{const stop=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});stop.on('close',r);});else{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.on('close',r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
