/* Isolated browser-file import test; no mutation of the user's history/media. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-folder-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(project,".test-media");
 await fs.mkdir(run,{recursive:true});
 const jpg=await fs.readFile(path.join(source,"images","landscape.jpg")),video=await fs.readFile(path.join(source,"video","sample.mp4"));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],errors:[]};
 async function api(route,body,headers={}){return fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
 async function json(route,body){const r=await api(route,body);assert.equal(r.status,200,route+" "+await r.clone().text());return r.json();}
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url);

  const tree=path.join(run,"输入素材");
  const names=["images/原文件.jpg","other/原文件.jpg","wide/zzz-last.jpg","video/sample.mp4",".private/secret.jpg","node_modules/dep.jpg","output/result.jpg","backup/original.jpg","mediaslimx-export/exported.jpg","project/config.py"];
  for(const name of names){const target=path.join(tree,...name.split("/"));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,name.endsWith(".mp4")?video:name.endsWith(".jpg")?jpg:Buffer.from("PRIVATE SYNTHETIC CONFIG: do not read or transfer"));}
  for(let i=0;i<105;i++)await fs.writeFile(path.join(tree,"wide",String(i).padStart(3,"0")+".txt"),"non-media");
  const expected=["输入素材/images/原文件.jpg","输入素材/other/原文件.jpg","输入素材/video/sample.mp4","输入素材/wide/zzz-last.jpg"].sort();
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  assert.equal(await page.locator("h1").textContent(),"新建任务");
  const allocations=[],external=[];page.on("request",r=>{if(r.url()===base+"/api/imports"&&r.method()==="POST")allocations.push(r.postDataJSON());if(!r.url().startsWith(base+"/"))external.push(r.url());});
  const cdp=await page.context().newCDPSession(page);
  const dragData={items:[],files:[tree],dragOperationsMask:1};
  for(const type of ["dragEnter","dragOver","drop"])await cdp.send("Input.dispatchDragEvent",{type,x:550,y:300,data:dragData});
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===4&&!importState.busy,{},{timeout:20000});
  assert.deepEqual((await page.evaluate(()=>state.scan.entries.map(e=>e.relative))).sort(),expected);
  assert.equal(allocations.length,1);assert.deepEqual(allocations[0].files.map(f=>f.relative_path).sort(),expected);
  assert.match(await page.locator("#import-notice").textContent(),/已跳过/);
  assert.equal(await page.locator("#mode").inputValue(),"export");
  report.checks.push("Chrome protocol drop reads an actual folder; hidden/dependency/output/backup/non-media items not uploaded; file after 100-entry batch retained");

  const metadata=await page.evaluate(async()=>{
   const policy=await json("/api/imports/policy"),calls=[];
   const controls={cancelled:()=>false,progress:()=>{}};
   const badDir=name=>({name,isDirectory:true,createReader(){throw Error("excluded directory enumerated");}});
   const file={name:"ok.jpg",isFile:true,file(resolve){calls.push("ok");resolve(new File(["x"],"ok.jpg"));}};
   const nonmedia={name:"config.py",isFile:true,file(){throw Error("non-media contents accessed");}};
   let batch=0;
   const root={name:"Tree",isDirectory:true,createReader(){return {readEntries(resolve){resolve(batch++===0?[badDir(".git"),badDir("node_modules"),badDir("output"),badDir("backups"),nonmedia]:batch===2?[file]:[]);}};}};
   const collected=await MSXImportTree.collectEntries([root],policy,controls);
   let stopped=false;try{await MSXImportTree.collectEntries([root],policy,{cancelled:()=>true,progress:()=>{}});}catch(e){stopped=e.name==="AbortError";}
   const many={name:"Big",isDirectory:true,createReader(){let once=false;return{readEntries(resolve){if(once)return resolve([]);once=true;resolve(Array.from({length:201},(_,i)=>({name:i+".jpg",isFile:true,file:resolve=>resolve(new File(["x"],i+".jpg"))})));}};}};
   let bounded=false;try{await MSXImportTree.collectEntries([many],policy,controls);}catch(e){bounded=e.message.includes("200");}
   return {calls,relative:collected.files.map(f=>f.relative_path),counts:collected.counts,stopped,bounded};
  });
  assert.deepEqual(metadata.calls,["ok"]);assert.deepEqual(metadata.relative,["Tree/ok.jpg"]);assert.equal(metadata.counts.excluded,3);assert.equal(metadata.counts.hidden,1);assert.equal(metadata.counts.unsupported,1);assert.ok(metadata.stopped&&metadata.bounded);
  report.checks.push("excluded directories are not enumerated, non-media File objects not requested; collection cancellation and 200-file bound enforced");

  await page.locator("#scan-body input[type=checkbox]").first().uncheck();
  const snapshot=await page.evaluate(()=>({scan:state.scan.id,selection:[...state.selected],output:document.getElementById("output-path").value}));
  await page.click("#language-toggle");await page.waitForFunction(()=>document.documentElement.lang==="en");
  assert.equal(await page.locator("h1").textContent(),"New task");
  assert.match(await page.locator("#start-button").textContent(),/Start optimization/);
  assert.deepEqual(await page.evaluate(()=>({scan:state.scan.id,selection:[...state.selected],output:document.getElementById("output-path").value})),snapshot);
  async function chinese(stage){
   const found=await page.evaluate(()=>{
    const out=[],w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())){
     const p=n.parentElement,v=n.nodeValue.trim();if(!v||!/[一-鿿]/.test(v)||!p.getClientRects().length||p.closest("[data-i18n-skip],script,style,pre,code,.metadata"))continue;
     if(/(?:\/|\\)[^ ]+/.test(v)||/\.(?:jpe?g|png|webp|mp4)$/i.test(v))continue;
     out.push({id:p.id||p.tagName,text:v});
    }return out;
   });report[stage]=found;return found;
  }
  assert.deepEqual(await chinese("untranslatedSettings"),[]);
  for(const height of [640,720,900]){
   await page.setViewportSize({width:1440,height});await delay(100);
   // A full import summary may make the main pane scroll on a short laptop.
   // Verify that the action remains reachable without horizontal overflow.
   await page.locator("#start-button").scrollIntoViewIfNeeded();
   const rect=await page.locator("#start-button").boundingBox();assert.ok(rect.y>=64&&rect.y+rect.height<=height+1,"English import start action unreachable at height "+height+": "+JSON.stringify(rect));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1440);
  }
  await page.screenshot({path:path.join(run,"english-settings.png")});
  await page.click("#language-toggle");await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");
  assert.equal(await page.locator("h1").textContent(),"新建任务");
  assert.match(await page.locator("#scan-body").textContent(),/原文件.jpg/);
  await page.click("#language-toggle");
  await page.click("#select-all");
  await page.locator("#import-folder-input").setInputFiles(tree);
  await page.waitForFunction(()=>state.scan?.entries.length===8&&!importState.busy);
  assert.deepEqual((await page.evaluate(()=>state.scan.entries.filter(e=>e.relative.includes("(2)")).length)),4);
  await page.click("#start-button");await page.waitForFunction(()=>state.task?.status==="completed");
  const task=await page.evaluate(()=>state.task);assert.equal(task.entries.length,8);assert.ok(task.entries.every(e=>["success","no_gain"].includes(e.status)),JSON.stringify(task.entries));
  assert.match(await page.locator("#history").textContent(),/File import/);
  assert.deepEqual(await chinese("untranslatedResults"),[]);
  const downloadEvent=page.waitForEvent("download");await page.click("#download-import");const download=await downloadEvent,package=path.join(run,"folder-export.zip");await download.saveAs(package);assert.equal(await download.failure(),null);
  const check=spawn(python,["-c","import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); names=z.namelist(); assert len(names)==9; assert all(n.startswith('输入素材/') or n=='report.csv' for n in names); assert not any(x in n for n in names for x in ['node_modules','.private','output/','backup/','config.py']); assert z.read('report.csv').decode('utf-8-sig').startswith('relative_path,')",package],{stdio:["ignore","pipe","pipe"]});let zipError="";check.stderr.on("data",d=>zipError+=d);assert.equal(await new Promise(r=>check.on("close",r)),0,zipError);
  const pin=page.locator(".list-pin").first();await pin.click();await page.waitForFunction(()=>document.querySelector(".list-pin").getAttribute("aria-pressed")==="true");await delay(250);
  const fixed=await pin.evaluate(n=>({fill:getComputedStyle(n.querySelector("svg")).fill,color:getComputedStyle(n.querySelector("svg")).color,bg:getComputedStyle(n).backgroundColor,transform:getComputedStyle(n.querySelector("svg")).transform}));
  assert.equal(fixed.fill,fixed.color);assert.equal(fixed.bg,"rgba(0, 0, 0, 0)");assert.equal(fixed.transform,"matrix(1, 0, 0, 1, 0, 0)");
  await page.screenshot({path:path.join(run,"english-results.png")});
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();assert.equal(await page.locator("html").getAttribute("lang"),"en");
  await page.locator("#history .history-item").first().click();await page.locator("#download-import").waitFor();
  await page.locator("#result-body button").first().click();await page.locator("#detail-dialog[open]").waitFor();
  assert.match(await page.locator("#preview-grid").textContent(),/Imported source copy/);
  await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid img")].every(i=>i.complete&&i.naturalWidth>0));await page.click("#close-detail");
  report.checks.push("folder picker appends with structure and duplicate naming; 8 real results and ZIP paths preserved; English switch retains pending selection, reload persists language; pin upright and filled without background");

  await page.click("#new-task");
  await page.fill("#media-path",path.join(source,"missing-folder"));await page.click("#scan-button");await page.locator("#message:not([hidden])").waitFor();
  assert.match(await page.locator("#message").textContent(),/does not exist/);
  await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#mode-trigger").waitFor();
  await page.click("#mode-trigger");await page.locator("#mode-options").waitFor();assert.match(await page.locator("#mode-options").textContent(),/Back up/);await page.keyboard.press("Escape");
  await page.click("#language-toggle");await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");await page.click("#mode-trigger");assert.match(await page.locator("#mode-options").textContent(),/备份后覆盖/);await page.keyboard.press("Escape");
  await page.click("#language-toggle");
  for(const width of [320,390,768,1001,1440]){
   await page.setViewportSize({width,height:900});await delay(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,"English horizontal overflow at "+width);
   const small=await page.evaluate(()=>[...document.querySelectorAll("button,a,input,select,summary")].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=="hidden").filter(n=>{const r=n.getBoundingClientRect();return r.width<43.9||r.height<43.9;}).map(n=>n.id||n.textContent));
   assert.deepEqual(small,[],"small targets at "+width);
  }
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(run,"english-mobile.png")});
  report.checks.push("English error messages and dropdown options translate; switching back restores Chinese; 320/390/768/1001/1440 no overflow with >=44px targets");

  // Changing language during an active transfer must not restart or drop it.
  await page.click("#new-task");await page.setViewportSize({width:1440,height:900});
  let held=false,releaseUpload;const uploadGate=new Promise(resolve=>releaseUpload=resolve);await page.route("**/api/imports/*/files/*",async route=>{held=true;await uploadGate;try{await route.abort();}catch{}});
  await page.locator("#import-file-input").setInputFiles({name:"cancel.jpg",mimeType:"image/jpeg",buffer:jpg});
  for(let i=0;i<50&&!held;i++)await delay(100);assert.ok(held);
  await page.click("#language-toggle");assert.equal(await page.evaluate(()=>importState.busy),true);
  await page.click("#language-toggle");assert.equal(await page.evaluate(()=>importState.busy),true);
  await page.click("#cancel-import");releaseUpload();await page.waitForFunction(()=>!importState.busy);
  assert.match(await page.locator("#import-notice").textContent(),/Remaining import cancelled/);
  assert.equal(await page.locator("#start-button").isDisabled(),true);await page.unrouteAll({behavior:"wait"});
  // Keep the UI locked until deleting a pending batch really finishes.
  const cancelledBatch=await page.evaluate(()=>importState.batch);assert.ok(cancelledBatch);
  let releaseDelete,reachedDelete;const deleteGate=new Promise(resolve=>releaseDelete=resolve),deleteReached=new Promise(resolve=>reachedDelete=resolve);
  await page.route("**/api/imports/"+cancelledBatch+"/discard",async route=>{reachedDelete();await deleteGate;await route.continue();});
  await page.click("#clear-import");await Promise.race([deleteReached,delay(5000).then(()=>{throw Error("discard request not observed");})]);
  assert.equal(await page.locator("#choose-import-files").isDisabled(),true);
  assert.equal(await page.evaluate(()=>importState.busy),true);releaseDelete();
  await page.waitForFunction(()=>!importState.busy&&!state.scan);await page.unrouteAll({behavior:"wait"});
  await page.locator("#import-file-input").setInputFiles({name:"retry.jpg",mimeType:"image/jpeg",buffer:jpg});
  await page.waitForFunction(()=>state.scan?.entries.length===1&&!importState.busy);assert.equal(await page.locator("#message").isVisible(),false);
  await page.click("#clear-import");await page.waitForFunction(()=>!importState.busy&&!state.scan);
  report.checks.push("language switching does not restart an upload; cancellation remains usable in English; pending cleanup locks source changes until completed, then reimport succeeds");

  assert.deepEqual(report.errors,[]);assert.deepEqual(external,[]);
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,...report},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
