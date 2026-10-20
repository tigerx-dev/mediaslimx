/* Real-browser geometry, keyboard, theme and interruption checks. */
const assert=require("node:assert/strict"), fs=require("node:fs/promises"), path=require("node:path");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const root=process.cwd(), evidence=path.join(root,".mediaslimx",process.platform==="win32"?"validation-windows":"validation-wsl");
 await fs.mkdir(evidence,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const report={viewports:[],themes:[],keyboard:[],states:[],pageErrors:[],unexpectedHTTP:[],reducedMotion:null};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on("pageerror",e=>report.pageErrors.push(e.message));
  let expectedError=false;
  page.on("response",r=>{if(r.status()>=400&&!expectedError)report.unexpectedHTTP.push({path:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(process.env.MSX_URL);await page.locator("#connection[data-connected=true]").waitFor();
  async function audit(stage,width){
   await page.setViewportSize({width,height:1000});
   await page.waitForTimeout(350);
   if(stage==="dropdown"&&await page.locator("#mode-trigger").getAttribute("aria-expanded")==="false"){await page.click("#mode-trigger");await page.waitForTimeout(260);}
   const data=await page.evaluate(()=>{
    const elements=[...document.querySelectorAll("button,a,input,select,textarea,summary,[role=combobox]")].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=="hidden");
    const metrics=elements.map(n=>{const r=n.getBoundingClientRect();return {id:n.id||n.getAttribute("aria-label")||n.textContent.trim().slice(0,30)||n.tagName,width:r.width,height:r.height};});
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,minWidth:Math.min(...metrics.map(n=>n.width)),minHeight:Math.min(...metrics.map(n=>n.height)),offenders:metrics.filter(n=>n.width<43.9||n.height<43.9)};
   });
   data.stage=stage;report.viewports.push(data);
   assert.equal(data.document,data.viewport,stage+" page overflow at "+width);
   assert.deepEqual(data.offenders,[],stage+" targets below 44px at "+width+": "+JSON.stringify(data.offenders));
  }
  for(const width of [320,390,768,1440])await audit("empty",width);
  assert.equal(await page.locator("#theme-toggle use").getAttribute("href"),"/static/icons.svg#sun");
  report.themes.push("dark");await page.screenshot({path:path.join(evidence,"skin-dark.png"),fullPage:true});
  await page.click("#theme-toggle");assert.equal(await page.locator("html").getAttribute("data-theme"),"light");assert.equal(await page.locator("#theme-toggle use").getAttribute("href"),"/static/icons.svg#moon");assert.equal(await page.locator("#theme-toggle").getAttribute("title"),"切换为深色主题");
  await page.waitForTimeout(250);await page.screenshot({path:path.join(evidence,"skin-light.png"),fullPage:true});report.themes.push("light");
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();assert.equal(await page.locator("html").getAttribute("data-theme"),"light");assert.equal(await page.locator("#theme-toggle use").getAttribute("href"),"/static/icons.svg#moon");assert.equal(await page.locator("#theme-toggle").getAttribute("title"),"切换为深色主题");
  await page.click("#theme-toggle");
  await page.locator("#browse-media").focus();await page.keyboard.press("Alt+o");await page.locator("#folder-dialog[open]").waitFor();
  const focusEntry=await page.evaluate(()=>document.activeElement.id);
  await page.waitForFunction(()=>!document.querySelector("#folder-state").textContent.includes("正在"));
  for(const width of [320,390,768,1440])await audit("folder-dialog",width);
  await page.keyboard.press("Escape");await page.locator("#folder-dialog").waitFor({state:"hidden"});
  assert.equal(await page.evaluate(()=>document.activeElement.id),"browse-media");
  report.keyboard.push({interaction:"Alt+O / Escape",focusEntry,focusReturn:"browse-media"});
  const source=path.join(root,".test-media");
  await page.fill("#media-path",path.join(source,"missing-directory"));expectedError=true;await page.click("#scan-button");await page.locator("#message").waitFor();report.states.push("error");
  await page.fill("#media-path",source);expectedError=false;await page.click("#scan-button");await page.locator("#settings-section").waitFor();report.states.push("retry-success");
  for(const width of [320,390,768,1440])await audit("scan-settings",width);
  await page.screenshot({path:path.join(evidence,"skin-settings.png"),fullPage:true});
  await page.locator("#mode-trigger").focus();await page.keyboard.press("Enter");await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  assert.equal(await page.locator("#mode").inputValue(),"backup");assert.equal(await page.locator("#backup-field").isVisible(),true);
  await page.keyboard.press("Enter");await page.keyboard.press("Home");await page.keyboard.press("Enter");
  assert.equal(await page.locator("#mode").inputValue(),"export");
  await page.keyboard.press("Enter");for(const width of [320,390,768,1440])await audit("dropdown",width);await page.screenshot({path:path.join(evidence,"skin-dropdown.png"),fullPage:true});await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(()=>document.activeElement.id),"mode-trigger");report.keyboard.push({interaction:"select Enter / arrows / Home / Escape",value:"export",focusReturn:"mode-trigger"});
  await page.fill("#output-path",path.join(root,".test-output"));await page.click("#start-button");
  await page.waitForFunction(()=>document.querySelector("#workspace-title-status").textContent.includes("已完成"),{},{timeout:60000});report.states.push("export-success");
  for(const width of [320,390,768,1440])await audit("results",width);
  await page.click("#new-task");await page.fill("#media-path",source);
  await page.route("**/api/scans",async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
  await page.click("#scan-button");assert.equal(await page.locator("#scan-button").isDisabled(),true);report.states.push("pending");
  await page.click("#new-task");await page.waitForTimeout(2000);
  assert.equal(await page.locator("#scan-section").isVisible(),false);assert.equal(await page.locator("#empty-section").isVisible(),true);
  await page.unroute("**/api/scans");report.states.push("interrupted-read-discards-stale-response");
  await page.emulateMedia({reducedMotion:"reduce"});await page.click("#browse-media");await page.locator("#folder-dialog[open]").waitFor();
  const duration=await page.locator("#folder-dialog").evaluate(n=>getComputedStyle(n).animationDuration);
  assert.ok(parseFloat(duration)<=.001);report.reducedMotion={emulated:"reduce",dialogAnimationDuration:duration};
  await page.keyboard.press("Escape");
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.unexpectedHTTP,[]);
  await fs.writeFile(path.join(evidence,"ui-audit.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({viewportCases:report.viewports.length,minWidth:Math.min(...report.viewports.map(x=>x.minWidth)),minHeight:Math.min(...report.viewports.map(x=>x.minHeight)),offenders:report.viewports.reduce((n,x)=>n+x.offenders.length,0),themes:report.themes,keyboard:report.keyboard,states:report.states,pageErrors:report.pageErrors,unexpectedHTTP:report.unexpectedHTTP,reducedMotion:report.reducedMotion},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
