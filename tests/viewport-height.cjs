/* Viewport-height regression: real synthetic-media scan/export, pane scrolling,
   menu hit testing and short-window/zoom fallback. No source files are changed. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const root=process.cwd(),evidence=path.join(root,".mediaslimx",process.platform==="win32"?"validation-windows":"validation-wsl");
 await fs.mkdir(evidence,{recursive:true});
 const report={cases:[],checks:[],pageErrors:[]},browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on("pageerror",e=>report.pageErrors.push(e.message));
  await page.goto(process.env.MSX_URL);await page.locator("#connection[data-connected=true]").waitFor();
  const desktops=[[1440,640],[1440,720],[1440,900],[1440,1080],[1440,1400],[1001,640],[1024,768],[1280,720],[1920,1080],[2560,1440]];
  async function geometry(stage,width,height,desktop){
   await page.setViewportSize({width,height});await page.waitForTimeout(80);
   const g=await page.evaluate(()=>{
    const rect=id=>{const n=document.querySelector(id);if(!n||!n.getClientRects().length)return null;const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
    return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,mainScroll:document.querySelector("main").scrollHeight-document.querySelector("main").clientHeight,header:rect(".app-bar"),start:rect("#start-button"),cancel:rect("#cancel-button"),table:rect("#scan-section:not([hidden]) .table-wrap,#results-section:not([hidden]) .table-wrap")};
   });
   report.cases.push({stage,desktop,...g});
   assert.equal(g.documentWidth,width,stage+" horizontal overflow "+width+"x"+height);
   if(desktop){
    assert.ok(g.documentHeight<=height+1,stage+" document height "+JSON.stringify(g));
    assert.ok(g.mainScroll<=1,stage+" workspace overflow "+JSON.stringify(g));
    assert.equal(g.header.top,0);
    if(stage==="settings")assert.ok(g.start.top>=64&&g.start.bottom<=height,stage+" start clipped "+JSON.stringify(g));
    if(stage==="running")assert.ok(g.cancel.top>=64&&g.cancel.bottom<=height,"cancel clipped");
    if(g.table)assert.ok(g.table.height>=60,"table collapsed "+JSON.stringify(g));
   }
   return g;
  }
  for(const [w,h] of desktops)await geometry("empty",w,h,true);
  await page.setViewportSize({width:1440,height:900});await page.fill("#media-path",path.join(root,".test-media"));await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  for(const [w,h] of desktops)await geometry("settings",w,h,true);
  await page.setViewportSize({width:1440,height:640});
  const actionBefore=await page.locator("#start-button").boundingBox();
  await page.locator(".settings-scroll").evaluate(n=>n.scrollTop=n.scrollHeight);
  await page.waitForTimeout(80);
  const actionAfter=await page.locator("#start-button").boundingBox();
  assert.equal(actionBefore.y,actionAfter.y);report.checks.push("start action stays visible while parameters scroll");
  await page.locator("#scan-section .table-wrap").evaluate(n=>n.scrollTop=n.scrollHeight);
  const last=await page.locator("#scan-body tr").last().boundingBox(),pane=await page.locator("#scan-section .table-wrap").boundingBox();
  assert.ok(last.y+last.height<=pane.y+pane.height+1);report.checks.push("last scan row reachable inside table");
  await page.locator(".settings-scroll").evaluate(n=>n.scrollTop=0);
  await page.locator("#mode-trigger").focus();await page.keyboard.press("Enter");await page.waitForTimeout(100);
  assert.equal(await page.locator("#mode-trigger").getAttribute("aria-expanded"),"true","queued focus scroll closed keyboard menu");
  await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  assert.equal(await page.locator("#mode").inputValue(),"backup");
  await page.keyboard.press("Enter");await page.keyboard.press("Home");await page.keyboard.press("Enter");
  assert.equal(await page.locator("#mode").inputValue(),"export");
  report.checks.push("keyboard menu survives queued focus scroll");
  await page.click("#mode-trigger");await page.waitForTimeout(260);
  assert.equal(await page.locator("#mode-trigger").getAttribute("aria-expanded"),"true");
  const menu=await page.locator("#mode-options").evaluate(n=>{const r=n.getBoundingClientRect();const last=n.lastElementChild.getBoundingClientRect();return {top:r.top,bottom:r.bottom,hit:n.contains(document.elementFromPoint(last.x+last.width/2,last.y+last.height/2))};});
  assert.ok(menu.top>=0&&menu.bottom<=640&&menu.hit,"dropdown clipped "+JSON.stringify(menu));
  await page.click("#mode-option-1");assert.equal(await page.locator("#mode").inputValue(),"backup");
  await page.click("#mode-trigger");await page.setViewportSize({width:1440,height:720});await page.waitForTimeout(100);assert.equal(await page.locator("#mode-trigger").getAttribute("aria-expanded"),"false");
  await page.click("#mode-trigger");await page.click("#mode-option-0");report.checks.push("menu escapes pane clipping; resize closes it");
  await page.locator(".compression-notice summary").click();await geometry("settings",1440,640,true);await page.locator(".compression-notice summary").click();
  await page.locator(".environment summary").click();await geometry("settings",1440,640,true);await page.locator(".intake").evaluate(n=>n.scrollTop=n.scrollHeight);
  await page.locator(".environment summary").click();report.checks.push("expanded explanations remain reachable");
  const fallbacks=[[1440,500],[1440,639],[1000,700],[768,700],[390,640],[320,568],[844,390],[960,540]];
  for(const [w,h] of fallbacks){
   await geometry("settings",w,h,false);
   await page.locator("#start-button").scrollIntoViewIfNeeded();await page.waitForTimeout(80);
   const action=await page.locator("#start-button").boundingBox(),header=await page.locator(".app-bar").boundingBox();
   assert.ok(action.y>=header.height&&action.y+action.height<=h+1,"fallback action unreachable "+w+"x"+h);
   assert.equal(header.y,0,"fallback header not sticky");
  }
  report.checks.push("short/narrow/zoom-like windows retain scroll and sticky header");
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>scrollTo(0,0));await page.locator(".settings-scroll").evaluate(n=>n.scrollTop=n.scrollHeight);
  await page.locator(".settings-scroll").evaluate(n=>n.scrollTop=0);
  await page.screenshot({path:path.join(evidence,"viewport-settings-1440x900.png")});
  await page.fill("#output-path",path.join(root,".test-output"));await page.click("#start-button");
  await page.waitForFunction(()=>document.querySelector("#workspace-title-status").textContent.includes("已完成"),{},{timeout:60000});
  for(const [w,h] of desktops)await geometry("results",w,h,true);
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(evidence,"viewport-results-1440x900.png")});
  // A recorded real task with running status exercises transient layout only;
  // it does not start another job or change persisted task data.
  const taskId=await page.locator("#history .history-item").first().getAttribute("data-task-id");
  await page.route("**/api/tasks/"+taskId,async route=>{const response=await route.fetch(),data=await response.json();data.status="running";await route.fulfill({response,json:data});});
  await page.locator('#history [data-task-id="'+taskId+'"]').click();await page.locator("#cancel-button").waitFor();
  for(const [w,h] of desktops)await geometry("running",w,h,true);
  await page.click("#new-task");await page.unroute("**/api/tasks/"+taskId);
  assert.deepEqual(report.pageErrors,[]);
  await fs.writeFile(path.join(evidence,"viewport-height.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({cases:report.cases.length,checks:report.checks,pageErrors:report.pageErrors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
