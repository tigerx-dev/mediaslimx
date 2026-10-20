/* Record selection and full-width processing-plan regression.
   Uses a private service, private synthetic files, and a random loopback port.
   Never connects to the user's Windows/WSL instance or changes existing tasks. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-record-layout-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 const filename="ScreenShot_2026-01-11_211051_"+("Website_Original_".repeat(8))+"217.jpg",relative="images/"+filename;
 const original=await fs.readFile(path.join(project,".test-media","images","landscape.jpg"));
 await fs.mkdir(path.join(source,"images"),{recursive:true});await fs.writeFile(path.join(source,"images",filename),original);
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],layouts:[],languageProof:{plan:{},archive:{}},errors:[]};
 async function json(route,body){
  const r=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(r.status,200,route+" "+await r.clone().text());return r.json();
 }
 try{
  for(let i=0;i<150;i++){
   const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);
   if(match){token=match[1];url=match[0];try{await json("/api/environment");break;}catch{}}
   if(child.exitCode!==null)throw Error(stderr);await delay(100);
  }
  assert.ok(url,"isolated server must start");
  const scan=await json("/api/scans",{path:source}),candidate=scan.entries.find(e=>e.relative===relative);
  assert.equal(candidate.status,"ready");
  async function exportTask(){
   const task=await json("/api/tasks",{scan_id:scan.id,selected:[candidate.id],output:path.join(run,"exports")});
   for(let i=0;i<300;i++){
    const result=await json("/api/tasks/"+task.id);
    if(result.status==="completed"){
     const e=result.entries.find(e=>e.id===candidate.id);assert.ok(["success","no_gain","duplicate"].includes(e.status),e.reason);
     assert.ok((await fs.stat(e.destination)).isFile());assert.equal(path.basename(e.destination),filename);
     return result;
    }
    await delay(100);
   }
   throw Error("synthetic export did not finish");
  }
  const a=await exportTask(),b=await exportTask();
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on("pageerror",e=>report.errors.push(e.message));let detailRequests=0;
  page.on("request",r=>{if(r.method()==="GET"&&new RegExp("^"+base.replaceAll(".","\\.")+"/api/tasks/[^/]+$").test(r.url()))detailRequests++;});
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  await page.locator('[data-task-id="'+b.id+'"]').click();
  await page.waitForFunction(id=>state.task?.id===id,b.id);
  const loaded=detailRequests;
  const pinA=page.locator('[data-pin-id="'+a.id+'"]');
  await pinA.click();await page.waitForFunction(id=>document.querySelector('[data-pin-id="'+id+'"]')?.getAttribute("aria-pressed")==="true",a.id);
  assert.equal(await page.evaluate(()=>state.task.id),b.id,"pinning another record does not open it");
  assert.equal(detailRequests,loaded,"pinning does not reload task details");
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.pinId),a.id,"focus returns to the re-rendered pin");
  await page.keyboard.press("Shift+Tab");await page.keyboard.press("Tab");
  await pinA.evaluate(async n=>{const row=n.closest(".history-row");getComputedStyle(row).borderLeftColor;await Promise.all(row.getAnimations().map(a=>a.finished.catch(()=>{})));});
  const focus=await pinA.evaluate(n=>{
   const row=n.closest(".history-row"),s=getComputedStyle(row),h=document.querySelector("#history").getBoundingClientRect(),r=row.getBoundingClientRect();
   return {visible:n.matches(":focus-visible"),overflow:s.overflow,border:s.borderColor,focus:getComputedStyle(row).getPropertyValue("--focus").trim(),outline:getComputedStyle(n).outlineStyle,outlineColor:getComputedStyle(n).outlineColor,inHistory:r.left>=h.left-.5&&r.right<=h.right+.5};
  });
  assert.equal(focus.visible,true);assert.equal(focus.overflow,"visible");assert.notEqual(focus.outline,"none");assert.equal(focus.border,focus.outlineColor,"whole-row focus boundary stays visible even beside the independent pin");assert.equal(focus.inHistory,true);
  await page.screenshot({path:path.join(run,"record-history-desktop.png")});
  report.checks.push("two real exports preserve originals; pinning another record does not open or reload it, and restores an unclipped keyboard focus indicator");
  const sizes=[[320,568],[390,640],[768,900],[1001,640],[1440,900]];
  async function historyGeometry(width,height,lang,theme){
   await page.setViewportSize({width,height});
   const item=page.locator('[data-task-id="'+b.id+'"]');await item.scrollIntoViewIfNeeded();
   const result=await item.evaluate(n=>{
    const row=n.closest(".history-row"),pin=row.querySelector(".list-pin"),r=row.getBoundingClientRect(),b=n.getBoundingClientRect(),p=pin.getBoundingClientRect(),rs=getComputedStyle(row),bs=getComputedStyle(n);
    return {rowWidth:r.width,combinedWidth:b.width+p.width,leftGap:b.left-r.left,rightGap:r.right-p.right,border:rs.borderLeftWidth,borderStyle:rs.borderLeftStyle,borderColor:rs.borderLeftColor,innerBorder:bs.borderLeftWidth,innerBackground:bs.backgroundColor,pinW:p.width,pinH:p.height,itemH:b.height,pageOverflow:document.documentElement.scrollWidth-innerWidth};
   });
   assert.ok(result.rowWidth>=result.combinedWidth&&result.rowWidth-result.combinedWidth<3,JSON.stringify(result));
   assert.ok(result.leftGap<=1.1&&result.rightGap<=1.1,"one row boundary surrounds both controls");
   assert.equal(result.borderStyle,"solid");assert.equal(result.border,"1px");
   assert.ok(!["transparent","rgba(0, 0, 0, 0)"].includes(result.borderColor));
   assert.equal(result.innerBorder,"0px");assert.ok(["transparent","rgba(0, 0, 0, 0)"].includes(result.innerBackground));
   assert.ok(result.pinW>=43.9&&result.pinH>=43.9&&result.itemH>=43.9);
   assert.ok(result.pageOverflow<=1);return {width,height,lang,theme,...result};
  }
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang){await page.click("#language-toggle");await page.evaluate(()=>historyList());}
   for(const theme of ["dark","light"]){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const size of sizes)report.layouts.push({kind:"history",...await historyGeometry(...size,lang,theme)});
   }
  }
  report.checks.push("20 language/theme/viewport history cases: complete selected-row boundary, independent 44px pin and no duplicate inner border or horizontal overflow");
  await page.setViewportSize({width:1440,height:900});await page.click("#new-task");await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  const windowsOutput="D:\\Website Downloads\\Assets"+("\\Long Folder With Spaces".repeat(12));
  await page.fill("#output-path",windowsOutput);
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang){await page.click("#language-toggle");await page.evaluate(()=>historyList());}
   for(const theme of ["dark","light"]){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const [width,height] of sizes){
     await page.setViewportSize({width,height});await page.click("#review-task-plan");await page.locator("#task-plan-dialog[open]").waitFor();
     await page.locator("#task-plan-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));
     assert.equal(await page.locator("#plan-name-example").textContent(),relative);
     if(theme==="dark"&&width===320)report.languageProof.plan[lang]={title:await page.locator("#task-plan-title").textContent(),pdf:await page.locator("#plan-pdf-note").textContent(),recovery:await page.locator("#plan-recovery").textContent()};
     const geometry=await page.evaluate(()=>{
      const d=document.querySelector("#task-plan-dialog"),content=d.querySelector(".task-plan-content"),grid=d.querySelector(".plan-grid"),g=grid.getBoundingClientRect(),box=d.getBoundingClientRect(),header=d.querySelector(".dialog-header").getBoundingClientRect(),footer=d.querySelector(".task-plan-footer").getBoundingClientRect(),body=content.getBoundingClientRect();
      const naming=d.querySelector(".plan-naming").getBoundingClientRect(),reliability=d.querySelector(".plan-reliability").getBoundingClientRect(),dl=d.querySelector(".plan-reliability dl").getBoundingClientRect(),recovery=d.querySelector("#plan-recovery").getBoundingClientRect(),violations=[];
      for(const n of d.querySelectorAll("button")){
       const r=n.getBoundingClientRect();if(r.width<43.9||r.height<43.9)violations.push("small button "+n.id);
       if(r.top<box.top||r.bottom>box.bottom||r.left<box.left||r.right>box.right)violations.push("clipped button "+n.id);
      }
      const walker=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);let n;
      while(n=walker.nextNode())if(n.textContent.trim()&&n.parentElement.getClientRects().length&&parseFloat(getComputedStyle(n.parentElement).fontSize)<12)violations.push("small text");
      if(content.scrollWidth>content.clientWidth+1)violations.push("horizontal overflow");
      if(box.left<0||box.right>innerWidth||box.top<0||box.bottom>innerHeight)violations.push("dialog outside viewport");
      if(header.bottom>body.top+1||footer.top<body.bottom-1)violations.push("fixed header/footer overlap content");
      if(body.height<60)violations.push("content too short");
      return {violations,gridWidth:g.width,namingWidth:naming.width,reliabilityWidth:reliability.width,recoveryWidth:recovery.width,recoveryAvailable:dl.width,scrollable:content.scrollHeight>content.clientHeight,singleColumn:getComputedStyle(d.querySelector(".plan-reliability")).display==="block"};
     });
     assert.deepEqual(geometry.violations,[],JSON.stringify({width,height,lang,theme,...geometry}));
     assert.ok(Math.abs(geometry.namingWidth-geometry.gridWidth)<1&&Math.abs(geometry.reliabilityWidth-geometry.gridWidth)<1,"naming and recovery use the full panel");
     assert.ok(geometry.recoveryWidth>geometry.recoveryAvailable*.6,"recovery prose uses the available body width");
     if(width>=1001)assert.ok(geometry.recoveryWidth>geometry.gridWidth*.6,"wide recovery prose must use over 60% of the whole panel");
     if(width<=650)assert.equal(geometry.singleColumn,true);
     if(lang==="en"){
      const untranslated=await page.locator("#task-plan-dialog").evaluate(d=>{
       const walker=document.createTreeWalker(d,NodeFilter.SHOW_TEXT),out=[];let n;
       while(n=walker.nextNode())if(/[\u3400-\u9fff]/.test(n.textContent)&&!n.parentElement.closest("[data-i18n-skip],#plan-size-example,#plan-paths"))out.push(n.textContent);
       return out;
      });assert.deepEqual(untranslated,[]);
     }
     await page.locator(".task-plan-content").evaluate(n=>n.scrollTop=n.scrollHeight);
     for(const id of ["close-task-plan","return-task-settings"])assert.equal(await page.locator("#"+id).evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),true);
     report.layouts.push({kind:"plan",width,height,lang,theme,...geometry});
     await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"review-task-plan");
    }
   }
  }
  await page.setViewportSize({width:1440,height:900});if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.click("#language-toggle");
  await page.evaluate(()=>document.documentElement.dataset.theme="dark");await page.click("#review-task-plan");
  await page.locator("#task-plan-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await page.screenshot({path:path.join(run,"record-plan-desktop.png")});await page.click("#return-task-settings");assert.equal(await page.evaluate(()=>document.activeElement.id),"review-task-plan");
  assert.equal((await json("/api/tasks")).length,2,"reviewing the plan never submits a task");
  assert.deepEqual(await fs.readFile(path.join(source,"images",filename)),original);
  assert.deepEqual(report.errors,[]);
  report.checks.push("20 plan cases: full-width naming/recovery, readable recovery prose, one unchanged filename, long Windows paths wrap, fixed actions/focus remain reachable, no untranslated labels or page errors");

  // Archive is a display-only operation. Create a genuine protected backup first,
  // so this checks existing bytes and recovery metadata rather than empty folders.
  const backupSource=path.join(source,"backup-case"),backupOriginal=path.join(backupSource,"asset.jpg");
  await fs.mkdir(backupSource);await fs.writeFile(backupOriginal,original);
  const backupScan=await json("/api/scans",{path:backupSource}),backupEntry=backupScan.entries.find(e=>e.relative==="asset.jpg");
  const createdBackup=await json("/api/tasks",{scan_id:backupScan.id,selected:[backupEntry.id],preset:"small",max_width:640,mode:"backup",backup:path.join(run,"backups")});
  let backupTask;
  for(let i=0;i<300;i++){const t=await json("/api/tasks/"+createdBackup.id);if(t.status==="completed"){backupTask=t;break;}await delay(100);}
  assert.ok(backupTask,"backup task must finish");
  const savedBackup=backupTask.entries.find(e=>e.id===backupEntry.id);
  assert.equal(savedBackup.status,"success",savedBackup.reason);
  assert.ok(savedBackup.backup,"a real original backup must exist");
  assert.deepEqual(await fs.readFile(savedBackup.backup),original);
  const optimizedBackupSource=await fs.readFile(backupOriginal);assert.notDeepEqual(optimizedBackupSource,original);
  const exportedB=b.entries.find(e=>e.id===candidate.id).destination,exportedBytes=await fs.readFile(exportedB);
  await page.evaluate(()=>historyList());await page.click("#history-menu-toggle");await page.click("#clear-history");await page.locator("#clear-list-dialog[open]").waitFor();
  assert.match(await page.locator("#clear-list-title").textContent(),/归档/);
  assert.match(await page.locator("#clear-list-note").textContent(),/任务.*报告.*备份.*保留/);
  assert.match(await page.locator("#clear-list-note").textContent(),/任务.*报告.*备份.*恢复/);
  assert.doesNotMatch(await page.locator("#clear-list-note").textContent(),/30\s*天|30\s*days/i);
  await page.click("#confirm-clear-list");await page.locator("#clear-list-dialog").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.querySelector("#history-count").textContent==="1");
  const hidden=await json("/api/tasks?hidden=true");assert.deepEqual(hidden.map(t=>t.id).sort(),[b.id,backupTask.id].sort());
  assert.deepEqual((await json("/api/tasks")).map(t=>t.id),[a.id],"pinned record stays in the main list");
  assert.equal((await json("/api/tasks/"+backupTask.id)).entries.find(e=>e.id===backupEntry.id).backup,savedBackup.backup);
  const reportResponse=await fetch(base+"/api/tasks/"+backupTask.id+"/report.csv",{headers:{"X-MediaSlimX-Token":token}});assert.equal(reportResponse.status,200);
  assert.deepEqual(await fs.readFile(savedBackup.backup),original);assert.deepEqual(await fs.readFile(backupOriginal),optimizedBackupSource);assert.deepEqual(await fs.readFile(exportedB),exportedBytes);
  await page.click("#history-menu-toggle");await page.click("#archived-history");await page.locator("#list-archive-dialog[open]").waitFor();
  await page.waitForFunction(()=>document.querySelectorAll("#list-archive-items .archive-row").length===2);
  await page.locator("#list-archive-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang){await page.keyboard.press("Escape");await page.click("#language-toggle");await page.evaluate(()=>historyList());await page.click("#history-menu-toggle");await page.click("#archived-history");await page.locator("#list-archive-dialog[open]").waitFor();await page.waitForFunction(()=>document.querySelectorAll("#list-archive-items .archive-row").length===2);await page.locator("#list-archive-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));}
   assert.match(await page.locator("#list-archive-title").textContent(),lang==="en"?/archived/i:/归档/);
   report.languageProof.archive[lang]={title:await page.locator("#list-archive-title").textContent(),entry:await page.locator("#archived-history").textContent(),restore:await page.locator(".archive-row>button:last-child").first().textContent()};
   for(const theme of ["dark","light"]){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const [width,height] of sizes){
     await page.setViewportSize({width,height});
     const archiveGeometry=await page.locator("#list-archive-items .archive-row").evaluateAll(rows=>rows.map(row=>{
      const r=row.getBoundingClientRect(),view=row.querySelector(".archive-view"),restore=row.querySelector("button:last-child"),v=view.getBoundingClientRect(),b=restore.getBoundingClientRect(),s=getComputedStyle(row),vs=getComputedStyle(view),d=row.closest("dialog");
      return {width:r.width,borderLeft:parseFloat(s.borderLeftWidth),borderRight:parseFloat(s.borderRightWidth),borderStyle:s.borderLeftStyle,innerBorder:parseFloat(vs.borderLeftWidth),innerBackground:vs.backgroundColor,viewWithin:v.left>=r.left&&v.right<=r.right&&v.top>=r.top&&v.bottom<=r.bottom,restoreWithin:b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom,viewW:v.width,viewH:v.height,restoreW:b.width,restoreH:b.height,horizontalOverflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,stacked:b.top>=v.bottom-.5};
     }));
     assert.equal(archiveGeometry.length,2);
     for(const item of archiveGeometry){
      assert.ok(item.borderLeft>=1&&item.borderRight>=1);assert.equal(item.borderStyle,"solid");
      assert.equal(item.innerBorder,0);assert.ok(["transparent","rgba(0, 0, 0, 0)"].includes(item.innerBackground));
      assert.equal(item.viewWithin,true);assert.equal(item.restoreWithin,true);
      assert.ok(item.viewW>=43.9&&item.viewH>=43.9&&item.restoreW>=43.9&&item.restoreH>=43.9,JSON.stringify({viewportWidth:width,height,lang,theme,...item}));
      assert.ok(item.horizontalOverflow<=1&&item.pageOverflow<=1);
      if(width<=650)assert.equal(item.stacked,true,"mobile restore stays on the next row inside the same boundary");
     }
     report.layouts.push({kind:"archive",width,height,lang,theme,rows:archiveGeometry});
    }
   }
  }
  await page.setViewportSize({width:390,height:640});
  await page.screenshot({path:path.join(run,"record-archive-mobile-en.png")});
  const archivedBackup=page.locator("#list-archive-items .archive-row").filter({hasText:backupSource});
  assert.equal(await archivedBackup.count(),1);await archivedBackup.locator(">button:last-child").focus();await page.keyboard.press("Enter");
  await page.waitForFunction(id=>!!document.querySelector('[data-task-id="'+id+'"]'),backupTask.id);
  await page.waitForFunction(()=>document.querySelectorAll("#list-archive-items .archive-row").length===1);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"close-list-archive");
  assert.equal((await json("/api/tasks?hidden=true")).some(t=>t.id===backupTask.id),false);
  assert.deepEqual(await fs.readFile(savedBackup.backup),original);assert.deepEqual(await fs.readFile(backupOriginal),optimizedBackupSource);
  await page.keyboard.press("Escape");await page.locator("#list-archive-dialog").waitFor({state:"hidden"});assert.equal(await page.evaluate(()=>document.activeElement.id),"history-menu-toggle");
  report.checks.push("real backed-up task can be archived and restored to the list by keyboard; task/report/export/backup/current bytes persist; 20 bilingual/theme/viewport archive rows include view and restore controls in one boundary, with mobile stacking and focus return");
  assert.deepEqual(report.errors,[]);

  // A normal filename complements the deliberately extreme path stress cases.
  // Scan actual private synthetic media; never manufacture task/plan DOM data.
  const presentation=path.join(source,"presentation");
  await fs.mkdir(presentation);await fs.writeFile(path.join(presentation,"sample.jpg"),original);
  await page.setViewportSize({width:1440,height:1100});
  if(await page.locator("html").getAttribute("lang")!=="zh-CN"){await page.click("#language-toggle");await page.evaluate(()=>historyList());}
  await page.evaluate(()=>document.documentElement.dataset.theme="dark");
  await page.click("#new-task");await page.fill("#media-path",presentation);await page.click("#scan-button");
  await page.locator("#settings-section").waitFor();
  await page.waitForFunction(()=>state.scan?.entries.filter(e=>e.status==="ready").length===1);
  await page.fill("#output-path",path.join(run,"exports"));
  await page.click("#review-task-plan");
  await page.locator("#task-plan-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));
  assert.equal(await page.locator("#plan-name-example").textContent(),"sample.jpg");
  await page.locator(".task-plan-content").evaluate(n=>n.scrollTop=n.scrollHeight);
  await page.screenshot({path:path.join(run,"record-plan-readable.png")});
  await page.click("#return-task-settings");
  assert.equal((await json("/api/tasks")).length+(await json("/api/tasks?hidden=true")).length,3,"readable presentation never starts a task");
  report.checks.push("normal sample.jpg is really scanned in a private subfolder; readable Chinese full-width plan screenshot captured without starting a task");
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,evidence:run,checks:report.checks,layoutCases:report.layouts.length,languageProof:report.languageProof,errors:report.errors},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
