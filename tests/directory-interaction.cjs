/* Composite path geometry + native-picker lifecycle. Uses synthetic media only. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const root=process.cwd(),evidence=path.join(root,".mediaslimx",process.platform==="win32"?"validation-windows":"validation-wsl");
 await fs.mkdir(evidence,{recursive:true});
 const report={geometry:[],native:[],errors:[]};
 const browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(process.env.MSX_URL);await page.locator("#connection[data-connected=true]").waitFor();
  for(const width of [320,390,768,900,1001,1024,1100,1150,1151,1280,1440,1920]){
   await page.setViewportSize({width,height:900});await page.locator("#media-path").focus();await page.waitForTimeout(80);
   const g=await page.evaluate(()=>{
    const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,container:rect(".path-well"),input:rect("#media-path"),browse:rect("#browse-media"),scan:rect("#scan-button"),inputOutline:getComputedStyle(document.querySelector("#media-path")).outlineStyle,containerOutline:getComputedStyle(document.querySelector(".path-well")).outlineStyle};
   });
   assert.equal(g.documentWidth,width);
   assert.ok(Math.abs(g.browse.width-g.scan.width)<.1,"buttons unequal "+width);
   assert.ok(Math.abs(g.browse.height-g.scan.height)<.1&&g.browse.height>=44);
   assert.equal(g.inputOutline,"none");assert.equal(g.containerOutline,"solid");
   assert.ok(g.input.x>=g.container.x&&g.scan.x+g.scan.width<=g.container.x+g.container.width);
   if(width>=768)assert.ok(Math.abs(g.browse.y-g.input.y)<1);
   else assert.ok(g.input.y<g.browse.y);
   report.geometry.push(g);
  }
  await page.setViewportSize({width:1100,height:900});await page.locator("#media-path").focus();
  await page.screenshot({path:path.join(evidence,"path-focus-1100.png")});
  await page.fill("#media-path",path.join(root,".test-media"));await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  await page.locator("#output-path").focus();
  assert.equal(await page.locator("#output-path").evaluate(n=>getComputedStyle(n).outlineStyle),"none");
  assert.equal(await page.locator(".destination-input").first().evaluate(n=>getComputedStyle(n).outlineStyle),"solid");
  report.geometry.push({field:"output",focus:"outer composite"});
  await page.click("#new-task");await page.click("#browse-media");await page.waitForFunction(()=>!document.querySelector("#folder-state").textContent.includes("正在"));
  const hasNative=await page.locator("#native-folder").isVisible();
  if(hasNative){
   // Real helper through the real HTTP endpoint. It is cancelled, never selects data.
   for(const close of [false,true]){
    await page.click("#native-folder");await page.locator("#cancel-native-folder").waitFor();await page.waitForTimeout(700);
    if(close){await page.keyboard.press("Escape");}
    else{await page.click("#cancel-native-folder");}
    await page.waitForFunction(()=>!document.querySelector("#native-folder").disabled,{},{timeout:10000});
    assert.equal(await page.locator("#cancel-native-folder").isVisible(),false);
    if(!close)assert.ok((await page.locator("#folder-state").textContent()).includes("已取消"));
    report.native.push(close?"close dialog cancels real helper":"web cancel terminates real helper");
   }
   // Reopen; deterministic failure and selection responses exercise browser handling.
   await page.click("#browse-media");
   await page.route("**/api/directories/native",route=>route.fulfill({status:400,json:{detail:"测试：选择器不可用，请使用网页浏览"}}));
   await page.click("#native-folder");await page.locator("#folder-state.error").waitFor();
   assert.ok((await page.locator("#folder-state").textContent()).includes("选择器不可用"));
   await page.unroute("**/api/directories/native");
   await page.route("**/api/directories/native",route=>route.fulfill({json:{path:path.join(root,".test-media")}}));
   await page.click("#native-folder");await page.locator("#folder-dialog").waitFor({state:"hidden"});
   assert.equal(await page.locator("#media-path").inputValue(),path.join(root,".test-media"));
   report.native.push("error then retry fills selected field (protocol fixture)");
   await page.unroute("**/api/directories/native");
   await page.click("#browse-media");
   let release;const gate=new Promise(resolve=>release=resolve);
   await page.route("**/api/directories/native",async route=>{await gate;await route.fulfill({json:{path:path.join(root,".test-media","images")}});});
   await page.click("#native-folder");await page.locator("#cancel-native-folder").waitFor();
   await page.keyboard.press("Escape");await page.locator("#media-path").fill(root);await page.click("#browse-media");
   release();await page.waitForFunction(()=>!document.querySelector("#native-folder").disabled);
   assert.equal(await page.locator("#media-path").inputValue(),root);
   assert.equal(await page.locator("#folder-dialog").isVisible(),true);
   report.native.push("late native result cannot fill reopened field");
   await page.unroute("**/api/directories/native");await page.keyboard.press("Escape");
  }else report.native.push("server mode hides native controls");
  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(evidence,"directory-interaction.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({geometryCases:report.geometry.length,native:report.native,errors:report.errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
