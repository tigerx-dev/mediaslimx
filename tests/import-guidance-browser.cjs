/* Import-boundary guidance against an isolated local service and tiny synthetic
   JPEGs. Large-file cases supply metadata only: no multi-GiB buffers or uploads. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");

(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-guidance-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
 const report={checks:[],layouts:[],helperLayouts:[],workspaces:[],errors:[]};let child,browser,page,token,url,stdout="",stderr="";
 await fs.mkdir(source,{recursive:true});
 const make=spawn(python,["-c","from PIL import Image; import pathlib,sys; p=pathlib.Path(sys.argv[1]); Image.new('RGB',(32,24),(80,150,120)).save(p/'first.jpg',quality=100); Image.new('RGB',(24,32),(150,80,120)).save(p/'second.jpg',quality=100)",source],{stdio:["ignore","pipe","pipe"]});
 let fixtureError="";make.stderr.on("data",chunk=>fixtureError+=chunk);assert.equal(await new Promise(resolve=>make.on("close",resolve)),0,fixtureError);
 const jpeg=await fs.readFile(path.join(source,"first.jpg")),originalHashes={};for(const name of ["first.jpg","second.jpg"])originalHashes[name]=hash(await fs.readFile(path.join(source,name)));
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));assert.ok(![8765,8766].includes(port));
 const base="http://127.0.0.1:"+port;
 child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);
 async function api(route){return fetch(base+route,{headers:{"X-MediaSlimX-Token":token}});}
 async function json(route){const response=await api(route);assert.equal(response.status,200,route+" "+await response.clone().text());return response.json();}
 async function stop(){
  if(!child||child.exitCode!==null)return;
  if(platform==="windows")await new Promise(resolve=>{const owned=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});owned.on("close",resolve);});
  else{child.kill("SIGTERM");await Promise.race([new Promise(resolve=>child.on("close",resolve)),delay(5000)]);}
 }
 try{
  for(let i=0;i<150;i++){
   const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);
   if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}
   if(child.exitCode!==null)throw Error(stderr);await delay(100);
  }
  assert.ok(url,"private service did not announce readiness");
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  page=await browser.newPage({viewport:{width:1440,height:900}});page.on("pageerror",error=>report.errors.push(error.message));
  const requests={allocate:0,upload:0,scan:0,task:0,discard:0,external:[]};
  page.on("request",request=>{
   const address=new URL(request.url());
   if(!request.url().startsWith(base+"/"))requests.external.push(request.url());
   if(request.method()==="POST"&&address.pathname==="/api/imports")requests.allocate++;
   if(request.method()==="PUT"&&/^\/api\/imports\/[^/]+\/files\//.test(address.pathname))requests.upload++;
   if(request.method()==="POST"&&address.pathname==="/api/scans")requests.scan++;
   if(request.method()==="POST"&&address.pathname==="/api/tasks")requests.task++;
   if(request.method()==="POST"&&/^\/api\/imports\/[^/]+\/discard$/.test(address.pathname))requests.discard++;
  });
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  assert.equal(await page.locator("#choose-import-folder").textContent(),"导入文件夹副本");
  assert.equal(await page.locator("#empty-scan-directory").textContent(),"扫描运行设备目录");
  assert.equal(await page.locator("#empty-import-limit").isVisible(),true,"limits must be visible without hovering");
  assert.match(await page.locator("#empty-import-limit").textContent(),/200/);assert.match(await page.locator("#empty-import-limit").textContent(),/2 GiB/);
  const helperStyle=()=>page.locator("#empty-scan-directory").evaluate(button=>{const style=getComputedStyle(button);return {background:style.backgroundColor,border:style.borderColor,color:style.color,decoration:style.textDecorationLine,decorationStyle:style.textDecorationStyle,height:button.getBoundingClientRect().height};});
  const helperIdle=await helperStyle();assert.ok(helperIdle.height>=43.9);
  assert.equal(helperIdle.border,"rgba(0, 0, 0, 0)","folder-scan text link should not have an outline box");
  assert.match(helperIdle.decoration,/underline/,"folder-scan action should read as a text link");
  assert.equal(helperIdle.decorationStyle,"dashed","folder-scan text link should have a dashed underline at rest");
  await page.locator("#empty-scan-directory").hover();await delay(180);
  const helperHover=await helperStyle();assert.notEqual(helperHover.color,helperIdle.color,"folder-scan link needs visible hover feedback");assert.equal(helperHover.decorationStyle,"solid","folder-scan link should gain a solid underline on hover");
  report.checks.push("empty-state folder-scan action has a dashed underline at rest, solid underline on hover, and a 44px target");
  report.checks.push("empty-state import limits are visible before import, including 200 files and 2 GiB");
  async function auditHelper(selector,buttonId,kind){
   const helper=page.locator(selector);await helper.scrollIntoViewIfNeeded();
   const result=await helper.evaluate(row=>{
    const issues=[],visible=node=>!!node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden";
    const bounds=row.getBoundingClientRect();if(bounds.left<-.5||bounds.right>innerWidth+.5||row.scrollWidth>row.clientWidth+1)issues.push("helper horizontal overflow");
    const tree=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node,minFont=Infinity;
    while(node=tree.nextNode())if(node.textContent.trim()&&visible(node.parentElement)){const size=parseFloat(getComputedStyle(node.parentElement).fontSize);minFont=Math.min(minFont,size);if(size<12)issues.push("text below 12px");}
    for(const button of row.querySelectorAll("button"))if(visible(button)){const b=button.getBoundingClientRect();if(b.width<43.9||b.height<43.9)issues.push("small target "+button.id);if(button.scrollWidth>button.clientWidth+1)issues.push("button text overflow "+button.id);}
    return {issues,minFont};
   });
   assert.deepEqual(result.issues,[],kind+" "+JSON.stringify(result));
   await page.locator("#"+buttonId).scrollIntoViewIfNeeded();assert.equal(await page.locator("#"+buttonId).evaluate(button=>{const b=button.getBoundingClientRect();return button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true,kind+" button reachable");
   report.helperLayouts.push({kind,language:await page.locator("html").getAttribute("lang"),viewport:page.viewportSize(),...result});
  }
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const width of [320,1440]){await page.setViewportSize({width,height:640});await auditHelper(".empty-import-guidance","empty-scan-directory","empty");}
  }
  await page.click("#language-toggle");await page.setViewportSize({width:1440,height:900});

  // Use real browser File objects for the existing pending import.
  await page.locator("#import-file-input").setInputFiles([{name:"保留选择.jpg",mimeType:"image/jpeg",buffer:jpeg},{name:"second.jpg",mimeType:"image/jpeg",buffer:jpeg}]);
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===2&&!importState.busy);
  const lastRow=page.locator("#scan-body tr").last(),lastBox=lastRow.locator("input[type=checkbox]");
  await lastRow.locator("td:nth-child(2)").click();assert.equal(await lastBox.isChecked(),false,"clicking path deselects row");
  await lastRow.locator("td:last-child").click();assert.equal(await lastBox.isChecked(),true,"clicking status selects row");
  await lastBox.uncheck();assert.equal(await lastBox.isChecked(),false,"direct checkbox click toggles only once");
  await lastBox.focus();await page.keyboard.press("Space");assert.equal(await lastBox.isChecked(),true,"native checkbox remains keyboard operable");
  await page.evaluate(()=>{const button=document.createElement("button");button.type="button";button.textContent="detail";document.querySelector("#scan-body tr:last-child td:last-child").append(button);});
  await lastRow.locator("td:last-child button").click();assert.equal(await lastBox.isChecked(),true,"nested action must not toggle row");
  await page.evaluate(()=>{state.scan.entries.push({...state.scan.entries[0],id:"unsupported-ui-fixture",status:"unsupported",reason:"unsupported"});renderScan();});
  const disabledRow=page.locator("#scan-body tr").filter({has:page.locator("input[disabled]")});
  await disabledRow.locator("td:nth-child(2)").click();assert.equal(await disabledRow.locator("input").isChecked(),false,"unsupported row stays unselected");
  await page.evaluate(()=>{state.scan.entries=state.scan.entries.filter(e=>e.id!=="unsupported-ui-fixture");renderScan();});
  report.checks.push("eligible scan rows toggle on path/status clicks; checkbox and Space each toggle once; nested action and unsupported row do not toggle");
  await page.locator("#scan-body input[type=checkbox]").last().uncheck();
  await page.locator("#output-path").fill(path.join(run,"custom-export"));
  const snapshot=()=>page.evaluate(()=>({scan:state.scan,selected:[...state.selected],output:$("output-path").value,mode:$("mode").value,batch:importState.batch}));
  const pending=await snapshot();
  async function assertPreserved(expected=pending){assert.deepEqual(await snapshot(),expected);assert.equal(requests.task,0,"guidance must never start an optimization task");}
  const backBefore={discard:requests.discard,scan:requests.scan};
  await page.click("#back-directory");await page.locator("#folder-dialog[open]").waitFor();await page.locator("#choose-folder:not([disabled])").waitFor();await page.keyboard.press("Escape");
  await page.locator("#folder-dialog").waitFor({state:"hidden"});assert.equal(requests.discard,backBefore.discard);assert.equal(requests.scan,backBefore.scan);await assertPreserved();
  report.checks.push("large-batch directory shortcut opens the chooser; Escape preserves the import and sends neither discard nor scan");
  async function assertLimit(action,expected=pending){
   const before={allocate:requests.allocate,upload:requests.upload};
   // A failed preflight must not reach the allocator. Abort any regression so
   // fabricated large-file metadata can never reserve or write disk space.
   await page.route(base+"/api/imports",route=>route.abort());
   try{await action();await page.waitForFunction(()=>!importState.busy);await page.locator("#intake-guidance[data-state=limit]").waitFor();}
   finally{await page.unroute(base+"/api/imports");}
   assert.equal(requests.allocate,before.allocate,"limit reached allocator");assert.equal(requests.upload,before.upload,"limit reached binary upload");
   assert.equal(await page.locator("#intake-guidance").getAttribute("role"),"status");assert.equal(await page.locator("#guidance-scan").isVisible(),true);
   await assertPreserved(expected);
  }
  await assertLimit(()=>page.evaluate(()=>importFiles(Array.from({length:201},(_,i)=>new File(["x"],"item-"+i+".jpg",{type:"image/jpeg"})))));
  report.checks.push("201 files rejected before allocation/upload; pending scan, selection, custom output and export mode preserved");
  await assertLimit(()=>page.evaluate(()=>importFiles([{name:"one.jpg",size:1024**3},{name:"two.jpg",size:1024**3},{name:"three.jpg",size:1}])));
  assert.match(await page.locator("#guidance-detail").textContent(),/2 GiB/);
  report.checks.push("2 GiB plus one byte rejected using metadata only, with no upload or state loss");
  const pendingBytes=pending.scan.entries.reduce((sum,entry)=>sum+entry.size,0);
  await assertLimit(()=>page.evaluate(existingBytes=>importFiles([{name:"one.jpg",size:1024**3},{name:"two.jpg",size:1024**3-existingBytes+1}]),pendingBytes));
  report.checks.push("cumulative pending bytes plus append reaching 2 GiB plus one byte are also rejected before allocation/upload");
  await assertLimit(()=>page.evaluate(()=>{
   let once=false;const root={name:"Folder",isDirectory:true,createReader(){return {readEntries(resolve){resolve(once?[]:(once=true,Array.from({length:201},(_,i)=>({name:"item-"+i+".jpg",isFile:true,file:resolve=>resolve(new File(["x"],"item-"+i+".jpg"))}))));}};}};
   return importFiles([],[root]);
  }));
  report.checks.push("dragged-folder enumeration uses the same pre-upload boundary and preserves the pending list");

  // Both chooser dismissal paths preserve the usable imported list.
  for(const dismiss of ["escape","close"]){
   const scanCount=requests.scan;await page.click("#guidance-scan");await page.locator("#folder-dialog[open]").waitFor();await page.locator("#choose-folder:not([disabled])").waitFor();
   assert.match(await page.locator("#choose-folder").textContent(),/扫描此目录/);
   if(dismiss==="escape")await page.keyboard.press("Escape");else await page.click("#close-folder");
   await page.locator("#folder-dialog").waitFor({state:"hidden"});assert.equal(requests.scan,scanCount);await assertPreserved();
  }
  report.checks.push("folder chooser Escape/close performs no scan or discard; explicit action says Scan this folder");

  // Simulate a normal server validation error, then retry the actual allowed
  // directory. No data is changed until a complete scan succeeds.
  await page.route(base+"/api/scans",route=>route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({detail:"测试目录无法读取"})}));
  await page.click("#guidance-scan");await page.locator("#choose-folder:not([disabled])").waitFor();await page.click("#choose-folder");
  await page.locator("#intake-guidance[data-state=error]").waitFor();assert.match(await page.locator("#intake-guidance").textContent(),/测试目录无法读取/);await assertPreserved();await page.unroute(base+"/api/scans");
  report.checks.push("directory scan validation failure keeps the original import, selected IDs, output and mode usable");

  // Verify busy guidance with a held real request before allowing a successful
  // source transition. Only this private request is delayed.
  let releaseScan,scanReached;const gate=new Promise(resolve=>releaseScan=resolve),reached=new Promise(resolve=>scanReached=resolve);
  await page.route(base+"/api/scans",async route=>{scanReached();await gate;await route.continue();});
  await page.click("#guidance-scan");await page.locator("#choose-folder:not([disabled])").waitFor();await page.click("#choose-folder");
  await Promise.race([reached,delay(5000).then(()=>{throw Error("explicit scan request missing");})]);
  await page.locator("#intake-guidance[data-state=scanning]").waitFor();await assertPreserved();releaseScan();
  await page.waitForFunction(()=>state.scan&&state.scan.source_kind!=="import");await page.unroute(base+"/api/scans");
  assert.equal(await page.locator("#mode").inputValue(),"export");assert.equal(await page.evaluate(()=>state.task),null);assert.equal(requests.task,0);
  assert.deepEqual((await page.evaluate(()=>state.scan.entries.map(entry=>entry.relative))).sort(),["first.jpg","second.jpg"]);
  report.checks.push("only explicit Scan this folder sends scan; pending import survives while scanning, success switches to directory/export and creates no task");
  await page.locator("#output-path").fill(path.join(run,"directory-settings-kept"));
  await page.evaluate(()=>{$("mode").value="backup";$("mode").dispatchEvent(new Event("change"));});
  await page.locator("#scan-body input[type=checkbox]").first().uncheck();
  const directoryPending=await snapshot();
  await assertLimit(()=>page.evaluate(()=>importFiles(Array.from({length:201},(_,i)=>new File(["x"],"new-"+i+".jpg",{type:"image/jpeg"})))),directoryPending);
  report.checks.push("a rejected import also preserves an existing directory scan, unselected row and backup mode instead of silently resetting to export");

  // Fill exactly 200 with tiny real media; appending the 201st must fail in the
  // browser before a new allocation. This catches cumulative-list regressions.
  await page.click("#new-task");
  await page.evaluate(bytes=>importFiles(Array.from({length:200},(_,i)=>new File([new Uint8Array(bytes)],"pending-"+String(i).padStart(3,"0")+".jpg",{type:"image/jpeg"}))),[...jpeg]);
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===200&&!importState.busy,{},{timeout:30000});
  await page.locator("#scan-body input[type=checkbox]").first().uncheck();await page.locator("#output-path").fill(path.join(run,"two-hundred-export"));
  const twoHundred=await snapshot();await assertLimit(()=>page.evaluate(()=>importFiles([new File(["x"],"one-more.jpg",{type:"image/jpeg"})])),twoHundred);
  report.checks.push("200 actual tiny JPEG imports succeed; appending one is rejected before allocation/upload and preserves all 200 entries and selection");

  async function audit(lang,theme,width,height){
   const result=await page.locator("#intake-guidance").evaluate(panel=>{
    const issues=[],visible=node=>!!node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden";
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push("page horizontal overflow");
    if(panel.scrollWidth>panel.clientWidth+1)issues.push("guidance horizontal overflow");
    const pr=panel.getBoundingClientRect();if(pr.left<-.5||pr.right>innerWidth+.5)issues.push("guidance outside window");
    const tree=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT);let node,minFont=Infinity;
    while(node=tree.nextNode())if(node.textContent.trim()&&visible(node.parentElement)){const size=parseFloat(getComputedStyle(node.parentElement).fontSize);minFont=Math.min(minFont,size);if(size<12)issues.push("text below 12px");}
    for(const button of panel.querySelectorAll("button"))if(visible(button)){const b=button.getBoundingClientRect();if(b.width<43.9||b.height<43.9)issues.push("small target "+button.id);if(button.scrollWidth>button.clientWidth+1)issues.push("button text overflow "+button.id);if(b.left<pr.left-.5||b.right>pr.right+.5)issues.push("button outside panel "+button.id);}
    return {issues,minFont};
   });
   assert.deepEqual(result.issues,[],JSON.stringify({lang,theme,width,height,...result}));
   if(lang==="en")assert.doesNotMatch(await page.locator("#intake-guidance").textContent(),/[\u3400-\u9fff]/,"untranslated import guidance");
   for(const id of ["guidance-scan","guidance-dismiss"]){await page.locator("#"+id).scrollIntoViewIfNeeded();assert.equal(await page.locator("#"+id).evaluate(button=>{const b=button.getBoundingClientRect();return button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true,"reachable "+id);}
   report.layouts.push({lang,theme,width,height,...result});
  }
  async function auditWorkspace(kind){
   const viewport=page.viewportSize();if(viewport.width<1001||viewport.height<640)return;
   const dimensions=await page.evaluate(()=>({workbenchHeight:document.querySelector(".setup-workbench").getBoundingClientRect().height,tableHeight:document.querySelector("#scan-section .table-wrap").clientHeight}));
   assert.ok(dimensions.workbenchHeight>=359,kind+" workbench collapsed: "+JSON.stringify(dimensions));assert.ok(dimensions.tableHeight>=80,kind+" table too short: "+JSON.stringify(dimensions));
   for(const control of [page.locator("#scan-body input[type=checkbox]").first(),page.locator("#start-button")]){
    await control.scrollIntoViewIfNeeded();assert.equal(await control.evaluate(node=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true,kind+" pending checkbox/start unreachable");
   }
   report.workspaces.push({kind,language:await page.locator("html").getAttribute("lang"),...viewport,...dimensions});
  }
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const theme of ["dark","light"]){
    if(await page.locator("html").getAttribute("data-theme")!==theme)await page.click("#theme-toggle");
    for(const [width,height]of [[320,568],[390,640],[768,900],[1440,640],[844,390]]){
     await page.setViewportSize({width,height});await delay(150);await page.locator("#intake-guidance").scrollIntoViewIfNeeded();await audit(lang,theme,width,height);await auditHelper(".import-limit-row","back-directory","pending");await auditWorkspace("guidance");
     if((width===390||width===1440)&&theme==="dark"){await page.locator("#intake-guidance").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(run,lang+"-"+width+".png")});}
    }
   }
  }
  await assertPreserved(twoHundred);report.checks.push("20 Chinese/English light/dark viewport checks: 320/390/768/1440 plus short window, >=12px text, >=44px actions, no clipping, reachable actions; viewport simulations only");
  await page.setViewportSize({width:1440,height:640});await page.click("#guidance-dismiss");assert.equal(await page.locator("#intake-guidance").isVisible(),false);await assertPreserved(twoHundred);await auditWorkspace("helper only");
  report.checks.push("dismissing guidance leaves pending settings unchanged; short desktop workbench keeps a >=80px table and reachable checkbox/start with either guidance or only the import helper");

  // Quota is a storage-maintenance path, not an invitation to retry the same
  // import. Inject the exact backend detail instead of creating 8 GiB of data.
  await page.click("#new-task");await page.locator("#import-file-input").setInputFiles({name:"quota-base.jpg",mimeType:"image/jpeg",buffer:jpeg});
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===1&&!importState.busy);
  const quotaPending=await snapshot(),beforeUploads=requests.upload;
  await page.route(base+"/api/imports",route=>route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({detail:"当前平台导入区达到 8 GiB 限制，请打开导入空间管理，确认后清理副本"})}));
  await page.locator("#import-file-input").setInputFiles({name:"quota.jpg",mimeType:"image/jpeg",buffer:jpeg});await page.waitForFunction(()=>!importState.busy);
  await page.locator("#guidance-storage").waitFor();assert.equal(requests.upload,beforeUploads);assert.match(await page.locator("#intake-guidance").textContent(),/8 GiB/);
  await assertPreserved(quotaPending);
  await page.click("#guidance-storage");await page.locator("#storage-dialog[open]").waitFor();await page.waitForFunction(()=>!$("refresh-storage").disabled);
  assert.equal(await page.locator("#release-import-dialog").isVisible(),false);await page.click("#close-storage");await page.unroute(base+"/api/imports");
  assert.equal(requests.task,0);assert.equal((await json("/api/tasks")).length,0);
  await assertPreserved(quotaPending);report.checks.push("8 GiB backend quota error preserves pending import and opens storage review, performs no upload or automatic cleanup and creates no task");

  // Simulate the standalone capability against this isolated WSL service. The
  // real Windows native picker is tested separately; this verifies its UI route
  // avoids webkitdirectory, scans once, and keeps the list on cancellation.
  const localPage=await browser.newPage({viewport:{width:390,height:640}});
  let nativeCalls=0,nativePath=source,fileChoosers=0,delayNative=false,releaseNative,cancelCalls=0;
  const localRequests={scan:0,allocate:0,upload:0};
  localPage.on("pageerror",error=>report.errors.push(error.message));
  localPage.on("filechooser",()=>fileChoosers++);
  localPage.on("request",request=>{
   const pathname=new URL(request.url()).pathname;
   if(request.method()==="POST"&&pathname==="/api/scans")localRequests.scan++;
   if(request.method()==="POST"&&pathname==="/api/imports")localRequests.allocate++;
   if(request.method()==="PUT"&&/^\/api\/imports\/[^/]+\/files\//.test(pathname))localRequests.upload++;
  });
  await localPage.route(base+"/api/environment",async route=>{
   const response=await route.fetch(),environment=await response.json();
   await route.fulfill({response,json:{...environment,window_directory_drop:true,native_picker:true,runtime:"Windows 本地"}});
  });
  await localPage.route(base+"/api/directories/native",async route=>{
   nativeCalls++;if(delayNative)await new Promise(resolve=>{releaseNative=resolve;});
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({path:nativePath})});
  });
  await localPage.route(base+"/api/directories/native/cancel",async route=>{
   cancelCalls++;const release=releaseNative;releaseNative=null;if(release)release();
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({cancelled:true})});
  });
  await localPage.goto(url);await localPage.locator("#connection[data-connected=true]").waitFor();
  assert.equal(await localPage.locator("#empty-scan-directory").isVisible(),false,"standalone window should not duplicate folder scanning in the empty state");
  assert.equal(await localPage.locator("#choose-import-folder").textContent(),"选择本机目录");
  const entryGeometry=await localPage.evaluate(()=>({principles:document.querySelector(".empty-principles").getBoundingClientRect().bottom,actions:document.querySelector(".empty-entry-actions").getBoundingClientRect().top,overflow:document.documentElement.scrollWidth-innerWidth}));
  assert.ok(entryGeometry.principles<=entryGeometry.actions&&entryGeometry.overflow<=1,"principles must sit above the entry buttons without horizontal overflow");
  await localPage.locator("#empty-section").scrollIntoViewIfNeeded();
  await localPage.screenshot({path:path.join(run,"standalone-entry-zh-390.png")});
  await localPage.click("#language-toggle");
  await localPage.waitForFunction(()=>document.querySelector("#choose-import-folder").textContent==="Choose a local folder");
  assert.equal(await localPage.locator("#choose-import-folder").textContent(),"Choose a local folder");
  assert.equal(await localPage.locator("#empty-scan-directory").isVisible(),false);
  await localPage.screenshot({path:path.join(run,"standalone-entry-en-390.png")});
  await localPage.click("#choose-import-folder");
  await localPage.waitForFunction(()=>state.scan?.root&&state.scan?.source_kind!=="import"&&!importState.busy);
  assert.equal(nativeCalls,1);assert.equal(fileChoosers,0,"native folder choice must not open the browser upload picker");
  assert.deepEqual(localRequests,{scan:1,allocate:0,upload:0});
  await localPage.click("#new-task");nativePath=null;
  const cancelled=localPage.waitForResponse(response=>response.url()===base+"/api/directories/native");
  await localPage.click("#choose-import-folder");await cancelled;
  await localPage.waitForFunction(()=>!importState.busy&&$("intake-guidance").hidden);
  assert.equal(nativeCalls,2);assert.deepEqual(localRequests,{scan:1,allocate:0,upload:0});assert.equal(await localPage.locator("#empty-section").isVisible(),true);
  nativePath=source;delayNative=true;
  await localPage.click("#choose-import-folder");
  await localPage.locator("#guidance-dismiss:visible").waitFor();
  assert.equal(await localPage.locator("#guidance-dismiss").textContent(),"Cancel system picker");
  await localPage.click("#guidance-dismiss");
  await localPage.waitForFunction(()=>!importState.busy&&$("intake-guidance").hidden);
  assert.equal(nativeCalls,3);assert.equal(cancelCalls,1);assert.deepEqual(localRequests,{scan:1,allocate:0,upload:0});
  assert.equal(await localPage.evaluate(()=>document.activeElement.id),"choose-import-folder");
  await localPage.close();
  report.checks.push("standalone capability simulation: principles above actions; local system picker scans once with no browser file chooser or copied import; system and in-app cancellation preserve empty state and focus; Chinese/English 390px screenshots (not a physical Windows picker test)");
  for(const [name,digest]of Object.entries(originalHashes))assert.equal(hash(await fs.readFile(path.join(source,name))),digest);
  assert.deepEqual(report.errors,[]);assert.deepEqual(requests.external,[]);
  report.requests={allocate:requests.allocate,upload:requests.upload,scan:requests.scan,task:requests.task};
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,evidence:run,checks:report.checks,layouts:report.layouts.length,helperLayouts:report.helperLayouts.length,workspaces:report.workspaces.length,requests:report.requests,errors:report.errors},null,2));
 }catch(error){
  if(page&&!page.isClosed())await page.screenshot({path:path.join(run,"failure.png")}).catch(()=>{});
  await fs.writeFile(path.join(run,"failure.json"),JSON.stringify({message:error.message,report},null,2));console.error("Private evidence:",run);throw error;
 }finally{if(browser)await browser.close();await stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
