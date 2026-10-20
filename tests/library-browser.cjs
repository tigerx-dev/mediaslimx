/* Isolated real-server test: never clears the user's task/shortcut lists. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","library-tests",platform+"-"+crypto.randomUUID()),data=path.join(run,"data"),extra=path.join(run,"extra-directory-with-a-long-name-that-needs-truncation"),unknown=path.join(run,"private");
 await fs.mkdir(extra,{recursive:true});await fs.mkdir(unknown);await fs.writeFile(path.join(extra,"marker.txt"),"keep");
 const source=path.join(project,".test-media");
 const sourceBytes=await fs.readFile(path.join(source,"images","landscape.jpg"));
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--allow-root",extra,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser;
 child.stdout.on("data",data=>stdout+=data.toString());child.stderr.on("data",data=>stderr+=data.toString());
 const base="http://127.0.0.1:"+port,report={checks:[],errors:[]};let token,url;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function api(route,body,extraHeaders={}){
  const r=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body!==undefined?{"Content-Type":"application/json"}:{}),...extraHeaders},body:body===undefined?undefined:JSON.stringify(body)});
  return r;
 }
 async function json(route,body){const r=await api(route,body);assert.equal(r.status,200,route+" "+await r.clone().text());return r.json();}
 try{
  for(let i=0;i<150;i++){
   const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);
   if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}
   if(child.exitCode!==null)throw Error("Test server exited: "+stderr);
   await delay(100);
  }
  assert.ok(url,"Test server did not start");
  const scan=await json("/api/scans",{path:source}),file=scan.entries.find(e=>e.relative==="images/landscape.jpg");
  async function task(){
   const created=await json("/api/tasks",{scan_id:scan.id,selected:[file.id],output:path.join(run,"export")});
   for(let i=0;i<300;i++){const t=await json("/api/tasks/"+created.id);if(t.status==="completed")return t;await delay(100);}
   throw Error("Synthetic export did not finish");
  }
  const a=await task(),b=await task();
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  await page.locator('[data-pin-id="'+a.id+'"]').click();await page.waitForFunction(id=>document.querySelector('[data-pin-id="'+id+'"]')?.getAttribute("aria-pressed")==="true",a.id);
  assert.equal(await page.locator("#history .history-item").first().getAttribute("data-task-id"),a.id);
  const taskLabel=await page.locator("#history .history-item").first().evaluate(button=>({title:button.title,name:button.getAttribute("aria-label"),status:button.getAttribute("aria-describedby"),textOverflow:getComputedStyle(button.querySelector("span")).textOverflow}));
  assert.equal(taskLabel.title,source);assert.equal(taskLabel.name,source);assert.equal(taskLabel.textOverflow,"ellipsis");assert.ok(taskLabel.status);
  await page.click("#history-menu-toggle");await page.click("#clear-history");await page.locator("#clear-list-dialog[open]").waitFor();
  assert.match(await page.locator("#clear-list-description").textContent(),/移出 1 条.*保留 1 条固定/);
  await page.keyboard.press("Escape");assert.equal((await json("/api/tasks")).length,2);
  await page.click("#history-menu-toggle");await page.click("#clear-history");await page.click("#confirm-clear-list");
  await page.waitForFunction(()=>document.querySelector("#history-count").textContent==="1");
  assert.deepEqual((await json("/api/tasks")).map(t=>t.id),[a.id]);assert.equal((await json("/api/tasks?hidden=true"))[0].id,b.id);
  assert.equal((await api("/api/tasks/"+b.id+"/report.csv")).status,200);
  assert.equal((await json("/api/tasks/"+b.id)).status,"completed");
  report.checks.push("fixed task protected, cancel confirmation is inert, cleared task and report stay accessible");
  await page.click("#history-menu-toggle");await page.click("#archived-history");await page.locator("#list-archive-dialog[open]").waitFor();await page.getByRole("button",{name:"恢复到列表",exact:true}).click();
  await page.locator("#list-archive-dialog").waitFor({state:"hidden"});
  assert.equal(await page.evaluate(()=>document.activeElement.id),"history-menu-toggle");assert.equal((await json("/api/tasks")).length,2);
  const bRow=page.locator('[data-task-id="'+b.id+'"]').locator("..");
  assert.equal(await bRow.locator(".history-meta-path").textContent(),path.dirname(source));
  assert.equal(await bRow.locator(".list-pin").evaluate(n=>getComputedStyle(n).opacity),"0");
  assert.equal(await page.locator('[data-pin-id="'+a.id+'"]').evaluate(n=>getComputedStyle(n).opacity),"1");
  await bRow.locator(".history-item").hover({position:{x:18,y:18}});await delay(220);
  assert.equal(await bRow.locator(".history-archive").evaluate(n=>getComputedStyle(n).opacity),"1","row hover must reveal Archive alongside Pin");
  assert.equal(await bRow.locator(".list-pin").evaluate(n=>getComputedStyle(n).opacity),"1","row hover must reveal Pin alongside Archive");
  const actionStyles=await bRow.evaluate(row=>[".history-archive",".list-pin"].map(selector=>{const button=row.querySelector(selector),icon=button.querySelector(".icon"),style=getComputedStyle(button),iconStyle=getComputedStyle(icon);return {background:style.backgroundColor,color:style.color,iconWidth:iconStyle.width,iconHeight:iconStyle.height,width:style.width,height:style.height};}));
  assert.deepEqual(actionStyles[0],actionStyles[1],"Archive and Pin should share the same quiet icon treatment and 44px target");
  await page.screenshot({path:path.join(run,"task-actions-hover.png")});
  await bRow.locator(".history-archive").hover();await delay(220);
  assert.equal(await bRow.locator(".history-archive").evaluate(n=>getComputedStyle(n).opacity),"1");
  await page.locator("#new-task").hover();await delay(220);
  assert.equal(await bRow.locator(".history-archive").evaluate(n=>getComputedStyle(n).opacity),"0");
  await bRow.locator(".history-archive").focus();await delay(220);
  assert.equal(await bRow.locator(".history-archive").evaluate(n=>getComputedStyle(n).opacity),"1","keyboard focus must reveal Archive");
  await page.locator('[data-archive-task-id="'+b.id+'"]').click();await page.waitForFunction(id=>!document.querySelector('[data-task-id="'+id+'"]'),b.id);
  assert.equal(await page.locator("#history-feedback").isHidden(),true);assert.equal(await page.locator("#history-archive-count").textContent(),"1");
  assert.equal((await json("/api/tasks?hidden=true"))[0].id,b.id);
  await page.click("#history-menu-toggle");await page.click("#archived-history");await page.getByRole("button",{name:"恢复到列表",exact:true}).click();
  await page.locator("#list-archive-dialog").waitFor({state:"hidden"});
  assert.equal((await json("/api/tasks")).length,2);
  report.checks.push("Archive and Pin appear together on row hover or keyboard focus, with matching quiet icon styles and 44px targets");
  await page.click("#history-menu-toggle");await page.click("#clear-history");await page.locator("#clear-list-dialog[open]").waitFor();
  await json("/api/tasks/"+b.id+"/pin",{pinned:true});
  await page.click("#confirm-clear-list");await page.locator("#clear-list-dialog").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.querySelector("#clear-history").disabled);
  assert.equal((await json("/api/tasks")).length,2);
  report.checks.push("restore to list works; pin arriving after confirmation is rechecked by server");
  await page.click("#browse-media");await page.waitForFunction(()=>!document.querySelector("#folder-state").textContent.includes("正在"));
  await page.locator("#folder-roots .folder-root").first().click();
  await page.locator(".folder-root-row:has(.folder-root.selected)").waitFor();
  const selectedRoot=await page.locator(".folder-root-row:has(.folder-root.selected)").evaluate(row=>{
   const nav=row.closest("nav").getBoundingClientRect(),label=row.querySelector(".folder-root").getBoundingClientRect(),pin=row.querySelector(".list-pin").getBoundingClientRect(),bg=getComputedStyle(row).backgroundColor;
   return {navWidth:nav.width,labelWidth:label.width,pinWithin:pin.left>=row.getBoundingClientRect().left&&pin.right<=row.getBoundingClientRect().right,background:bg};
  });
  assert.ok(selectedRoot.navWidth>=190&&selectedRoot.labelWidth>=110&&selectedRoot.pinWithin,JSON.stringify(selectedRoot));
  assert.notEqual(selectedRoot.background,"rgba(0, 0, 0, 0)");
  const longRoot=await page.locator("#folder-roots .folder-root").filter({hasText:"extra-directory-with-a-long-name"}).evaluate(button=>{
   const label=button.querySelector(".folder-root-label"),style=getComputedStyle(label);
   return {title:button.title,name:button.getAttribute("aria-label"),visible:label.textContent,overflow:style.textOverflow,clipped:label.scrollWidth>label.clientWidth};
  });
  assert.equal(longRoot.title,extra);assert.equal(longRoot.name,extra);assert.equal(longRoot.overflow,"ellipsis");assert.equal(longRoot.clipped,true);
  await page.getByRole("button",{name:"固定目录 "+extra,exact:true}).click();
  await page.getByRole("button",{name:"取消固定目录 "+extra,exact:true}).waitFor();
  assert.equal(await page.locator("#clear-directory-shortcuts").isDisabled(),true);
  await page.getByRole("button",{name:"取消固定目录 "+extra,exact:true}).click();
  await page.locator("#clear-directory-shortcuts").waitFor();
  await page.waitForFunction(()=>!document.querySelector("#clear-directory-shortcuts").disabled);
  await page.click("#clear-directory-shortcuts");await page.locator("#clear-list-dialog[open]").waitFor();
  assert.match(await page.locator("#clear-list-note").textContent(),/不删除文件夹或改变允许范围/);
  await page.click("#confirm-clear-list");await page.locator("#clear-list-dialog").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.querySelectorAll("#folder-roots .folder-root").length===1);
  assert.ok((await json("/api/environment")).roots.includes(extra));assert.equal((await json("/api/directories/browse",{path:extra})).path,extra);
  assert.equal(await fs.readFile(path.join(extra,"marker.txt"),"utf8"),"keep");
  await page.click("#archived-directory-shortcuts");await page.getByRole("button",{name:"恢复到列表",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll("#folder-roots .folder-root").length===2);
  await page.locator("#list-archive-dialog").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.activeElement.id==="close-folder");await page.keyboard.press("Escape");
  report.checks.push("directory pins and recoverable cleanup work without deleting files or revoking scope");
  assert.equal((await api("/api/tasks/clear-history",{task_ids:[a.id]},{"X-MediaSlimX-Token":"wrong"})).status,401);
  assert.equal((await api("/api/tasks/clear-history",{task_ids:[a.id]},{Origin:"https://example.invalid"})).status,403);
  assert.equal((await api("/api/directories/shortcuts/pin",{path:unknown,pinned:true})).status,400);
  assert.equal((await api("/api/tasks/clear-history",{task_ids:[]})).status,422);
  assert.ok(!(await json("/api/environment")).roots.includes(unknown));
  report.checks.push("authentication, origin and directory-grant boundaries remain enforced");
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
    const geometry=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,small:[...document.querySelectorAll(".list-tools button,.list-pin")].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.width<43.9||r.height<43.9;}).map(n=>n.id||n.title)}));
    assert.equal(geometry.doc,width);assert.deepEqual(geometry.small,[]);
    await page.click("#history-menu-toggle");
    const menu=await page.locator("#history-menu").evaluate(n=>{
     const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,buttons:[...n.querySelectorAll("button")].map(b=>b.getBoundingClientRect().height)};
    });
    assert.ok(menu.left>=0&&menu.right<=width+1&&menu.top>=0&&menu.bottom<=900&&menu.buttons.every(h=>h>=43.9),JSON.stringify({width,lang,menu}));
    await page.keyboard.press("Escape");assert.equal(await page.locator("#history-menu").isHidden(),true);
    if(width===320||width===1440){
     const clipped=await page.locator("#history .history-item").first().evaluate(button=>{
      const name=button.querySelector("span"),original=name.textContent;
      name.textContent="a-very-long-media-directory-name-that-must-not-displace-the-pin";
      const result=name.scrollWidth>name.clientWidth;name.textContent=original;return result;
     });
     assert.equal(clipped,true,"history name should truncate at width "+width);
    }
   }
   await page.click("#browse-media");
   await page.waitForFunction(()=>!/(正在读取目录|Reading folders)/.test(document.querySelector("#folder-state").textContent));
   await page.locator("#folder-roots .folder-root-label").filter({hasText:"extra-directory-with-a-long-name"}).waitFor();
   const current=await page.locator("#folder-current").textContent();
   assert.ok(current===source||current===(lang==="en"?"Choose an allowed root":"请选择一个允许根目录"),current);
   const label=await page.locator("#folder-roots .folder-root").filter({hasText:"extra-directory-with-a-long-name"}).evaluate(button=>({path:button.title,name:button.getAttribute("aria-label"),clipped:button.querySelector(".folder-root-label").scrollWidth>button.querySelector(".folder-root-label").clientWidth}));
   assert.equal(label.path,extra);assert.equal(label.name,extra);assert.equal(label.clipped,true);
   await page.waitForTimeout(300);await page.screenshot({path:path.join(run,"folder-"+lang+"-desktop.png")});
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.screenshot({path:path.join(run,"folder-"+lang+"-narrow.png")});
   await page.keyboard.press("Escape");
  }
  await page.screenshot({path:path.join(run,"library.png")});assert.deepEqual(report.errors,[]);
  assert.deepEqual(await fs.readFile(path.join(source,"images","landscape.jpg")),sourceBytes);
  report.checks.push("Chinese/English 320/390/768/1440: long names truncate with full path available, no horizontal overflow, list controls >=44px; source bytes unchanged");
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,...report},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){
   if(process.platform==="win32")await new Promise(resolve=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",resolve);});
   else{child.kill("SIGTERM");await Promise.race([new Promise(resolve=>child.on("close",resolve)),delay(5000)]);}
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
