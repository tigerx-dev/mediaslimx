/* Isolated browser-file import test; no mutation of the user's history/media. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(project,".test-media");
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
  const allocation=await json("/api/imports",{files:[{name:"auth.jpg",size:jpg.length}]}),route="/api/imports/"+allocation.id+"/files/"+allocation.files[0].id;
  async function put(body,headers={}){return fetch(base+route,{method:"PUT",headers:{"X-MediaSlimX-Token":token,"Content-Type":"application/octet-stream",...headers},body});}
  assert.equal((await put(jpg,{"X-MediaSlimX-Token":"wrong"})).status,401);
  assert.equal((await put(jpg,{Origin:"https://evil.example"})).status,403);
  assert.equal((await put(jpg,{"Content-Type":"text/plain"})).status,415);
  assert.equal((await put(Buffer.from("incomplete"))).status,400);
  assert.equal((await put(jpg)).status,200);assert.equal((await put(jpg)).status,400);
  await json("/api/imports/"+allocation.id+"/discard",{});
  assert.equal((await api("/api/imports",{files:[{name:"../escape.jpg",size:10}]})).status,400);
  report.checks.push("binary upload requires token, same origin, correct content type and exact declared size; cannot replace completed bytes");

  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  const requests=[];page.on("request",request=>requests.push(request.url()));
  async function drop(files){await page.evaluate(files=>{const transfer=new DataTransfer();for(const f of files)transfer.items.add(new File([new Uint8Array(f.bytes)],f.name));window.dispatchEvent(new DragEvent("dragenter",{dataTransfer:transfer,bubbles:true,cancelable:true}));window.dispatchEvent(new DragEvent("drop",{dataTransfer:transfer,bubbles:true,cancelable:true}));},files);}
  await drop([{name:"照片.jpg",bytes:[...jpg]},{name:"sample.mp4",bytes:[...video]}]);
  await page.waitForFunction(()=>document.querySelectorAll("#scan-body tr").length===2&&!document.querySelector("#add-import-files").disabled);
  assert.equal(await page.locator("#mode").inputValue(),"export");assert.equal(await page.locator("#mode-trigger").isVisible(),false);
  assert.equal(await page.locator("#import-export-note").isVisible(),true);
  assert.match(await page.locator("#scan-body").textContent(),/JPG|JPEG/);
  assert.match(await page.locator("#scan-body").textContent(),/MP4/);
  await page.locator("#import-file-input").setInputFiles({name:"照片.jpg",mimeType:"image/jpeg",buffer:jpg});
  await page.waitForFunction(()=>document.querySelectorAll("#scan-body tr").length===3&&!document.querySelector("#add-import-files").disabled);
  assert.match(await page.locator("#scan-body").textContent(),/照片 \(2\).jpg/);
  await drop([{name:"unsupported.gif",bytes:[1,2,3]}]);await page.locator("#message:not([hidden])").waitFor();assert.match(await page.locator("#message").textContent(),/暂不支持/);
  const scanned=await page.evaluate(()=>state.scan),beforeSource=await fs.readFile(path.join(source,"images","landscape.jpg"));
  assert.equal((await api("/api/tasks",{scan_id:scanned.id,selected:[scanned.entries[0].id],mode:"overwrite",confirm:true})).status,400);
  assert.equal((await api("/api/tasks",{scan_id:scanned.id,selected:[scanned.entries[0].id],mode:"backup",backup:path.join(run,"backup")})).status,400);
  report.checks.push("real JPG/MP4 drop and file picker populate pending list, duplicate names retained, unsupported files explained, export-only enforced by API");

  await page.click("#start-button");
  await page.waitForFunction(()=>state.task&&state.task.status==="completed");
  const task=await page.evaluate(()=>state.task);
  assert.equal(task.mode,"export");assert.equal(task.entries.length,3);assert.ok(task.entries.every(e=>["success","no_gain"].includes(e.status)),JSON.stringify(task.entries));
  assert.match(await page.locator("#history").textContent(),/文件导入 · 3 项/);
  await page.locator("#result-body button").first().click();await page.locator("#detail-dialog[open]").waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid img")].every(i=>i.complete&&i.naturalWidth>0));
  assert.match(await page.locator("#preview-grid").textContent(),/导入原始副本/);await page.click("#close-detail");
  const downloading=page.waitForEvent("download");await page.click("#download-import");const download=await downloading;const package=path.join(run,"export.zip");await download.saveAs(package);assert.equal(await download.failure(),null);
  const inspected=spawn(python,["-c","import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert set(z.namelist())=={'照片.jpg','照片 (2).jpg','sample.mp4','report.csv'}; assert all('..' not in n for n in z.namelist()); print('ZIP entries verified')",package],{stdio:["ignore","pipe","pipe"]});
  let zipError="";inspected.stderr.on("data",d=>zipError+=d);assert.equal(await new Promise(r=>inspected.on("close",r)),0,zipError);
  const oldTransform=await page.locator(".list-pin svg").first().evaluate(n=>getComputedStyle(n).transform);
  await page.locator(".list-pin").first().click();await page.waitForFunction(()=>document.querySelector(".list-pin")?.getAttribute("aria-pressed")==="true");await delay(300);
  const pin=await page.locator(".list-pin").first().evaluate(n=>({background:getComputedStyle(n).backgroundColor,transform:getComputedStyle(n.querySelector("svg")).transform,svg:n.querySelector("svg").getBoundingClientRect().width,hit:n.getBoundingClientRect().width}));
  assert.notEqual(pin.transform,oldTransform);assert.equal(pin.background,"rgba(0, 0, 0, 0)");assert.ok(pin.svg<=15&&pin.hit>=44);
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();await page.locator("#history .history-item").first().click();
  await page.locator("#download-import").waitFor();assert.match(await page.locator("#result-root").textContent(),/文件导入/);
  assert.deepEqual(await fs.readFile(path.join(source,"images","landscape.jpg")),beforeSource);
  assert.ok(requests.every(u=>u.startsWith(base+"/")),"unexpected external request: "+requests.filter(u=>!u.startsWith(base+"/")));
  report.checks.push("completed task exports downloadable JPG/MP4/CSV ZIP, preview and history survive page reload; source unchanged; all browser requests stay on same service");
  report.checks.push("pin changes from tilted to upright, 14px transparent icon keeps >=44px click area");
  await page.screenshot({path:path.join(run,"results.png")});

  await page.click("#new-task");
  let held=false;await page.route("**/api/imports/*/files/*",async route=>{held=true;await delay(800);try{await route.abort();}catch{}});
  await drop([{name:"cancel.jpg",bytes:[...jpg]}]);
  for(let i=0;i<50&&!held;i++)await delay(100);assert.ok(held);
  await page.click("#cancel-import");await page.waitForFunction(()=>!document.querySelector("#add-import-files").disabled);
  assert.equal(await page.locator("#start-button").isDisabled(),true);
  assert.match(await page.locator("#import-notice").textContent(),/已取消/);await page.unrouteAll({behavior:"wait"});
  await page.click("#clear-import");await page.locator("#scan-form").waitFor();
  await drop([{name:"clean.jpg",bytes:[...jpg]}]);await page.waitForFunction(()=>document.querySelectorAll("#scan-body tr").length===1&&!document.querySelector("#add-import-files").disabled);
  const pending=await page.evaluate(()=>state.scan.import_id);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:700});await delay(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   for(const id of ["add-import-files","clear-import","back-directory"])assert.equal(await page.locator("#"+id).isVisible(),true);
  }
  await page.setViewportSize({width:390,height:700});await page.screenshot({path:path.join(run,"import-mobile.png")});
  await page.click("#clear-import");assert.equal((await api("/api/imports/"+pending+"/scan",{})).status,400);
  assert.equal((await json("/api/tasks")).length,1);assert.equal(await page.locator("#scan-form").isVisible(),true);
  report.checks.push("cancel leaves no selectable incomplete file, clear removes unused copies without task deletion; imported controls fit 320/390/768/1440");
  await drop([{name:"orphan.jpg",bytes:[...jpg]}]);await page.waitForFunction(()=>document.querySelectorAll("#scan-body tr").length===1&&!document.querySelector("#add-import-files").disabled);
  const orphan=await page.evaluate(()=>state.scan.import_id);
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();await page.locator("#clear-unused-imports").waitFor();
  const dismissed=new Promise(resolve=>page.once("dialog",async d=>{await d.dismiss();resolve();}));await page.click("#clear-unused-imports");await dismissed;assert.ok((await json("/api/imports/unused")).some(b=>b.id===orphan));
  const accepted=new Promise(resolve=>page.once("dialog",async d=>{await d.accept();resolve();}));await page.click("#clear-unused-imports");await accepted;await page.locator("#clear-unused-imports").waitFor({state:"hidden"});
  assert.equal((await api("/api/imports/"+orphan+"/scan",{})).status,400);
  assert.equal((await json("/api/tasks")).length,1);
  assert.equal((await api("/api/tasks/"+task.id+"/preview/"+task.entries[0].id+"/original")).status,200);
  report.checks.push("page reload exposes orphan cleanup; dismiss is inert, confirm deletes unused copies while history originals remain available");
  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,...report},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});