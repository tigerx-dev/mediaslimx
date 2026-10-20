/* Bilingual layout and interaction audit against an isolated service.
   Synthetic source media stays unchanged; long paths/cleanup feedback use DOM-only fixtures. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-backup-workflow-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 await fs.mkdir(path.join(source,"images"),{recursive:true});
 const original=await fs.readFile(path.join(project,".test-media","images","landscape.jpg"));
 const target=path.join(source,"images","sample.jpg");await fs.writeFile(target,original);
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
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  await page.locator("#import-file-input").setInputFiles({name:"drop.jpg",mimeType:"image/jpeg",buffer:original});
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&!importState.busy);
  const imported=await page.evaluate(()=>({id:state.scan.id,selected:[...state.selected]}));
  assert.equal(await page.locator("#mode").inputValue(),"export");
  assert.equal(await page.locator("#backup-toggle-field").isVisible(),false);
  await page.click("#import-to-backup");await page.locator("#choose-folder:not([disabled])").waitFor();
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(()=>({id:state.scan.id,selected:[...state.selected]})),imported);
  assert.deepEqual(await fs.readFile(target),original);
  report.checks.push("import remains export-only; cancelling original-folder chooser preserves pending import and originals");
  await page.click("#import-to-backup");await page.locator("#choose-folder:not([disabled])").waitFor();await page.click("#choose-folder");
  await page.waitForFunction(()=>state.scan&&state.scan.source_kind!=="import");
  assert.equal(await page.locator("#mode").inputValue(),"backup");
  assert.equal(await page.locator("#backup-in-place").isChecked(),true);
  assert.equal(await page.locator("#backup-field").isVisible(),true);
  assert.deepEqual(await fs.readFile(target),original);
  // The checkbox and select share the same existing backend mode.
  await page.uncheck("#backup-in-place");assert.equal(await page.locator("#mode").inputValue(),"export");
  await page.check("#backup-in-place");
  const backup=path.join(run,"backups");await page.fill("#backup-path",backup);
  await page.click("#language-toggle");
  assert.match(await page.locator("#backup-toggle-field").textContent(),/Back up originals/);
  assert.equal(await page.locator("#mode").inputValue(),"backup");
  await page.click("#start-button");await page.waitForFunction(()=>state.task?.status==="completed",{},{timeout:60000});
  const task=await page.evaluate(()=>state.task),entry=task.entries[0];
  assert.equal(task.mode,"backup");assert.equal(entry.status,"success");
  assert.ok(entry.backup.startsWith(backup));
  assert.deepEqual(await fs.readFile(entry.backup),original);
  assert.ok((await fs.readFile(target)).length<original.length);
  report.checks.push("explicit backup selection persists across locale change; real original copied to custom task backup before smaller result replaces source");
  const confirmation=page.waitForEvent("dialog");const click=page.click("#restore-all");const dialog=await confirmation;await dialog.accept();await click;
  await page.waitForFunction(()=>state.task?.entries[0]?.status==="restored",{},{timeout:30000});
  assert.deepEqual(await fs.readFile(target),original);
  assert.deepEqual(await fs.readFile(entry.backup),original);
  await page.click("#new-task");assert.equal(await page.locator("#mode").inputValue(),"export");
  report.checks.push("real restore recovers original bytes and retains task backup; new task safely defaults to export");
  // Browser-owned file metadata simulates the 201-file boundary without upload.
  let importPosts=0;page.on("request",r=>{if(r.url()===base+"/api/imports"&&r.method()==="POST")importPosts++;});
  await page.evaluate(()=>importFiles(Array.from({length:201},(_,i)=>new File(["x"],i+".jpg",{type:"image/jpeg"}))));
  assert.equal(importPosts,0);
  assert.match(await page.locator("#guidance-detail").textContent(),/200/);
  await page.locator("#guidance-scan").click();await page.locator("#choose-folder:not([disabled])").waitFor();await page.click("#choose-folder");
  await page.waitForFunction(()=>state.scan&&state.scan.source_kind!=="import");
  assert.equal(await page.locator("#mode").inputValue(),"export");
  report.checks.push("201-file metadata boundary fails before upload and offers working folder-scan action; folder scanning defaults to export");
  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({platform,evidence:run,...report},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
