/* File detail layout and preview behavior against real private media/tasks.
   This suite never talks to the user's running service or media directory. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto"),{spawn}=require("node:child_process");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-detail-layout-"+crypto.randomUUID()),source=path.join(run,"source"),data=path.join(run,"data");
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 await fs.mkdir(path.join(source,"images"),{recursive:true});
 const jpg=await fs.readFile(path.join(project,".test-media","images","landscape.jpg")),video=await fs.readFile(path.join(project,".test-media","video","sample.mp4"));
 const longName="非常长的图片文件名称".repeat(7)+".jpg";
 await fs.writeFile(path.join(source,"images","banner.jpg"),jpg);
 await fs.writeFile(path.join(source,"images",longName),jpg);
 await fs.writeFile(path.join(source,"images","broken.jpg"),"damaged synthetic image, not user media");
 await fs.writeFile(path.join(source,"sample.mp4"),video);
 const generate="from pathlib import Path; import sys,pikepdf; from PIL import Image; root=Path(sys.argv[1]); Image.new('RGB',(1,1),'red').save(root/'images'/'pixel.png',optimize=True); pdf=pikepdf.Pdf.new(); page=pdf.add_blank_page(page_size=(500,700)); page.Contents=pdf.make_stream(b'q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\\n'*1500); pdf.save(root/'guide.pdf',compress_streams=False,object_stream_mode=pikepdf.ObjectStreamMode.disable); pdf.close()";
 await new Promise((resolve,reject)=>{const process=spawn(python,["-X","utf8","-c",generate,source],{cwd:project,stdio:["ignore","ignore","pipe"]});let error="";process.stderr.on("data",d=>error+=d);process.on("error",reject);process.on("exit",code=>code===0?resolve():reject(Error(error||"private fixture generation failed")));});
 const originalPdf=await fs.readFile(path.join(source,"guide.pdf")),pixel=await fs.readFile(path.join(source,"images","pixel.png"));
 const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],layouts:[],errors:[]};
 async function api(route,body){const response=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(response.ok,route+": "+await response.clone().text());return response;}
 async function json(route,body){return (await api(route,body)).json();}
 async function taskFromScan(scan,params={}){
  const created=await json("/api/tasks",{scan_id:scan.id,selected:scan.entries.filter(e=>e.status==="ready").map(e=>e.id),preset:"quality",mode:"export",output:path.join(run,"exports"),...params});
  for(let i=0;i<900;i++){const task=await json("/api/tasks/"+created.id);if(!["running","cancelling","restoring"].includes(task.status))return task;await delay(100);}throw Error("private task did not finish");
 }
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url,"isolated service must start");
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  const scan=await json("/api/scans",{path:source}),task=await taskFromScan(scan);
  assert.equal(task.status,"completed");
  const picture=task.entries.find(e=>e.relative==="images/banner.jpg"),longPicture=task.entries.find(e=>e.relative==="images/"+longName),failed=task.entries.find(e=>e.relative==="images/broken.jpg"),noGain=task.entries.find(e=>e.relative==="images/pixel.png"),movie=task.entries.find(e=>e.relative==="sample.mp4"),pdf=task.entries.find(e=>e.relative==="guide.pdf");
  assert.equal(picture.status,"success",picture.reason);assert.equal(noGain.status,"no_gain",noGain.reason);assert.equal(failed.status,"failed",failed.reason);assert.ok(movie.result_fp,movie.reason);assert.equal(pdf.status,"success",pdf.reason);
  assert.equal(hash(await fs.readFile(path.join(source,"images","banner.jpg"))),hash(jpg));
  assert.equal(hash(await fs.readFile(path.join(source,"images","pixel.png"))),hash(pixel));
  assert.equal(hash(await fs.readFile(path.join(source,"guide.pdf"))),hash(originalPdf));
  await page.evaluate(id=>openTask(id),task.id);
  async function open(entry){
   const index=await page.evaluate(relative=>[...document.querySelectorAll("#result-body tr")].findIndex(row=>row.cells[0].textContent===relative),entry.relative);
   assert.ok(index>=0,"entry row must exist: "+entry.relative);
   const button=page.locator("#result-body tr").nth(index).locator("button").first();
   await button.evaluate(node=>window.detailOpener=node);await button.click();await page.locator("#detail-dialog[open]").waitFor();return button;
  }
  async function close(keyboard=false){
   if(keyboard)await page.keyboard.press("Escape");else await page.click("#close-detail");
   await page.waitForFunction(()=>!document.querySelector("#detail-dialog").open);
   assert.equal(await page.evaluate(()=>document.activeElement===window.detailOpener),true,"detail dismissal restores opening button focus");
  }
  await open(picture);
  await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid img")].length===2&&[...document.querySelectorAll("#preview-grid img")].every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(await page.locator("#close-detail").textContent(),"","close is icon-only");
  assert.match(await page.locator("#close-detail").getAttribute("aria-label"),/关闭详情/);
  assert.equal(await page.locator("#detail-raw").getAttribute("open"),null,"technical JSON starts collapsed");
  assert.equal(await page.locator("#detail-params").isVisible(),false);
  const summaries=await page.locator("#detail-summary").textContent(),formatted=await page.evaluate(e=>({original:size(e.size),result:size(e.result_size)}),picture);
  assert.ok(summaries.includes(formatted.original)&&summaries.includes(formatted.result),"summary reflects actual original and result byte counts");
  assert.equal(await page.locator('#detail-summary [data-detail-stat="original"] dd').textContent(),formatted.original);
  assert.equal(await page.locator('#detail-summary [data-detail-stat="result"] dd').textContent(),formatted.result);
  assert.equal(await page.locator('#detail-parameters [data-param-key="quality"] dd').textContent(),String(picture.actual_params.quality));
  assert.match(await page.locator("#detail-parameters").textContent(),/90/,"actual JPEG quality is human-readable");
  assert.match(await page.locator("#detail-parameters").textContent(),/画质优先/,"preset is human-readable");
  assert.doesNotMatch(await page.locator("#detail-parameters").textContent(),/[{}]|undefined|NaN/,"parameter reading area does not expose raw objects");
  assert.ok(await page.locator("#preview-grid dl").count()>=2,"both preview cards contain readable metadata");
  const details=page.locator("#detail-raw summary");await details.click();
  assert.equal(await page.locator("#detail-params").isVisible(),true);
  const raw=JSON.parse(await page.locator("#detail-params").textContent());assert.equal(raw.quality,picture.actual_params.quality);assert.equal(raw.preset,"quality");
  await details.click();await close(true);
  report.checks.push("real JPEG export keeps source bytes, loads both images, shows truthful sizes and readable quality/preset/metadata; JSON disclosure defaults closed and Escape returns focus");
  const sizes=[[320,568],[390,640],[768,900],[1001,640],[1440,640],[1440,900],[844,390]];
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const theme of ["dark","light"]){
    if(await page.locator("html").getAttribute("data-theme")!==theme)await page.click("#theme-toggle");
    for(const [width,height]of sizes){
     await page.setViewportSize({width,height});await open(longPicture);await delay(270);
     const geometry=await page.locator("#detail-dialog").evaluate(dialog=>{
      const r=node=>node.getBoundingClientRect(),visible=node=>!!node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden";
      const bounds=r(dialog),content=dialog.querySelector(".detail-content"),title=dialog.querySelector("#detail-title"),close=dialog.querySelector("#close-detail"),line=parseFloat(getComputedStyle(title).lineHeight),offenders=[];
      let minFont=Infinity,minWidth=Infinity,minHeight=Infinity;
      for(const node of dialog.querySelectorAll("*")){
       if(!visible(node))continue;
       if([...node.childNodes].some(child=>child.nodeType===Node.TEXT_NODE&&child.textContent.trim()))minFont=Math.min(minFont,parseFloat(getComputedStyle(node).fontSize));
       if(node.matches("button,a,summary,[tabindex]")){
        const b=r(node);if(!node.matches("#detail-title")){minWidth=Math.min(minWidth,b.width);minHeight=Math.min(minHeight,b.height);if(b.width<43.9||b.height<43.9)offenders.push(node.tagName+"#"+node.id+" "+b.width+"x"+b.height);}
       }
      }
      content.scrollTop=content.scrollHeight;
      const endClose=r(close),endTitle=r(title);
      return {bounds:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom},overflow:content.scrollWidth-content.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,minFont,minWidth,minHeight,offenders,closeTop:endClose.top,closeBottom:endClose.bottom,titleHeight:endTitle.height,line,titleMax:parseFloat(getComputedStyle(title).maxHeight),closeWidth:endClose.width,titleRight:endTitle.right,closeLeft:endClose.left,closeText:close.textContent,contentScroll:content.scrollTop,contentHeight:content.clientHeight,headingPosition:getComputedStyle(dialog.querySelector(".section-title")).position};
     });
     const label=[lang,theme,width,height].join("/");
     assert.ok(geometry.bounds.left>=0&&geometry.bounds.right<=width+1&&geometry.bounds.top>=0&&geometry.bounds.bottom<=height+1,label+" dialog fits viewport "+JSON.stringify(geometry));
     assert.ok(geometry.overflow<=1&&geometry.pageOverflow<=1,label+" no horizontal overflow");
     assert.ok(geometry.minFont>=12,label+" minimum readable font");
     assert.deepEqual(geometry.offenders,[],label+" 44px interaction targets");
     assert.ok(geometry.closeTop>=0&&geometry.closeBottom<=height+1,label+" close remains reachable after content scroll");
     assert.ok(geometry.titleRight<=geometry.closeLeft+1,label+" long title does not overlap close");
     assert.ok(geometry.titleHeight<=geometry.line*3+1,label+" title stays within three lines");
     assert.equal(geometry.closeText,"",label+" close remains icon-only");
     await close(report.layouts.length%2===0);report.layouts.push({lang,theme,width,height});
    }
   }
  }
  report.checks.push("28 bilingual/theme/viewport combinations preserve 12px type, 44px targets, three-line long titles, internal scrolling and reachable icon-only close; both close and Escape return focus");
  await page.setViewportSize({width:1440,height:1000});
  if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.click("#language-toggle");
  if(await page.locator("html").getAttribute("data-theme")!=="dark")await page.click("#theme-toggle");
  await open(noGain);assert.match(await page.locator("#detail-status").textContent(),/无收益/);
  const identical=await page.locator("#preview-grid img").evaluateAll(nodes=>nodes.map(node=>node.src));assert.equal(identical.length,2);
  for(const href of identical){const response=await fetch(href,{headers:{"X-MediaSlimX-Token":token}});assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(pixel),"no-gain previews retain exact bytes");}
  await close();await open(failed);assert.match(await page.locator("#detail-status").textContent(),/失败/);assert.equal(await page.locator("#preview-grid img,#preview-grid video,#preview-grid a[download]").count(),0,"failed file has no fabricated result preview");
  assert.doesNotMatch(await page.locator("#detail-summary").textContent(),/NaN|undefined/);
  await close();
  report.checks.push("no-gain card previews exact unchanged bytes; damaged media reports failure without manufactured previews or invalid summary values");
  await open(movie);assert.equal(await page.locator("#preview-grid video").count(),2);
  await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid video")].every(video=>video.readyState>=1&&!video.error),{},{timeout:30000});
  assert.ok((await page.locator("#preview-grid dl").allTextContents()).join(" ").match(/H\.?264|h264/i),"video metadata includes actual codec");
  const playback=await page.locator("#preview-grid video").last().evaluate(async video=>{video.muted=true;await video.play();await new Promise(r=>setTimeout(r,160));const result={time:video.currentTime,width:video.videoWidth,height:video.videoHeight,duration:video.duration,error:video.error?.message||null};video.pause();return result;});
  assert.ok(playback.time>0&&playback.width===movie.result_info.width&&playback.height===movie.result_info.height&&playback.duration>0&&!playback.error,"actual MP4 playback and dimensions");
  await close();await open(pdf);assert.equal(await page.locator("#preview-grid img,#preview-grid video,#preview-grid iframe,#preview-grid object,#preview-grid embed").count(),0,"PDF cannot be embedded in service origin");
  const downloads=page.locator("#preview-grid a[download]");assert.equal(await downloads.count(),2);
  for(const slot of ["original","result"]){
   const link=page.locator('#preview-grid a[href$="/'+slot+'"]'),href=await link.getAttribute("href"),response=await api(href);assert.match(response.headers.get("content-disposition"),/^attachment/i);assert.equal(response.headers.get("x-content-type-options"),"nosniff");
   const event=page.waitForEvent("download");await link.click();const download=await event,destination=path.join(run,slot+".pdf");await download.saveAs(destination);assert.equal(await download.failure(),null);assert.equal(hash(await fs.readFile(destination)),slot==="original"?hash(originalPdf):pdf.result_fp.sha256);
  }
  await close();report.checks.push("both MP4 previews load metadata and result video actually plays; PDF stays download-only and both actual downloads match recorded hashes");
  const overwriteSource=path.join(source,"overwrite");await fs.mkdir(overwriteSource);const overwritePath=path.join(overwriteSource,"direct.jpg");await fs.writeFile(overwritePath,jpg);
  const overwriteScan=await json("/api/scans",{path:overwriteSource}),overwriteTask=await taskFromScan(overwriteScan,{preset:"small",mode:"overwrite",output:null,confirm:true}),overwritten=overwriteTask.entries[0];
  assert.equal(overwritten.status,"success",overwritten.reason);assert.equal(overwritten.backup,null);assert.notEqual(hash(await fs.readFile(overwritePath)),hash(jpg));
  await page.evaluate(id=>openTask(id),overwriteTask.id);await open(overwritten);
  const onlyResult=await page.locator("#preview-grid img").getAttribute("src");assert.match(onlyResult,/\/result$/);assert.equal(await page.locator("#preview-grid img").count(),1);
  assert.match(await page.locator("#detail-dialog").textContent(),/未保留原文件.*无法.*对比/);
  await close();report.checks.push("explicitly confirmed direct overwrite on a private synthetic JPEG exposes only the real result and explains missing original comparison");
  // Re-use actual optimized bytes to exercise the persistent duplicate guard.
  const duplicateSource=path.join(source,"duplicate");await fs.mkdir(duplicateSource);
  const optimizedBytes=await fs.readFile(picture.destination);await fs.writeFile(path.join(duplicateSource,"already-optimized.jpg"),optimizedBytes);
  const duplicateScan=await json("/api/scans",{path:duplicateSource}),duplicateTask=await taskFromScan(duplicateScan),duplicate=duplicateTask.entries[0];
  assert.equal(duplicate.status,"duplicate",duplicate.reason);assert.ok(duplicate.actual_params.skipped);
  assert.equal(hash(await fs.readFile(duplicate.destination)),hash(optimizedBytes));
  await page.evaluate(id=>openTask(id),duplicateTask.id);
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   await open(duplicate);
   assert.equal(await page.locator("#detail-parameters-title").textContent(),lang==="en"?"Task settings":"任务设置");
   assert.match(await page.locator("#detail-parameters-note").textContent(),lang==="en"?/No encoding was repeated/:/未再次编码/);
   assert.equal(await page.locator('#detail-parameters [data-param-key="encoder"]').count(),0,"duplicate settings do not invent an encoder run");
   await page.locator("#detail-raw summary").click();
   const actual=JSON.parse(await page.locator("#detail-params").textContent());assert.equal(actual.skipped,duplicate.actual_params.skipped);
   assert.deepEqual(JSON.parse(await page.locator("#detail-task-settings").textContent()),duplicateTask.params);
   await close(true);
  }
  report.checks.push("real optimized output re-imported with identical parameters is duplicate; both locales show task settings and no repeated encoding, while raw records preserve the skipped marker");
  // A genuinely resized result must become the original again after backup restore.
  const restoreSource=path.join(source,"restore");await fs.mkdir(restoreSource);const restorePath=path.join(restoreSource,"restorable.jpg");await fs.writeFile(restorePath,jpg);
  const restoreScan=await json("/api/scans",{path:restoreSource}),backupTask=await taskFromScan(restoreScan,{preset:"balanced",max_width:320,mode:"backup",output:null,backup:path.join(run,"backups")}),backed=backupTask.entries[0];
  assert.equal(backed.status,"success",backed.reason);assert.equal(backed.result_info.width,320);
  assert.equal(hash(await fs.readFile(backed.backup)),hash(jpg));assert.notEqual(hash(await fs.readFile(restorePath)),hash(jpg));
  const restoredTask=await json("/api/tasks/"+backupTask.id+"/restore",{entry_id:backed.id}),restored=restoredTask.entries[0];
  assert.equal(restored.status,"restored",restored.reason);assert.equal(restored.result_size,jpg.length);assert.deepEqual(restored.result_info,restored.info);
  assert.equal(hash(await fs.readFile(restorePath)),hash(jpg));assert.equal(hash(await fs.readFile(backed.backup)),hash(jpg));
  await page.evaluate(id=>openTask(id),restoredTask.id);
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   await open(restored);
   assert.equal(await page.locator("#detail-parameters-title").textContent(),lang==="en"?"Original processing parameters":"原处理参数");
   assert.match(await page.locator("#detail-parameters-note").textContent(),lang==="en"?/restored.*before restoration/:/已恢复.*恢复前/);
   assert.equal(await page.locator("#preview-grid .preview-card h3").last().textContent(),lang==="en"?"Current file (restored)":"当前文件（已恢复）");
   assert.equal(await page.locator('#detail-summary [data-detail-stat="result"] dd').textContent(),await page.evaluate(n=>size(n),jpg.length));
   assert.match(await page.locator('#detail-summary [data-detail-stat="saved"] dd').textContent(),/^0 B/);
   await page.waitForFunction(()=>document.querySelectorAll("#preview-grid img").length===2&&[...document.querySelectorAll("#preview-grid img")].every(image=>image.complete&&image.naturalWidth>0));
   for(const href of await page.locator("#preview-grid img").evaluateAll(images=>images.map(image=>image.src))){
    const response=await fetch(href,{headers:{"X-MediaSlimX-Token":token}});assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(jpg),"restored original/result previews both serve original bytes");
   }
   await page.locator("#detail-raw summary").click();
   const metadata=JSON.parse(await page.locator("#detail-metadata").textContent()),recorded=JSON.parse(await page.locator("#detail-params").textContent());
   assert.deepEqual(metadata.original,restored.info);assert.deepEqual(metadata.result,restored.info);
   assert.deepEqual(recorded,backed.actual_params);assert.equal(recorded.size[0],320,"historical encoder dimensions remain separate from current restored dimensions");
   await close();
  }
  report.checks.push("real backup, proportional resize and restore recover original bytes; both locales distinguish current restored previews/metadata/zero savings from original processing parameters, and backups remain intact");
  if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.click("#language-toggle");
  await page.evaluate(id=>openTask(id),task.id);await open(picture);await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid img")].every(image=>image.complete&&image.naturalWidth>0));await delay(270);
  await page.screenshot({path:path.join(run,"detail-readable-desktop.png")});await close();
  await page.setViewportSize({width:390,height:844});await open(picture);await delay(270);await page.screenshot({path:path.join(run,"detail-readable-mobile.png")});await close();
  assert.deepEqual(report.errors,[]);await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({platform,evidence:run,checks:report.checks,layouts:report.layouts.length,errors:report.errors},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
