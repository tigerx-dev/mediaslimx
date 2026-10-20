/* PDF UI/import/export checks use generated private fixtures and an isolated service.
   No user task, source directory or running service is changed. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-pdf-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 await fs.mkdir(source,{recursive:true});
 const generate="from pathlib import Path; import sys,pikepdf; from PIL import Image; root=Path(sys.argv[1]); (root/'downloads').mkdir(); (root/'images').mkdir(); pdf=pikepdf.Pdf.new(); page=pdf.add_blank_page(page_size=(500,700)); page.Contents=pdf.make_stream(b'q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\\n'*1500); pdf.save(root/'downloads'/'guide.pdf',compress_streams=False,object_stream_mode=pikepdf.ObjectStreamMode.disable); pdf.close(); Image.new('RGB',(640,480),'red').save(root/'images'/'photo.jpg',quality=100)";
 await new Promise((resolve,reject)=>{const child=spawn(python,["-X","utf8","-c",generate,source],{cwd:project,stdio:["ignore","ignore","pipe"]});let error="";child.stderr.on("data",d=>error+=d);child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(Error(error||"PDF fixture generation failed")));});
 const target=path.join(source,"downloads","guide.pdf"),original=await fs.readFile(target),jpg=await fs.readFile(path.join(source,"images","photo.jpg"));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],errors:[],layouts:[]},hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
 async function api(route,body){return fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});}
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url);assert.equal((await (await api("/api/environment")).json()).pdf,true);
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  assert.match(await page.locator("#import-file-input").getAttribute("accept"),/\.pdf/i);
  await page.locator("#import-file-input").setInputFiles({name:"guide.pdf",mimeType:"application/pdf",buffer:original});
  await page.waitForFunction(()=>state.scan?.entries.length===1&&!importState.busy,{},{timeout:60000});
  assert.equal(await page.evaluate(()=>state.scan.entries[0].kind),"document");
  assert.equal(await page.evaluate(()=>state.scan.entries[0].info.pages),1);
  async function assertControls(disabled){
   assert.equal(await page.locator('input[name="preset"]').evaluateAll(nodes=>nodes.every(node=>node.matches(":disabled"))),disabled,"quality controls must match PDF-only selection");
   assert.equal(await page.locator("#resize-fit").isDisabled(),disabled,"resize choices must match PDF-only selection");
   assert.equal(await page.locator("#max-width").isDisabled(),disabled||await page.locator("#resize-keep").isChecked(),"width control follows the effective image/PDF resize mode");
  }
  await assertControls(true);assert.equal(await page.locator("#mode").inputValue(),"export");
  assert.equal(await page.locator("#backup-toggle-field").isVisible(),false);
  assert.doesNotMatch(await page.locator("#scan-body").textContent(),/undefined|NaN/);
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const [width,height]of [[320,568],[390,640],[768,900],[1440,900]]){
    await page.setViewportSize({width,height});await page.click("#review-task-plan");await page.locator("#task-plan-dialog[open]").waitFor();
    const geometry=await page.locator("#task-plan-dialog").evaluate(dialog=>{const box=dialog.getBoundingClientRect(),content=dialog.querySelector(".task-plan-content");return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,overflow:content.scrollWidth-content.clientWidth,text:dialog.textContent};});
    assert.ok(geometry.left>=0&&geometry.right<=width+1&&geometry.top>=0&&geometry.bottom<=height+1);
    assert.ok(geometry.overflow<=1);assert.match(geometry.text,/PDF/);assert.doesNotMatch(geometry.text,/undefined|NaN/);
    report.layouts.push({lang,width,height});await page.keyboard.press("Escape");
   }
  }
  report.checks.push("PDF imports default to export, expose pages, and disable ineffective quality/resize controls; bilingual plan fits four viewport sizes without invalid dimensions");
  await page.setViewportSize({width:1440,height:900});
  await page.locator("#import-file-input").setInputFiles({name:"photo.jpg",mimeType:"image/jpeg",buffer:jpg});
  await page.waitForFunction(()=>state.scan?.entries.length===2&&!importState.busy,{},{timeout:60000});await assertControls(false);
  await page.locator("#resize-fit").check();await page.fill("#max-width","320");await assertControls(false);
  async function chooseFormat(format){
   const index=await page.locator("#selection-type").evaluate((select,value)=>[...select.options].findIndex(option=>option.value===value),format);assert.ok(index>0);
   await page.click("#selection-type-trigger");await page.click("#selection-type-option-"+index);
  }
  await chooseFormat("PDF");await assertControls(true);
  assert.deepEqual(await page.evaluate(()=>state.scan.entries.filter(entry=>state.selected.has(entry.id)).map(entry=>entry.info.format)),["PDF"]);
  assert.equal(await page.locator("#scan-body tr").count(),2,"type selection leaves other rows visible");
  await chooseFormat("JPEG");await assertControls(false);await chooseFormat("PDF");
  report.checks.push("mixed import enables image controls; PDF/JPG-only selection updates checkmarks and controls without hiding files");
  async function startTask(){
   const created=page.waitForResponse(response=>response.url()===base+"/api/tasks"&&response.request().method()==="POST");
   await page.click("#start-button");const response=await created;assert.ok(response.ok(),"task creation failed: "+await response.text());
   const submitted=response.request().postDataJSON();assert.equal(typeof submitted.preset,"string","disabled PDF quality fieldset must still submit a valid preset value");
   if(await page.evaluate(()=>state.scan.entries.filter(entry=>state.selected.has(entry.id)).every(entry=>entry.kind==="document"))){assert.equal(submitted.max_width,null);assert.equal(submitted.max_height,null);}
   await page.waitForFunction(()=>state.task?.status==="completed",{},{timeout:60000});
  }
  await page.fill("#output-path",path.join(run,"exports"));await startTask();
  const task=await page.evaluate(()=>state.task),entry=task.entries[0];assert.equal(task.entries.length,1);assert.equal(entry.kind,"document");assert.equal(entry.status,"success",entry.reason);
  assert.ok(entry.result_size<entry.size);assert.equal(hash(await fs.readFile(target)),hash(original));
  await page.locator("#result-body tr button").first().click();await page.locator("#detail-dialog[open]").waitFor();
  assert.equal(await page.locator("#preview-grid img,#preview-grid video,#preview-grid iframe,#preview-grid object,#preview-grid embed").count(),0,"PDF is never embedded in the service origin");
  const links=page.locator('#preview-grid a[download]');assert.equal(await links.count(),2);
  for(const slot of ["original","result"]){
   const anchor=page.locator('#preview-grid a[href$="/'+slot+'"]');const href=await anchor.getAttribute("href");
   const response=await api(href);assert.equal(response.status,200);assert.match(response.headers.get("content-disposition"),/^attachment/i);assert.equal(response.headers.get("x-content-type-options"),"nosniff");
   const body=Buffer.from(await response.arrayBuffer());assert.equal(hash(body),slot==="original"?hash(original):entry.result_fp.sha256);
   const event=page.waitForEvent("download");await anchor.click();const download=await event;assert.equal(await download.failure(),null);const destination=path.join(run,slot+"-download.pdf");await download.saveAs(destination);assert.equal(hash(await fs.readFile(destination)),hash(body));
  }
  await page.screenshot({path:path.join(run,"pdf-details.png")});await page.click("#close-detail");
  const csvEvent=page.waitForEvent("download");await page.click("#export-report");const csvDownload=await csvEvent;const csvPath=path.join(run,"report.csv");await csvDownload.saveAs(csvPath);const csv=await fs.readFile(csvPath,"utf8");assert.match(csv,/guide\.pdf/);assert.match(csv,/document/);assert.ok(!csv.includes(source));
  assert.equal(await page.locator("#download-import").isVisible(),true);
  report.checks.push("selected PDF genuinely shrinks while original stays unchanged; details offer authenticated attachment downloads only with nosniff and exact hashes; actual CSV download uses relative paths");
  await page.click("#new-task");await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  await chooseFormat("PDF");await assertControls(true);
  assert.equal(await page.locator('#mode option[value="overwrite"]').isDisabled(),true);
  await page.click("#mode-trigger");assert.equal(await page.locator("#mode-option-2").isDisabled(),true);await page.keyboard.press("Escape");
  async function chooseMode(index){await page.click("#mode-trigger");await page.click("#mode-option-"+index);}
  await chooseMode(1);assert.equal(await page.locator("#mode").inputValue(),"backup");await chooseMode(0);
  await chooseFormat("JPEG");await assertControls(false);assert.equal(await page.locator('#mode option[value="overwrite"]').isDisabled(),false);
  await chooseMode(2);assert.equal(await page.locator("#mode").inputValue(),"overwrite");
  await page.click("#select-all");assert.ok(await page.locator("#mode").inputValue()!=="overwrite"||await page.locator("#start-button").isDisabled(),"adding a PDF must block an unsafe overwrite mode");
  const scan=await page.evaluate(()=>state.scan),document=scan.entries.find(item=>item.kind==="document");
  const unsafe=await api("/api/tasks",{scan_id:scan.id,selected:[document.id],mode:"overwrite",confirm:true});assert.equal(unsafe.status,400);assert.match((await unsafe.json()).detail,/PDF/);
  assert.equal(hash(await fs.readFile(target)),hash(original));
  await chooseFormat("PDF");await chooseMode(1);await page.fill("#backup-path",path.join(run,"backups"));
  await startTask();
  const backupTask=await page.evaluate(()=>state.task),backed=backupTask.entries[0];assert.equal(backed.status,"success",backed.reason);assert.equal(hash(await fs.readFile(backed.backup)),hash(original));assert.ok((await fs.readFile(target)).length<original.length);
  const confirmation=page.waitForEvent("dialog"),click=page.click("#restore-all");const prompt=await confirmation;await prompt.accept();await click;
  await page.waitForFunction(()=>state.task?.entries[0]?.status==="restored",{},{timeout:30000});assert.equal(hash(await fs.readFile(target)),hash(original));
  report.checks.push("directory PDFs allow export or backup; unsafe overwrite is disabled in both controls and backend, JPEG-only compatibility remains, adding PDF blocks unsafe start; actual backup and restore preserve original bytes");
  assert.deepEqual(report.errors,[]);await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,evidence:run,...report},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
