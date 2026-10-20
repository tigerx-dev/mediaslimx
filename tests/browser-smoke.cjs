/* Optional UI acceptance. Product runtime does not require Node or Playwright.
   MSX_URL must be the local URL including #token= from the launcher.
   Install playwright into an ignored directory and set MSX_PLAYWRIGHT to it. */
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const root=process.cwd(), source=path.join(root,".test-media"), evidence=path.join(root,".mediaslimx",process.platform==="win32"?"validation-windows":"validation-wsl");
 await fs.mkdir(evidence,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.MSX_CHROME||(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"/usr/bin/google-chrome"),headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});
  async function choose(id,value){
   const label=await page.locator("#"+id).evaluate((n,v)=>[...n.options].find(o=>o.value===v).text,value);
   await page.click("#"+id+"-trigger");await page.locator("#"+id+"-options").getByRole("option",{name:label,exact:true}).click();
  }
  const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
  await page.goto(process.env.MSX_URL);
  await page.locator("#connection").filter({hasText:"已连接"}).waitFor();
  assert.equal(await page.locator("#empty-section").isVisible(),true);
  await page.screenshot({path:path.join(evidence,"empty-desktop.png"),fullPage:true});
  await page.fill("#media-path",source);await page.click("#browse-media");
  await page.locator("#folder-dialog[open]").waitFor();await page.getByRole("button",{name:"images",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector("#folder-current").textContent.endsWith("images"));await page.click("#folder-up");
  await page.waitForFunction(()=>document.querySelector("#folder-current").textContent.endsWith(".test-media"));
  await page.click("#choose-folder");await page.locator("#folder-dialog").waitFor({state:"hidden"});
  await page.locator("#scan-section").waitFor();
  assert.equal(await page.locator("#scan-body tr").count(),7);
  assert.match(await page.locator("#selection-count").innerText(),/5/);
  await page.fill("#output-path",path.join(root,".test-output"));
  await page.click("#start-button");
  await page.waitForFunction(()=>document.querySelector("#workspace-title-status").textContent.includes("已完成"),{},{timeout:60000});
  assert.equal(await page.locator("#result-body tr").count(),7);
  assert.match(await page.locator("#status-counts").innerText(),/无收益 1/);
  await page.screenshot({path:path.join(evidence,"export-desktop.png"),fullPage:true});
  const imageRow=page.locator("#result-body tr").filter({hasText:"images/landscape.jpg"});
  await imageRow.getByRole("button",{name:"详情"}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid img")].length===2&&[...document.querySelectorAll("#preview-grid img")].every(x=>x.complete&&x.naturalWidth>0));
  await page.screenshot({path:path.join(evidence,"image-comparison.png"),fullPage:true});
  await page.click("#close-detail");
  const videoRow=page.locator("#result-body tr").filter({hasText:"video/sample.mp4"});
  await videoRow.getByRole("button",{name:"详情"}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll("#preview-grid video")].length===2&&[...document.querySelectorAll("#preview-grid video")].every(x=>x.readyState>=1),{},{timeout:30000});
  await page.evaluate(async()=>{const videos=[...document.querySelectorAll("#preview-grid video")];for(const v of videos){v.muted=true;await v.play();v.pause();}});
  await page.click("#close-detail");
  const download=page.waitForEvent("download");await page.click("#export-report");await (await download).saveAs(path.join(evidence,"export.csv"));
  const csv=await fs.readFile(path.join(evidence,"export.csv"),"utf8");assert.ok(csv.includes("images/landscape.jpg"));assert.ok(!csv.includes(source));
  await choose("status-filter","unsupported");assert.equal(await page.locator("#result-body tr").count(),1);await choose("status-filter","");
  await choose("sort-order","saving");
  await page.reload();await page.locator("#connection").filter({hasText:"已连接"}).waitFor();
  await page.locator("#history button").first().click();
  await page.locator("#workspace-title-status").filter({hasText:"已完成"}).waitFor();
  const original=await fs.readFile(path.join(source,"images","landscape.jpg"));
  await page.click("#new-task");await page.fill("#media-path",source);await page.click("#scan-button");await page.locator("#settings-section").waitFor();
  await choose("mode","backup");await page.fill("#backup-path",path.join(root,".test-backup"));await page.click("#start-button");
  await page.waitForFunction(()=>document.querySelector("#workspace-title-status").textContent.includes("已完成")&&document.querySelector("#result-root").textContent.includes("备份覆盖"),{},{timeout:60000});
  assert.notDeepEqual(await fs.readFile(path.join(source,"images","landscape.jpg")),original);
  await page.click("#restore-all");
  await page.waitForFunction(()=>document.querySelector("#status-counts").textContent.includes("已恢复"));
  assert.deepEqual(await fs.readFile(path.join(source,"images","landscape.jpg")),original);
  await page.screenshot({path:path.join(evidence,"restore-desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.click("#new-task");
  await page.screenshot({path:path.join(evidence,"empty-mobile.png"),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,"mobile page must not overflow horizontally");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({directoryBrowser:"passed",browser:"Chrome",scanCandidates:7,selected:5,export:"passed",imageComparison:"passed",videoPlayback:"passed",report:"passed",historyAfterReload:"passed",backupRestore:"passed",mobileOverflow:false,pageErrors:errors,evidence},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
