/* Delete archived records through the real UI against a private service.
   Media fixtures, runtime data and outputs all live in this test's private run.
   This never connects to or mutates the user's running instance or task library. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-record-delete-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 const bytes=await fs.readFile(path.join(project,".test-media","images","landscape.jpg"));
 const exportSource=path.join(source,"export-source"),backupSource=path.join(source,"backup-source");
 await fs.mkdir(exportSource,{recursive:true});await fs.mkdir(backupSource);
 await fs.writeFile(path.join(exportSource,"export-original.jpg"),bytes);await fs.writeFile(path.join(backupSource,"backup-original.jpg"),bytes);
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const args=["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"];
 let child,stdout="",stderr="",browser,token,url;
 function start(){stdout="";stderr="";child=spawn(python,args,{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);}
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],layouts:[],languageProof:{},errors:[]};
 async function api(route,body){return fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});}
 async function json(route,body){const r=await api(route,body);assert.equal(r.status,200,route+" "+await r.clone().text());return r.json();}
 async function ready(){
  for(let i=0;i<150;i++){
   const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);
   if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)return;}catch{}}
   if(child.exitCode!==null)throw Error("Private service exited: "+stderr);await delay(100);
  }
  throw Error("Private service did not start");
 }
 async function stop(){
  if(!child||child.exitCode!==null)return;
  if(process.platform==="win32")await new Promise(r=>{const p=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});p.on("close",r);});
  else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}
 }
 async function finish(created){
  for(let i=0;i<300;i++){
   const t=await json("/api/tasks/"+created.id);
   if(t.status==="completed"){
    assert.equal(t.entries.length,1);assert.ok(["success","no_gain","duplicate"].includes(t.entries[0].status),t.entries[0].reason);return t;
   }
   await delay(100);
  }
  throw Error("Private media task did not complete");
 }
 async function importCopy(name){
  const batch=await json("/api/imports",{files:[{name,size:bytes.length}]}),file=batch.files[0];
  const uploaded=await fetch(base+"/api/imports/"+batch.id+"/files/"+file.id,{method:"PUT",headers:{"X-MediaSlimX-Token":token,"Content-Type":"application/octet-stream"},body:bytes});
  assert.equal(uploaded.status,200,await uploaded.clone().text());
  const scan=await json("/api/imports/"+batch.id+"/scan",{});assert.equal(scan.entries[0].status,"ready");
  return {batch,scan};
 }
 const snapshots=new Map();
 async function remember(filename){assert.ok(filename,"expected actual media path");snapshots.set(filename,await fs.readFile(filename));}
 async function unchanged(){for(const [filename,original] of snapshots)assert.deepEqual(await fs.readFile(filename),original,"record operation changed bytes: "+filename);}
 async function missing(route){const r=await api(route);assert.equal(r.status,400,route);assert.match((await r.json()).detail,/记录不存在/);}
 start();
 try{
  await ready();
  const exportScan=await json("/api/scans",{path:exportSource});
  const exported=await finish(await json("/api/tasks",{scan_id:exportScan.id,selected:[exportScan.entries[0].id],output:path.join(run,"exports")}));
  const backupScan=await json("/api/scans",{path:backupSource});
  const backed=await finish(await json("/api/tasks",{scan_id:backupScan.id,selected:[backupScan.entries[0].id],mode:"backup",backup:path.join(run,"backups"),preset:"small",max_width:640}));
  assert.equal(backed.entries[0].status,"success");assert.ok(backed.entries[0].backup);
  assert.deepEqual(await fs.readFile(backed.entries[0].backup),bytes);assert.notDeepEqual(await fs.readFile(backed.entries[0].source),bytes);
  const importedFixture=await importCopy("import-original.jpg"),imported=await finish(await json("/api/tasks",{scan_id:importedFixture.scan.id,selected:[importedFixture.scan.entries[0].id],output:path.join(run,"import-exports")}));
  for(const t of [exported,backed,imported])for(const e of t.entries)for(const field of ["source","destination","backup"])if(e[field])await remember(e[field]);
  await json("/api/tasks/clear-history",{task_ids:[exported.id,backed.id,imported.id]});
  assert.equal((await json("/api/tasks?hidden=true")).length,3);
  const preview=await json("/api/tasks/"+backed.id+"/deletion-preview");
  assert.match(preview.record_version,/^[0-9a-f]{64}$/);assert.equal(preview.backup_count,1);assert.equal(preview.restorable_count,1);
  assert.equal((await json("/api/tasks/"+imported.id+"/deletion-preview")).has_imported_originals,true);
  report.checks.push("real export, optimized source plus original backup, and sealed browser import created in a private service; all retained file bytes snapshotted");

  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on("pageerror",e=>report.errors.push(e.message));
  const mutations=[];page.on("request",r=>{if(r.method()==="POST"&&r.url().includes("/delete-record"))mutations.push(r.url());});
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  // The archive note is a single concise desktop line, not a long policy block.
  // Exercise the actual confirmation with an eligible record; cancellation
  // never moves that record or alters its retained media.
  await json("/api/tasks/"+exported.id+"/restore-history",{});await page.evaluate(()=>historyList());
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang){await page.click("#language-toggle");await page.evaluate(()=>historyList());}
   for(const [width,height] of [[1440,900],[320,568]]){
    await page.setViewportSize({width,height});await page.click("#history-menu-toggle");await page.click("#clear-history");await page.locator("#clear-list-dialog[open]").waitFor();
    await page.locator("#clear-list-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));
    const note=await page.locator("#clear-list-note").evaluate(n=>{
     const range=document.createRange();range.selectNodeContents(n);
     const tops=[...new Set([...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>Math.round(r.top*10)/10))],s=getComputedStyle(n),d=n.closest("dialog");
     return {text:n.textContent,lines:tops.length,font:parseFloat(s.fontSize),dialogWidth:d.getBoundingClientRect().width,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.equal(note.text,lang==="zh-CN"?"仅收起列表；任务、报告和备份保留，可随时恢复。":"Keep tasks, reports, and backups. Restore from Archived anytime.");
    assert.ok(note.font>=12);assert.ok(note.overflow<=1&&note.pageOverflow<=1);
    if(width===1440){assert.ok(Math.abs(note.dialogWidth-500)<1,"desktop archive confirmation uses its 500px panel");if(lang==="zh-CN")assert.equal(note.lines,1,"concise Chinese archive note fits on one actual rendered line");}
    else assert.ok(note.lines>1,"phone note naturally wraps instead of shrinking or clipping");
    report.layouts.push({kind:"archive-note",width,height,lang,...note});
    await page.click("#cancel-clear-list");await page.locator("#clear-list-dialog").waitFor({state:"hidden"});
   }
  }
  await page.setViewportSize({width:1440,height:900});
  if(await page.locator("html").getAttribute("lang")!=="zh-CN"){await page.click("#language-toggle");await page.evaluate(()=>historyList());}
  await json("/api/tasks/clear-history",{task_ids:[exported.id]});await page.evaluate(()=>historyList());await unchanged();
  report.checks.push("archive note uses the exact concise bilingual copy: Chinese renders on one line inside the real 500px desktop dialog; both languages naturally wrap on 320px phones at >=12px without clipping");
  async function openArchive(){await page.click("#history-menu-toggle");await page.click("#archived-history");await page.locator("#list-archive-dialog[open]").waitFor();await page.locator('[data-delete-task-id="'+backed.id+'"]').waitFor();}
  async function openDelete(id){await page.locator('[data-delete-task-id="'+id+'"]').click();await page.locator("#delete-record-dialog[open]").waitFor();await page.waitForFunction(()=>!document.querySelector("#delete-record-confirm").disabled);await page.locator("#delete-record-dialog").evaluate(d=>Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{}))));}
  async function assertBackupWarning(t,lang){
   const warning=await page.locator("#delete-record-warning").textContent();
   if(t.entries.some(e=>e.backup)){
    assert.match(warning,lang==="en"?/Existing backup files remain/:/原有备份文件不删除/);
    assert.match(warning,lang==="en"?/locate and restore them manually/:/自行定位并手动恢复/);
    assert.doesNotMatch(warning,lang==="en"?/no recorded backups/:/未记录备份/);
   }else{
    assert.match(warning,lang==="en"?/This task has no recorded backups/:/此任务未记录备份/);
    assert.doesNotMatch(warning,lang==="en"?/Existing backup files remain|restore them manually/:/原有备份文件不删除|手动恢复/);
   }
  }
  await openArchive();await openDelete(backed.id);await assertBackupWarning(backed,"zh-CN");
  await page.screenshot({path:path.join(run,"delete-record-warning.png")});
  assert.equal(await page.locator("#delete-record-confirm").isChecked(),false);assert.equal(await page.locator("#confirm-delete-record").isDisabled(),true);
  const explanation=await page.locator("#delete-record-dialog").textContent();
  assert.match(explanation,/备份/);assert.match(explanation,/报告/);assert.match(explanation,/恢复/);assert.match(explanation,/不.*删除|保留/);
  await page.click("#cancel-delete-record");await page.locator("#delete-record-dialog").waitFor({state:"hidden"});
  await page.waitForFunction(id=>document.activeElement.dataset.deleteTaskId===id,backed.id);
  assert.equal(mutations.length,0);assert.equal((await json("/api/tasks?hidden=true")).length,3);await unchanged();
  await openDelete(backed.id);await page.keyboard.press("Escape");await page.locator("#delete-record-dialog").waitFor({state:"hidden"});
  await page.waitForFunction(id=>document.activeElement.dataset.deleteTaskId===id,backed.id);assert.equal(mutations.length,0);
  report.checks.push("opening impact review has no mutation; unchecked acknowledgement disables deletion; cancel and Escape preserve records/media and return focus to the same archived-row control");

  report.checks.push("backup deletion warning accurately preserves existing files and requires manual restoration; export/import warnings explicitly report no recorded backup in both languages");
  const sizes=[[320,568],[390,640],[768,900],[1440,900]];
  for(const lang of ["zh-CN","en"]){
   await page.keyboard.press("Escape");
   if(await page.locator("html").getAttribute("lang")!==lang){await page.click("#language-toggle");await page.evaluate(()=>historyList());}
   await openArchive();
   // Export/import tasks have no recorded backup; their warning must not imply
   // that a manual backup restoration is available. Verify both languages.
   for(const t of [exported,imported]){
    await openDelete(t.id);await assertBackupWarning(t,lang);await page.keyboard.press("Escape");
    await page.locator("#delete-record-dialog").waitFor({state:"hidden"});
   }
   for(const theme of ["dark","light"]){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const [width,height] of sizes){
     await page.setViewportSize({width,height});await openDelete(backed.id);await assertBackupWarning(backed,lang);
     const geometry=await page.locator("#delete-record-dialog").evaluate(d=>{
      const b=d.getBoundingClientRect(),header=d.querySelector(".dialog-header").getBoundingClientRect(),content=d.querySelector(".delete-record-content"),c=content.getBoundingClientRect(),footer=d.querySelector(".delete-record-footer").getBoundingClientRect(),bad=[];
      if(b.left<0||b.top<0||b.right>innerWidth+.5||b.bottom>innerHeight+.5)bad.push("dialog outside viewport");
      if(content.scrollWidth>content.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1)bad.push("horizontal overflow");
      if(header.bottom>c.top+1||footer.top<c.bottom-1)bad.push("fixed header/footer overlap");
      if(c.height<60)bad.push("unreadable content height");
      for(const n of d.querySelectorAll("button")){
       const r=n.getBoundingClientRect();if(r.width<43.9||r.height<43.9)bad.push("small button "+n.id);
       if(r.left<b.left||r.right>b.right||r.top<b.top||r.bottom>b.bottom)bad.push("clipped button "+n.id);
      }
      const walker=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())if(n.textContent.trim()&&n.parentElement.getClientRects().length&&parseFloat(getComputedStyle(n.parentElement).fontSize)<12)bad.push("small text");
      return {bad,contentHeight:c.height,scrollable:content.scrollHeight>content.clientHeight};
     });
     assert.deepEqual(geometry.bad,[],JSON.stringify({width,height,lang,theme,...geometry}));
     await page.locator(".delete-record-content").evaluate(n=>n.scrollTop=n.scrollHeight);
     await page.locator("#delete-record-confirm").scrollIntoViewIfNeeded();
     assert.ok(await page.locator("#delete-record-confirm").evaluate(n=>{const r=n.getBoundingClientRect(),hit=n.closest("label")?.getBoundingClientRect();return !!hit&&hit.width>=43.9&&hit.height>=43.9&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),"checkbox and full 44px label remain reachable");
     await page.locator("#delete-record-confirm").check();assert.equal(await page.locator("#confirm-delete-record").isEnabled(),true);
     assert.equal(await page.locator("#confirm-delete-record").evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,"fixed confirmation is not obscured");
     if(lang==="en"){
      const unlocalized=await page.locator("#delete-record-dialog").evaluate(d=>{
       const walker=document.createTreeWalker(d,NodeFilter.SHOW_TEXT),out=[];let n;while(n=walker.nextNode())if(/[\u3400-\u9fff]/.test(n.textContent)&&!n.parentElement.closest("[data-i18n-skip]"))out.push(n.textContent.trim());return out;
      });assert.deepEqual(unlocalized,[]);
     }
     report.languageProof[lang]=await page.locator("#delete-record-dialog").textContent();
     report.layouts.push({width,height,lang,theme,...geometry});
     await page.keyboard.press("Escape");await page.locator("#delete-record-dialog").waitFor({state:"hidden"});
     await page.waitForFunction(id=>document.activeElement.dataset.deleteTaskId===id,backed.id);
    }
   }
  }
  assert.equal(mutations.length,0);await unchanged();
  report.checks.push("16 Chinese/English, dark/light, 320/390/768/1440 review cases: 12px minimum text, 44px controls/checkbox label, scrollable explanation, fixed reachable cancel/confirm, focus return and no untranslated labels");

  await page.setViewportSize({width:1440,height:900});
  if(await page.locator("html").getAttribute("lang")!=="zh-CN"){await page.keyboard.press("Escape");await page.click("#language-toggle");await page.evaluate(()=>historyList());await openArchive();}
  for(const action of ["restore-history","pin"]){
   await openDelete(backed.id);const old=await json("/api/tasks/"+backed.id+"/deletion-preview");
   await json("/api/tasks/"+backed.id+"/"+action,action==="pin"?{pinned:true}:{});
   await page.locator("#delete-record-confirm").check();await page.click("#confirm-delete-record");
   await page.locator("#delete-record-error:not([hidden])").waitFor();
   assert.ok((await page.locator("#delete-record-error").textContent()).trim());assert.equal(await page.locator("#delete-record-dialog").isVisible(),true);
   assert.equal((await json("/api/tasks/"+backed.id)).status,"completed");await unchanged();
   const stale=await api("/api/tasks/"+backed.id+"/delete-record",{confirm:true,record_version:old.record_version});assert.equal(stale.status,400);
   await page.keyboard.press("Escape");await page.keyboard.press("Escape");
   if(action==="pin")await json("/api/tasks/"+backed.id+"/pin",{pinned:false});
   await json("/api/tasks/clear-history",{task_ids:[backed.id]});await page.evaluate(()=>historyList());await openArchive();
  }
  report.checks.push("restoring or pinning a record from another client invalidates the opened confirmation; UI keeps the error visible and server rejects stale version without touching media");

  // Open a real selected result, then remove its archived record. The stale
  // result and report controls must disappear rather than keep broken actions.
  await page.keyboard.press("Escape");await page.evaluate(id=>openTask(id),exported.id);await page.waitForFunction(id=>state.task?.id===id,exported.id);await openArchive();
  const deleted=[];
  for(const t of [exported,backed,imported]){
   await openDelete(t.id);
   await assertBackupWarning(t,"zh-CN");
   const effect=await page.locator("#delete-record-dialog").textContent();
   if(t.mode==="backup")assert.match(effect,/备份|backup/i);
   if(t.source_kind==="import")assert.match(effect,/副本|cop(?:y|ies)/i);
   await page.locator("#delete-record-confirm").check();await page.click("#confirm-delete-record");
   await page.locator("#delete-record-dialog").waitFor({state:"hidden"});
   await page.locator('[data-delete-task-id="'+t.id+'"]').waitFor({state:"detached"});
   await missing("/api/tasks/"+t.id);await missing("/api/tasks/"+t.id+"/report.csv");
   await missing("/api/tasks/"+t.id+"/preview/"+t.entries[0].id+"/result");
   assert.equal((await api("/api/tasks/"+t.id+"/restore",{})).status,400);
   assert.ok(!(await json("/api/tasks?hidden=true")).some(r=>r.id===t.id));await unchanged();deleted.push(t.id);
   if(t.id===exported.id)assert.equal(await page.evaluate(()=>state.task),null,"deleting the selected record clears stale result controls");
  }
  assert.deepEqual(await json("/api/tasks"),[]);assert.deepEqual(await json("/api/tasks?hidden=true"),[]);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#archived-history").isDisabled(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),"history-menu-toggle");
  report.checks.push("each real export/backup/import record is permanently removed after explicit acknowledgement; list, detail, CSV, preview and automatic restore no longer expose it; all original/export/backup/imported bytes remain unchanged");

  const retainedId=importedFixture.batch.id;
  assert.ok(!(await json("/api/imports/unused")).some(b=>b.id===retainedId));
  const protectedResult=await json("/api/imports/clear-unused",{import_ids:[retainedId]});assert.deepEqual(protectedResult.cleared,[]);assert.deepEqual(protectedResult.protected,[retainedId]);
  const orphan=await importCopy("unused-extra.jpg");
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();await page.locator("#clear-unused-imports").waitFor();
  assert.deepEqual((await json("/api/imports/unused")).map(b=>b.id),[orphan.batch.id]);
  const confirmed=page.waitForEvent("dialog"),clicking=page.click("#clear-unused-imports");await(await confirmed).accept();await clicking;
  await page.locator("#clear-unused-imports").waitFor({state:"hidden"});await unchanged();
  assert.deepEqual(await json("/api/imports/unused"),[]);
  assert.equal((await api("/api/imports/"+retainedId+"/discard",{})).status,400);
  report.checks.push("deleting an import task does not make its sealed original copies unused: direct cleanup/discard are refused; actual UI cleanup removes only a genuinely unused extra copy");

  // Reopen the same private runtime, not the user's service, to verify that
  // deletion and retained-copy protection survive process restart.
  await browser.close();browser=null;await stop();start();await ready();
  assert.deepEqual(await json("/api/tasks"),[]);assert.deepEqual(await json("/api/tasks?hidden=true"),[]);await unchanged();
  assert.ok(!(await json("/api/imports/unused")).some(b=>b.id===retainedId));
  assert.deepEqual((await json("/api/imports/clear-unused",{import_ids:[retainedId]})).protected,[retainedId]);
  for(const id of deleted)await missing("/api/tasks/"+id);
  report.checks.push("private service restart preserves record deletion and sealed-copy cleanup protection; all retained media bytes remain intact");
  assert.deepEqual(report.errors,[]);await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({platform,evidence:run,checks:report.checks,layoutCases:report.layouts.length,errors:report.errors},null,2));
 }finally{if(browser)await browser.close();await stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
