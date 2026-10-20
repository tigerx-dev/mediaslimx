/* Real type-selection, anchored disclosure and reduced-motion checks.
   Private synthetic media and isolated service; no user records are changed. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-selection-motion-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 await fs.mkdir(path.join(source,"images"),{recursive:true});
 const original=await fs.readFile(path.join(project,".test-media","images","landscape.jpg"));
 const target=path.join(source,"images","sample.jpg");await fs.writeFile(target,original);
 const png=await fs.readFile(path.join(project,".test-media","images","alpha.png"));
 const webp=await fs.readFile(path.join(project,".test-media","images","static.webp"));
 const video=await fs.readFile(path.join(project,".test-media","video","sample.mp4"));
 await fs.writeFile(path.join(source,"images","alias.jpeg"),original);
 await fs.writeFile(path.join(source,"images","alpha.png"),png);
 await fs.writeFile(path.join(source,"images","static.webp"),webp);
 await fs.writeFile(path.join(source,"images","sample.mp4"),video);
 await fs.writeFile(path.join(source,"images","broken.jpg"),"damaged synthetic file");
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],errors:[]};
 async function api(route,body,headers={}){return fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url);




  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{
   window.motionCalls=[];const original=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){window.motionCalls.push({id:this.id,className:this.className,frames,options});return original.call(this,frames,options);};
  });
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  await page.locator("#import-file-input").setInputFiles([
   {name:"a.jpg",mimeType:"image/jpeg",buffer:original},
   {name:"b.jpeg",mimeType:"image/jpeg",buffer:original},
   {name:"alpha.png",mimeType:"image/png",buffer:png},
   {name:"broken.jpg",mimeType:"image/jpeg",buffer:Buffer.from("damaged synthetic file")}
  ]);
  await page.waitForFunction(()=>state.scan?.entries.length===4&&!importState.busy);
  const selected=()=>page.evaluate(()=>state.scan.entries.filter(e=>state.selected.has(e.id)).map(e=>e.info.format));
  const motionCount=()=>page.evaluate(()=>motionCalls.length);
  assert.equal(await motionCount(),1);
  await page.click("#selection-type-trigger");
  assert.equal(await page.locator("#selection-type-option-3").isDisabled(),true);
  assert.equal(await page.locator("#selection-type-option-4").isDisabled(),true);
  await page.keyboard.press("Home");await page.keyboard.press("Enter");
  assert.deepEqual(await selected(),["JPEG","JPEG"]);
  assert.equal(await page.locator("#scan-body tr").count(),4,"selection must not hide other rows");
  const jpegCheck=page.locator("#scan-body input[type=checkbox]:checked").first();
  await jpegCheck.uncheck();assert.equal(await page.locator("#selection-type").inputValue(),"");
  assert.equal(await page.evaluate(()=>state.selected.size),1);
  await page.click("#selection-type-trigger");await page.keyboard.press("End");await page.keyboard.press("Enter");
  assert.deepEqual(await selected(),["PNG"],"End skips disabled MP4/WebP");
  await page.click("#select-none");assert.equal(await page.locator("#start-button").isDisabled(),true);
  await page.click("#select-all");assert.equal(await page.evaluate(()=>state.selected.size),3);
  assert.equal(await page.locator("#scan-body input[disabled]").isChecked(),false);
  assert.equal(await motionCount(),1,"selection must not replay workflow motion");
  report.checks.push("JPG includes JPEG alias; selection changes checkmarks only; damaged media stays disabled; manual/all/none work; keyboard skips missing formats");
  await page.locator("#import-file-input").setInputFiles([
   {name:"static.webp",mimeType:"image/webp",buffer:webp},{name:"sample.mp4",mimeType:"video/mp4",buffer:video}
  ]);
  await page.waitForFunction(()=>state.scan?.entries.length===6&&!importState.busy);
  assert.equal(await motionCount(),1,"append must not replay workflow motion");
  for(const [index,format]of [[1,"JPEG"],[2,"PNG"],[3,"WEBP"],[4,"MP4"]]){
   await page.click("#selection-type-trigger");await page.click("#selection-type-option-"+index);
   const formats=await selected();assert.ok(formats.length&&formats.every(f=>f.toUpperCase()===format));
  }
  await page.click("#language-toggle");
  await page.click("#selection-type-trigger");assert.match(await page.locator("#selection-type-options").textContent(),/JPG only/);await page.keyboard.press("Escape");
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"),"en");
  await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  async function geometry(width,height){
   await page.setViewportSize({width,height});await delay(200);
   const gap=await page.evaluate(()=>{
    const h=document.querySelector("#scan-section th:first-child").getBoundingClientRect();
    return Math.max(...[...document.querySelectorAll("#scan-body input[type=checkbox]")].map(n=>{const r=n.getBoundingClientRect();return Math.abs((r.left+r.right-h.left-h.right)/2);}));
   });
   assert.ok(gap<1,"checkbox column center mismatch at "+width);
   await page.click("#selection-type-trigger");await delay(260);
   const r=await page.locator("#selection-type-options").boundingBox();
   assert.ok(r.x>=0&&r.x+r.width<=width+1&&r.y>=0&&r.y+r.height<=height+1);
   await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"selection-type-trigger");
  }
  for(const lang of ["en","zh-CN"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const size of [[320,568],[390,640],[768,900],[1001,640],[1440,900]])await geometry(...size);
   for(const width of [1001,1440]){
    await page.setViewportSize({width,height:900});await page.locator(".environment").evaluate(n=>n.open=false);await delay(50);
    const icon=page.locator(".environment>summary>.icon"),before=await icon.boundingBox(),x=before.x+before.width/2,y=before.y+before.height/2;
    await page.mouse.click(x,y);await page.waitForFunction(()=>document.querySelector(".environment").open);await delay(180);
    const after=await icon.boundingBox();
    assert.ok(Math.abs(after.x+after.width/2-x)<.5&&Math.abs(after.y+after.height/2-y)<.5,"disclosure arrow moved");
    await page.mouse.click(x,y);await page.waitForFunction(()=>!document.querySelector(".environment").open);
    const summary=page.locator(".environment>summary");await summary.focus();await page.keyboard.press("Space");await page.waitForFunction(()=>document.querySelector(".environment").open);
    await page.keyboard.press("Space");await page.waitForFunction(()=>!document.querySelector(".environment").open);
   }
  }
  report.checks.push("two locales/five widths: centered checkbox column, type menu inside viewport with Escape focus; disclosure arrow remains anchored and same-coordinate click closes; Space toggles");
  await page.setViewportSize({width:1440,height:900});
  await page.locator(".environment").evaluate(n=>n.open=true);await delay(240);
  await page.screenshot({path:path.join(run,"selection-environment.png")});await page.locator(".environment").evaluate(n=>n.open=false);
  await page.click("#selection-type-trigger");await page.click("#selection-type-option-1");
  const chosen=await page.evaluate(()=>[...state.selected]);assert.equal(chosen.length,2);
  await page.fill("#output-path",path.join(run,"exports"));
  const request=page.waitForRequest(r=>r.url()===base+"/api/tasks"&&r.method()==="POST");
  await page.click("#start-button");assert.deepEqual((await request).postDataJSON().selected,chosen);
  await page.waitForFunction(()=>state.task?.status==="completed",{},{timeout:60000});
  const entries=await page.evaluate(()=>state.task.entries);
  assert.deepEqual(entries.filter(e=>e.result_fp).map(e=>e.id).sort(),chosen.slice().sort());
  assert.ok(entries.filter(e=>!chosen.includes(e.id)).every(e=>["failed","unsupported"].includes(e.status)&&!e.result_fp&&!e.elapsed),"unselected formats must not be encoded");
  const count=await motionCount();await page.evaluate(()=>openTask(state.task.id));assert.equal(await motionCount(),count,"completed-task refresh must not replay entry");
  assert.deepEqual(await fs.readFile(target),original);
  report.checks.push("real export submits only the two JPG/JPEG IDs; result refresh does not replay motion; originals unchanged");
  await page.emulateMedia({reducedMotion:"reduce"});await delay(30);
  const reducedBefore=await motionCount();await page.click("#new-task");await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  assert.equal(await motionCount(),reducedBefore,"reduced motion starts no WAAPI transition");
  await page.locator(".environment").evaluate(n=>n.open=true);
  assert.ok(parseFloat(await page.locator(".environment-overview").evaluate(n=>getComputedStyle(n).animationDuration))<=.001);
  await page.click("#selection-type-trigger");await page.keyboard.press("Home");await page.keyboard.press("Enter");assert.deepEqual(await selected(),["JPEG","JPEG"]);
  report.checks.push("reduced-motion removes workflow/disclosure animation while selection and keyboard behavior remain available");
  const beforeFailedImport=await page.evaluate(()=>state.scan.id);
  await page.evaluate(()=>importFiles([new File(["x"],"not-media.txt")]));
  assert.equal(await page.evaluate(()=>state.scan.id),beforeFailedImport);
  assert.equal(await page.locator("#mode-trigger").isDisabled(),false,"failed import must re-enable directory output mode");
  report.checks.push("failed non-media import returns to the existing scan with output-mode control enabled");

  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,evidence:run,...report},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
