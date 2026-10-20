/* Real resizing export, safe default serialization, destination guidance and environment disclosure. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const root=process.cwd(),evidence=path.join(root,".mediaslimx",process.platform==="win32"?"validation-windows":"validation-wsl");
 const browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const report={checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(process.env.MSX_URL);await page.locator("#connection[data-connected=true]").waitFor();
  async function scan(){
   await page.fill("#media-path",path.join(root,".test-media"));await page.click("#scan-button");await page.locator("#settings-section").waitFor();
   await page.click("#select-none");await page.getByRole("checkbox",{name:"选择 images/landscape.jpg",exact:true}).check();
   await page.fill("#output-path",path.join(root,".test-output"));
  }
  async function chooseMode(value){
   await page.locator("#mode-trigger").scrollIntoViewIfNeeded();await page.waitForTimeout(80);await page.click("#mode-trigger");await page.getByRole("option",{name:{export:"导出至新目录（推荐）",backup:"备份后覆盖原文件",overwrite:"直接覆盖，无备份"}[value],exact:true}).click();
  }
  async function finish(){
   const request=page.waitForRequest(r=>r.url().endsWith("/api/tasks")&&r.method()==="POST");
   const response=page.waitForResponse(r=>r.url().endsWith("/api/tasks")&&r.request().method()==="POST");
   await page.click("#start-button");const body=(await request).postDataJSON(),id=(await (await response).json()).id;
   let data;const deadline=Date.now()+60000;
   do{
    data=await page.evaluate(async id=>(await fetch("/api/tasks/"+id,{headers:{"X-MediaSlimX-Token":sessionStorage.getItem("mediaslimx-token")}})).json(),id);
    if(data.status==="completed")break;
    await page.waitForTimeout(100);
   }while(Date.now()<deadline);
   assert.equal(data.status,"completed","export did not finish");
   await page.locator('#history [data-task-id="'+id+'"][data-active=true]').waitFor();
   return {body,data,entry:data.entries.find(e=>e.relative==="images/landscape.jpg")};
  }
  const source=path.join(root,".test-media","images","landscape.jpg"),before=crypto.createHash("sha256").update(await fs.readFile(source)).digest("hex");
  await scan();assert.equal(await page.locator("#resize-fields").isVisible(),false);
  await page.check("#resize-fit");await page.fill("#max-width","640");await page.fill("#max-height","640");
  assert.ok((await page.locator("#resize-preview").textContent()).includes("1280×800 → 640×400"));
  await page.check("#resize-keep");assert.equal(await page.locator("#max-width").isDisabled(),true);
  const normal=await finish();assert.equal(normal.body.max_width,null);assert.equal(normal.body.max_height,null);assert.equal(normal.entry.result_info.width,1280);
  const selectedRow=page.locator('#history [data-task-id="'+normal.data.id+'"][data-active=true]');
  assert.equal(await page.locator(".header-note").textContent(),"本地批量压缩工具");
  assert.equal(await page.locator("#workspace-title-name").textContent(),path.basename(path.join(root,".test-media")));
  assert.equal(await page.locator("#workspace-title-status").textContent(),"已完成");
  assert.match(await selectedRow.textContent(),/已完成/);
  await page.click("#new-task");assert.equal(await page.locator("#workspace-title-name").textContent(),"新建任务");
  await page.locator('#history [data-task-id="'+normal.data.id+'"]').click();
  assert.equal(await page.locator("#workspace-title-name").textContent(),path.basename(path.join(root,".test-media")));
  await page.click("#new-task");
  report.checks.push("created and completed task stays in history; selected row and main task heading agree");
  report.checks.push("default compression ignores stale disabled dimensions");
  await scan();assert.equal(await page.locator("#resize-keep").isChecked(),true);
  await chooseMode("backup");assert.match(await page.locator("#plan-effect").textContent(),/复制原件.*写回原路径.*不移动/);
  assert.match(await page.locator("#plan-paths").textContent(),/原件备份位置预览/);
  await chooseMode("overwrite");assert.match(await page.locator("#plan-effect").textContent(),/不保留原件.*无法恢复/);
  await chooseMode("export");assert.match(await page.locator("#plan-effect").textContent(),/原文件保持原位/);
  assert.match(await page.locator("#plan-paths").textContent(),/本次任务目录.*images[\\/]landscape.jpg/);
  report.checks.push("three output modes explain copy vs replacement and preserve relative naming");
  await page.check("#resize-fit");await page.fill("#max-width","640");await page.fill("#max-height","640");
  await page.setViewportSize({width:1440,height:640});await page.locator(".environment summary").click();
  const geometry=await page.evaluate(()=>{const n=document.querySelector(".intake"),b=document.querySelector("#start-button").getBoundingClientRect();return {overflow:n.scrollHeight-n.clientHeight,start:b.bottom,viewport:innerHeight};});
  assert.ok(geometry.overflow<=1&&geometry.start<=640,"environment overview displaced primary action "+JSON.stringify(geometry));
  await page.click("#open-environment");await page.locator("#environment-dialog[open]").waitFor();
  await page.locator(".environment-content").evaluate(n=>n.scrollTop=n.scrollHeight);
  const visible=await page.locator("#privacy").evaluate(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.bottom<=p.bottom+1;});
  assert.equal(visible,true);await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"open-environment");
  await page.screenshot({path:path.join(evidence,"environment-overview-1440x640.png")});
  await page.locator(".environment summary").click();
  await page.setViewportSize({width:390,height:640});await page.locator(".environment summary").click();await page.locator("#environment-dialog[open]").waitFor();await page.waitForTimeout(260);
  assert.equal(await page.locator(".environment").evaluate(n=>n.open),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.screenshot({path:path.join(evidence,"environment-mobile.png")});
  await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.tagName),"SUMMARY");
  report.checks.push("desktop two-row overview and mobile dialog avoid clipped environment details; focus returns");
  await page.setViewportSize({width:1440,height:900});
  async function colors(){return page.evaluate(()=>["main",".settings-scroll",".table-wrap",".environment-content"].map(selector=>getComputedStyle(document.querySelector(selector)).scrollbarColor));}
  const dark=await colors();assert.equal(new Set(dark).size,1);
  await page.click("#theme-toggle");const light=await colors();assert.equal(new Set(light).size,1);assert.notEqual(light[0],dark[0]);await page.click("#theme-toggle");
  report.checks.push("scrollbar colors are shared across panes and change with theme");
  await page.locator(".settings-scroll").evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:path.join(evidence,"output-guidance.png")});
  const resized=await finish();assert.equal(resized.body.max_width,640);assert.equal(resized.body.max_height,640);
  assert.ok((await page.locator("#result-paths").textContent()).includes(path.join(resized.data.output_root,resized.data.folder_name||resized.data.id)));
  assert.equal(await page.locator("#result-paths button[data-folder-slot]").count(),0);
  assert.equal(resized.entry.status,"success");assert.deepEqual([resized.entry.result_info.width,resized.entry.result_info.height],[640,400]);
  assert.equal(crypto.createHash("sha256").update(await fs.readFile(source)).digest("hex"),before);
  report.checks.push("real export resizes 1280x800 to 640x400 and leaves source bytes unchanged");
  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(evidence,"settings-guidance.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
