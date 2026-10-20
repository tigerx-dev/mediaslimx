/* Bilingual layout and interaction audit against an isolated service.
   Synthetic source media stays unchanged; long paths use DOM-only fixtures. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-bilingual-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(project,".test-media");
 await fs.mkdir(run,{recursive:true});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],errors:[]};
 async function api(route,body,headers={}){return fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url);


  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on("pageerror",e=>report.errors.push(e.message));
  report.cases=[];report.typography=[];report.problems=[];
  // Real unused import reproduces the cleanup row missing from an empty database.
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  const unusedSource=await fs.readFile(path.join(source,"images","landscape.jpg"));
  await page.locator("#import-file-input").setInputFiles({name:"unused-local.jpg",mimeType:"image/jpeg",buffer:unusedSource});
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&!importState.busy);
  await page.reload();await page.locator("#clear-unused-imports:not([hidden])").waitFor();
  assert.equal((await (await api("/api/imports/unused")).json()).length,1);

  const sizes=[[1440,640],[844,390],[1280,500],[320,568],[360,740],[390,844],[540,720],[768,900],[900,640],[1001,640],[1150,720],[1440,900]];
  async function audit(stage,width,height){
   await page.setViewportSize({width,height});await delay(80);
   const data=await page.evaluate(()=>{
    const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=="hidden";
    const problems=[];
    const textNodes=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let text;
    while((text=textNodes.nextNode())){
     if(!text.textContent.trim()||!visible(text.parentElement)||text.parentElement.closest("script,style"))continue;
     if(parseFloat(getComputedStyle(text.parentElement).fontSize)<12)
      problems.push("text below 12px: "+text.textContent.trim().slice(0,40));
    }
    if(document.documentElement.scrollWidth>innerWidth)problems.push("document overflow");
    for(const n of document.querySelectorAll("button,a,input,summary")){
     if(!visible(n))continue;
     const r=n.getBoundingClientRect();
     if(r.width<43.9||r.height<43.9)problems.push("small target: "+(n.id||n.textContent.trim()));
     if(n.tagName!=="BUTTON")continue;
     // Filename shortcuts deliberately ellipsize; the full path is available in their title/detail.
     if(n.matches(".history-item,.folder-root,.folder-entry,.archive-view"))continue;
     const walk=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let node;
     while((node=walk.nextNode())){
      if(!node.textContent.trim())continue;
      const range=document.createRange();range.selectNodeContents(node);
      if([...range.getClientRects()].some(t=>t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>r.bottom+1))
       problems.push("button text overflow: "+(n.id||n.textContent.trim()));
     }
    }
    const header=[...document.querySelectorAll(".app-bar>.brand,.app-bar>.header-note,.app-actions")].filter(visible).map(n=>n.getBoundingClientRect());
    for(let i=1;i<header.length;i++)if(header[i].left<header[i-1].right-1)problems.push("header overlap");
    for(const selector of [".preset-grid",".size-mode-grid",".intake",".folder-dialog-footer",".dialog-header",".empty-principles"]){
     const n=document.querySelector(selector);if(!n||!visible(n))continue;
     if(n.scrollWidth>n.clientWidth+1)problems.push("component overflow: "+selector);
    }
    for(const row of document.querySelectorAll("#result-paths .result-location")){
     if(!visible(row))continue;
     if(row.getBoundingClientRect().width<row.parentElement.getBoundingClientRect().width-2)
      problems.push("result path row is squeezed into a partial-width grid track");
     const label=row.querySelector("dt"),value=row.querySelector("dd"),range=document.createRange();range.selectNodeContents(label);
     if([...range.getClientRects()].some(r=>r.right>value.getBoundingClientRect().left-3&&r.bottom>value.getBoundingClientRect().top))
      problems.push("result path label overlaps value");
    }
    return {problems};
   });
   if(stage==="settings"&&width>=1001&&height>=640){
    const action=await page.locator("#start-button").boundingBox();
    assert.ok(action.y>=64&&action.y+action.height<=height,"start action clipped");
   }
   report.cases.push({stage,language:await page.locator("html").getAttribute("lang"),width,height,...data});
   report.problems.push(...data.problems.map(p=>stage+" "+width+"x"+height+": "+p));
  }
  async function matrix(stage){for(const [w,h]of sizes)await audit(stage,w,h);}
  async function lines(selector){
   return page.locator(selector).evaluate(n=>{
    const rows=new Map(),walk=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let node;
    while((node=walk.nextNode()))for(let i=0;i<node.length;i++){
     const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
     const r=range.getBoundingClientRect();if(!r.height)continue;
     const y=Math.round(r.y);rows.set(y,(rows.get(y)||"")+node.textContent[i]);
    }
    return [...rows.values()].map(s=>s.trim()).filter(Boolean);
   });
  }
  for(const lang of ["zh-CN","en"]){
   await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   assert.match(await page.locator("#clear-unused-imports").textContent(),lang==="en"?/^Clean unused copies · 1$/:/^清理未使用副本 · 1$/);
   assert.equal(await page.locator("#history-feedback").isHidden(),true);
   await matrix("empty");
   for(const [width,height]of [[320,568],[390,640],[1001,640],[1440,640],[1440,720],[1440,900]]){
    await page.setViewportSize({width,height});
    for(const selector of ["#empty-section h2","#empty-section>p","#choose-import-files","#choose-import-folder","#clear-unused-imports",".empty-principles"]){
     const element=page.locator(selector);await element.scrollIntoViewIfNeeded();
     const g=await element.evaluate(n=>{
      const r=n.getBoundingClientRect(),p=n.closest("#empty-section").getBoundingClientRect();
      const y=Math.max(64,p.top,r.top)+Math.min(r.height,44)/2, x=r.x+r.width/2,hit=document.elementFromPoint(x,y);
      return {top:r.top,bottom:r.bottom,paneTop:p.top,paneBottom:p.bottom,viewport:innerHeight,hit:n===hit||n.contains(hit)};
     });
     assert.ok(g.hit&&g.top>=Math.max(60,g.paneTop)-1&&g.bottom<=Math.min(height,g.paneBottom)+1,"empty content clipped: "+selector+" "+width+"x"+height+" "+JSON.stringify(g));
    }
    const group=await page.locator(".empty-entry-actions").evaluate(n=>{
     const a=n.querySelector("#choose-import-files").getBoundingClientRect(),b=n.querySelector("#choose-import-folder").getBoundingClientRect(),c=n.querySelector("#clear-unused-imports").getBoundingClientRect();
     return {separate:c.top>=Math.max(a.bottom,b.bottom)+3,centerDelta:Math.abs((c.left+c.right)-(n.getBoundingClientRect().left+n.getBoundingClientRect().right))/2};
    });
    assert.ok(group.separate&&group.centerDelta<1,"cleanup action crowds primary group");
    if(width===320||width===1001){
     // Capture sticky elements from the document top; full-page capture from a
     // scrolled viewport otherwise makes its fixed header appear mid-document.
     await page.evaluate(()=>scrollTo(0,0));await delay(80);
     await page.screenshot({path:path.join(run,lang+"-empty-"+width+"x"+height+".png"),fullPage:width===320});
    }

   }
   report.checks.push(lang+": real unused-copy row remains separate; headings, guidance and actions reachable at six short/narrow sizes");

   for(const w of [320,390,1001,1440]){
    await page.setViewportSize({width:w,height:900});await delay(80);
    const item={lang,width:w,empty:await lines(".empty>p"),organize:await lines("#history-menu-toggle")};
    for(const rows of [item.empty,item.organize])if(rows.length>1){
     const last=rows.at(-1);
     assert.ok(lang==="en"?last.split(/\s+/).length>=2:last.replace(/[\s。，；]/g,"").length>=4,"orphan line: "+JSON.stringify(item));
    }
    report.typography.push(item);
   }
   await page.screenshot({path:path.join(run,lang+"-empty.png"),fullPage:true});
   await page.click("#browse-media");await page.locator("#folder-dialog[open]").waitFor();await delay(280);await matrix("folder");
   await page.setViewportSize({width:320,height:568});
   assert.ok(await page.locator("#choose-folder").evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),"folder confirmation clipped");
   await page.locator(".folder-dialog-content").evaluate(n=>n.scrollTop=0);
   await page.locator("#folder-roots .folder-root").first().scrollIntoViewIfNeeded();
   assert.ok(await page.locator("#folder-roots .folder-root").first().evaluate(n=>{const r=n.getBoundingClientRect();return r.height>=44&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),"folder shortcut clipped");
   await page.screenshot({path:path.join(run,lang+"-folder-mobile.png")});
   await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"browse-media");
   await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#settings-section").waitFor();await matrix("settings");
   await page.click("#resize-fit");await page.fill("#max-width","800");await matrix("resize");
   await page.setViewportSize({width:900,height:640});await page.screenshot({path:path.join(run,lang+"-settings-tablet.png"),fullPage:true});
   for(const [w,h]of [[320,568],[390,844],[1001,640],[1440,900]]){
    await page.setViewportSize({width:w,height:h});await page.click("#mode-trigger");await page.locator("#mode-options").waitFor();await delay(260);
    const box=await page.locator("#mode-options").boundingBox();assert.ok(box.x>=0&&box.x+box.width<=w+1&&box.y>=0&&box.y+box.height<=h+1);
    await audit("menu",w,h);
    await page.keyboard.press("End");await page.keyboard.press("Enter");assert.equal(await page.locator("#mode").inputValue(),"overwrite");
    await page.click("#mode-trigger");await page.keyboard.press("Home");await page.keyboard.press("Enter");
   }
   await page.setViewportSize({width:1440,height:900});await page.fill("#output-path",path.join(run,"exports"));await page.click("#start-button");
   await page.waitForFunction(()=>state.task?.status==="completed",{},{timeout:60000});
   assert.equal(await page.locator("#result-root").evaluate(n=>n.open),false,"folder details should begin collapsed");
   assert.equal(await page.locator("#result-paths").isVisible(),false);
   assert.equal(await page.locator("#result-location-brief-path").textContent(),await page.evaluate(()=>state.task.output_root.replace(/[\\/]+$/,"")+(state.task.root.includes("\\")?"\\":"/")+(state.task.folder_name||state.task.id)));
   await matrix("results");
   await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(run,lang+"-results-desktop.png")});
   await page.click("#result-locations-summary");assert.equal(await page.locator("#result-root").evaluate(n=>n.open),true);
   assert.equal(await page.locator("#result-paths .result-location").count(),2);
   await page.evaluate(backupRoot=>{window.__layoutOriginalTask=state.task;state.task={...state.task,mode:"backup",backup_root:backupRoot,entries:state.task.entries.map(e=>({...e,backup_fp:e.result_fp||"synthetic"}))};renderResults();},path.join(run,"backup-preview"));
   assert.equal(await page.locator("#result-paths .result-location").count(),3,"backup mode should explain source, result and backup separately");
   assert.match(await page.locator("#result-paths .result-location").last().textContent(),/备份|backup/i);
   await matrix("backup-locations");
   await page.evaluate(()=>{state.task=window.__layoutOriginalTask;delete window.__layoutOriginalTask;renderResults();});
   await page.evaluate(()=>{state.environment.open_task_folder=true;renderResults();});
   assert.equal(await page.locator("#result-paths button[data-folder-slot]").count(),2);
   await matrix("native-folder-actions");
   await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(run,lang+"-results-native-actions-desktop.png")});
   await page.setViewportSize({width:320,height:568});
   const folderAction=page.locator("#result-paths button[data-folder-slot]").first();await folderAction.scrollIntoViewIfNeeded();
   assert.ok(await folderAction.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===hit||n.contains(hit);}),"narrow result folder action is unreachable");
   await page.screenshot({path:path.join(run,lang+"-results-native-actions-narrow.png")});
   await page.evaluate(()=>{state.environment.open_task_folder=false;renderResults();});
   await page.setViewportSize({width:320,height:568});
   const table=page.locator("#results-section .table-wrap");
   await table.evaluate(n=>n.scrollLeft=n.scrollWidth);
   const detailAction=page.locator("#result-body button").first();await detailAction.scrollIntoViewIfNeeded();
   assert.ok(await detailAction.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),"last table column unreachable");
   await page.locator("#result-body button").first().click();await page.locator("#detail-dialog[open]").waitFor();await delay(280);await matrix("detail");
   await page.setViewportSize({width:320,height:568});
   await page.locator("#detail-title").evaluate(n=>n.textContent="nested/"+("very-long-file-name-".repeat(12))+".jpg");
   await audit("long-detail",320,568);
   assert.ok(await page.locator("#detail-title").evaluate(n=>n.clientHeight<=parseFloat(getComputedStyle(n).lineHeight)*3+1),"long title consumes preview");
   await page.locator("#detail-title").focus();await page.keyboard.press("End");
   assert.equal(await page.locator("#detail-title").evaluate(n=>n.scrollHeight>n.clientHeight),true,"long title not scrollable");
   await page.locator("#detail-dialog").evaluate(n=>n.scrollTop=n.scrollHeight);
   const closeHit=await page.locator("#close-detail").evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===hit||n.contains(hit);});
   assert.ok(closeHit,"detail close button unreachable after scrolling");
   await page.screenshot({path:path.join(run,lang+"-detail-mobile.png")});
   await page.click("#close-detail");
   assert.equal(await page.locator("#result-paths .result-location").count(),2);
   assert.equal(await page.locator("#result-paths button[data-folder-slot]").count(),0);
   await page.setViewportSize({width:1440,height:900});
   await page.click("#show-privacy");await page.locator("#environment-dialog[open]").waitFor();await delay(280);await matrix("environment");await page.click("#close-environment");
   await page.click("#new-task");
   await page.click("#history-menu-toggle");await page.click("#clear-history");await page.locator("#clear-list-dialog[open]").waitFor();await delay(280);
   await matrix("clear-confirm");await page.click("#cancel-clear-list");
  }

  // Cancelling cleanup preserves the batch; confirming removes only test copies.
  const cancelDialog=page.waitForEvent("dialog");const cancelClick=page.click("#clear-unused-imports");await (await cancelDialog).dismiss();await cancelClick;
  assert.equal((await (await api("/api/imports/unused")).json()).length,1);
  const clearDialog=page.waitForEvent("dialog");const clearClick=page.click("#clear-unused-imports");await (await clearDialog).accept();await clearClick;
  await page.locator("#clear-unused-imports").waitFor({state:"hidden"});
  assert.equal((await (await api("/api/imports/unused")).json()).length,0);
  assert.equal(await page.locator(".empty-maintenance").evaluate(n=>n.getClientRects().length),0);
  assert.deepEqual(await fs.readFile(path.join(source,"images","landscape.jpg")),unusedSource);
  report.checks.push("cleanup cancellation preserves batch; confirmation hides the secondary row, preserves source and leaves task results available");
  await fs.writeFile(path.join(run,"bilingual-layout.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({platform,evidence:run,cases:report.cases.length,checks:report.checks,typography:report.typography,problems:[...new Set(report.problems)],errors:report.errors},null,2));
  assert.deepEqual(report.problems,[]);assert.deepEqual(report.errors,[]);
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
