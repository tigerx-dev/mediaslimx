/* Native directory-drop acceptance in an already running private WebView2.
   CDP passes real synthetic fixture paths into the browser drag data store;
   AdditionalObjects must supply the native path. No GUI is launched/closed.
   MSX_WINDOW_TEST_STATE has the same private-state contract as window-browser. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
const local=value=>process.platform==="win32"?value:(/^[A-Za-z]:[\\/]/.test(value)?"/mnt/"+value[0].toLowerCase()+value.slice(2).replaceAll("\\","/"):value);
const key=value=>value.replaceAll("\\","/").replace(/\/$/,"").toLowerCase();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 assert.ok(process.env.MSX_WINDOW_TEST_STATE,"explicit private test-state path required");
 const s=JSON.parse(await fs.readFile(local(process.env.MSX_WINDOW_TEST_STATE),"utf8")),root=path.resolve(local(s.root));
 assert.ok(key(root).startsWith(key(path.resolve(".mediaslimx/window-tests"))+"/"));
 assert.equal(key(local(s.data)),key(path.join(root,"data")));
 assert.ok(s.large_directory&&s.media&&s.debug_port);
 const record=JSON.parse(await fs.readFile(path.join(local(s.data),"window.json"),"utf8")),u=new URL(record.url),base=u.origin;
 assert.equal(u.hostname,"127.0.0.1");assert.ok(![8765,8766].includes(Number(u.port)));
 const token=new URLSearchParams(u.hash.slice(1)).get("token");
 const json=async route=>{const response=await fetch(base+route,{headers:{"X-MediaSlimX-Token":token}});assert.equal(response.status,200);return response.json();};
 const environment=await json("/api/environment");assert.equal(environment.pid,record.owner_pid);assert.equal(key(environment.data_dir),key(s.data));
 assert.equal(environment.window_directory_drop,true,"test build must expose the real native-directory capability");
 assert.ok((await json("/api/tasks")).every(task=>!["running","cancelling","restoring"].includes(task.status)),"only an idle private test window may be used");
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+s.debug_port),page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith(base+"/"));assert.ok(page);
 const report={owner_pid:record.owner_pid,host_pid:record.host_pid,checks:[],errors:[],actual_webview2:true,drag_source:"CDP Input.dispatchDragEvent with actual private fixture paths; no OS mouse simulation"};
 const reportFile=path.join(root,"window-native-directory-drop.json");
 const save=()=>fs.writeFile(reportFile,JSON.stringify(report,null,2));
 const requests={allocate:0,upload:0,scan:0,task:0,discard:0};
 page.on("pageerror",error=>report.errors.push(error.message));page.on("request",request=>{
  const route=new URL(request.url()).pathname;
  if(request.method()==="POST"&&route==="/api/imports")requests.allocate++;
  if(request.method()==="PUT"&&/^\/api\/imports\/[^/]+\/files\//.test(route))requests.upload++;
  if(request.method()==="POST"&&route==="/api/scans")requests.scan++;
  if(request.method()==="POST"&&route==="/api/tasks")requests.task++;
  if(request.method()==="POST"&&/^\/api\/imports\/[^/]+\/discard$/.test(route))requests.discard++;
 });
 const cdp=await page.context().newCDPSession(page);
 async function drop(files){for(const type of ["dragEnter","dragOver","drop"])await cdp.send("Input.dispatchDragEvent",{type,x:400,y:220,data:{items:[],files,dragOperationsMask:1}});}
 const snapshot=()=>page.evaluate(()=>({scan:state.scan,selected:[...state.selected],mode:$("mode").value,output:$("output-path").value,batch:importState.batch}));
 try{
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();
  if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.locator("#language-toggle").click();
  assert.match(await page.locator("#empty-import-limit").textContent(),/单个文件夹直接扫描/);
  await page.evaluate(()=>{
   window.__directoryReplies=[];window.__directoryStates=[];
   chrome.webview.addEventListener("message",event=>window.__directoryReplies.push(event.data));
   window.addEventListener("drop",event=>{if(event.dataTransfer.files.length===1)window.__lastRealDrop=event.dataTransfer.files[0];},true);
   new MutationObserver(()=>{const panel=$("intake-guidance");if(!panel.hidden)window.__directoryStates.push(panel.dataset.state);}).observe($("intake-guidance"),{attributes:true,attributeFilter:["hidden","data-state"]});
  });
  const jpg=(s.fixture_files||[]).find(name=>/\.jpe?g$/i.test(name));assert.ok(jpg);const jpeg=await fs.readFile(local(jpg));
  await page.locator("#import-file-input").setInputFiles({name:"existing-import.jpg",mimeType:"image/jpeg",buffer:jpeg});
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===1&&!importState.busy);
  const scansBeforeFile=requests.scan;await drop([jpg]);
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===2&&!importState.busy);
  assert.equal(requests.scan,scansBeforeFile);
  await page.locator("#scan-body input[type=checkbox]").first().uncheck();await page.locator("#output-path").fill(s.exports+"-native-preserve");
  const pending=await snapshot(),beforeNative={...requests};
  report.checks.push("native capability is discoverable; ordinary on-disk file drops still import bytes and never become directory scans");await save();

  let releaseScan,reachedScan;const gate=new Promise(resolve=>releaseScan=resolve),reached=new Promise(resolve=>reachedScan=resolve);
  const scanRoute=base+"/api/scans";
  await page.route(scanRoute,async route=>{reachedScan();await gate;await route.continue();});
  try{
   await drop([s.large_directory]);await Promise.race([reached,delay(15000).then(()=>{throw Error("native directory did not reach a scan request");})]);
   assert.deepEqual(await snapshot(),pending,"pending intake must stay until the real scan completes");
   assert.equal(await page.locator("#new-task").isDisabled(),true);assert.equal(await page.locator("#start-button").isDisabled(),true);
   const scanCount=requests.scan;await drop([s.media]);await delay(150);assert.equal(requests.scan,scanCount,"a second drop must not queue another scan while busy");
   releaseScan();await page.waitForFunction(expected=>state.scan?.source_kind!=="import"&&state.scan?.root.replaceAll("\\","/").toLowerCase()===expected&&!importState.busy,key(s.large_directory),{timeout:30000});
  }finally{releaseScan();await page.unroute(scanRoute);}
  assert.equal(await page.evaluate(()=>state.scan.entries.length),201);
  assert.equal(await page.locator("#mode").inputValue(),"export");
  assert.equal(requests.allocate,beforeNative.allocate);assert.equal(requests.upload,beforeNative.upload);assert.equal(requests.discard,beforeNative.discard);assert.equal(requests.task,0);
  assert.equal(await page.locator("#intake-guidance").isVisible(),false);assert.equal(await page.locator("#import-notice").isVisible(),true);
  assert.equal(await page.locator("#message").isVisible(),false,"a successful scan must clear the transient duplicate-drop warning");
  assert.match(await page.locator("#import-notice").textContent(),/已按目录扫描/);
  assert.notEqual(await page.evaluate(()=>document.activeElement.id),"guidance-title");
  assert.ok((await json("/api/imports/unused")).some(batch=>batch.id===pending.batch),"old imported copies must remain for explicit cleanup");
  report.transitions=await page.evaluate(()=>window.__directoryStates);assert.ok(report.transitions.includes("reading-directory"));assert.ok(report.transitions.includes("scanning"));
  report.checks.push("a real 201-file directory drop scans its exact native path without allocation/upload, preserves pending data until success, locks duplicate work and defaults to export without starting a task or deleting copies");await save();

  // A valid native reply with no matching pending request is ignored. This is
  // sent by the real host using the last actual directory File, not by a DOM
  // MessageEvent impersonating the host.
  const stable=await snapshot(),unknown=crypto.randomBytes(16).toString("hex"),scanBeforeUnknown=requests.scan;
  await page.evaluate(id=>chrome.webview.postMessageWithAdditionalObjects({op:"dropped_directory",request_id:id},[window.__lastRealDrop]),unknown);
  await page.waitForFunction(id=>window.__directoryReplies.some(reply=>reply.request_id===id),unknown,{timeout:15000});
  assert.deepEqual(await snapshot(),stable);assert.equal(requests.scan,scanBeforeUnknown);
  report.checks.push("a genuine host reply with an unmatched request ID cannot change the intake or trigger scanning");await save();

  for(const language of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==language)await page.locator("#language-toggle").click();
   await delay(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.ok(await page.locator("#import-notice").evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=12));
   if(language==="en")assert.doesNotMatch(await page.locator("#import-notice").textContent(),/[\u3400-\u9fff]/);
   await page.screenshot({path:path.join(root,"native-directory-"+language+".png")});
  }
  await page.locator("#language-toggle").click();
  const beforeError=await snapshot(),scansBeforeError=requests.scan;
  await drop([s.large_directory+"\\.hidden"]);await page.locator("#intake-guidance[data-state=directory-error]").waitFor();
  await page.waitForFunction(()=>!importState.busy);assert.deepEqual(await snapshot(),beforeError);assert.equal(requests.scan,scansBeforeError);
  report.checks.push("the actual native path of a hidden folder is rejected with a recoverable reason and no intake change or scan");await save();

  await page.route(scanRoute,route=>route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({detail:"私有测试：目录扫描未能完成"})}));
  try{await drop([s.large_directory]);await page.locator("#intake-guidance[data-state=error]").waitFor();assert.deepEqual(await snapshot(),beforeError);}
  finally{await page.unroute(scanRoute);}
  report.checks.push("a real native drop followed by a scan error preserves directory selection and output settings");await save();

  const beforeMultiple={...requests};await drop([s.media,s.large_directory]);
  await page.locator("#intake-guidance[data-state=limit]").waitFor();await page.waitForFunction(()=>!importState.busy);
  assert.deepEqual(await snapshot(),beforeError);assert.equal(requests.scan,beforeMultiple.scan);assert.equal(requests.allocate,beforeMultiple.allocate);assert.equal(requests.upload,beforeMultiple.upload);
  report.checks.push("multiple dropped folders retain the browser-import policy and 200-file cap; no native scan or partial transfer occurs");await save();

  // AdditionalObjects deliberately rejects synthetic File objects. That real
  // runtime throw must safely fall back to the existing file importer.
  const beforeFallback={...requests};
  await page.evaluate(bytes=>{const file=new File([new Uint8Array(bytes)],"synthetic-fallback.jpg",{type:"image/jpeg"});return tryNativeDirectoryDrop(file,()=>void importFiles([file]));},[...jpeg]);
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===1&&!importState.busy);
  assert.equal(requests.scan,beforeFallback.scan);assert.equal(await page.locator("#mode").inputValue(),"export");
  report.checks.push("the real runtime rejects a synthetic AdditionalObjects File; synchronous failure releases locks and falls back to export-only import");await save();

  // Hold only the outbound bridge call to exercise its seven-second timeout.
  // Restore the real API immediately; no permanent shim or native bridge is
  // installed, and the delayed fallback contains only this tiny synthetic JPEG.
  const beforeTimeout={...requests},started=Date.now();
  await page.evaluate(bytes=>{
   const bridge=chrome.webview,original=bridge.postMessageWithAdditionalObjects;
   const noReply=()=>{};bridge.postMessageWithAdditionalObjects=noReply;
   try{if(bridge.postMessageWithAdditionalObjects!==noReply)throw Error("test runtime cannot temporarily hold the bridge call");const file=new File([new Uint8Array(bytes)],"timeout-fallback.jpg",{type:"image/jpeg"});return tryNativeDirectoryDrop(file,()=>void importFiles([file]));}
   finally{bridge.postMessageWithAdditionalObjects=original;}
  },[...jpeg]);
  assert.equal(await page.locator("#new-task").isDisabled(),true);
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===2&&!importState.busy,{},{timeout:20000});
  assert.ok(Date.now()-started>=6500);assert.equal(requests.scan,beforeTimeout.scan);assert.equal(requests.task,0);
  report.checks.push("a deliberately held bridge response times out, releases the pending lock and imports only the tiny selected payload through the old safe path");
  await save();

  // This fixture starts outside every allowed media root. The actual dropped
  // File must grant its exact folder; a submitted path alone must still fail.
  assert.ok(s.ungranted_directory,"an initially ungranted private folder is required");
  assert.ok(key(s.ungranted_directory).startsWith(key(s.root)+"/"));
  const scopeBefore=await json("/api/environment"),ungrantedKey=key(s.ungranted_directory);
  assert.ok(!scopeBefore.roots.some(value=>ungrantedKey===key(value)||ungrantedKey.startsWith(key(value)+"/")),"new-scope fixture must not already be inside an allowed root");
  const denied=await fetch(base+"/api/scans",{method:"POST",headers:{"X-MediaSlimX-Token":token,"Content-Type":"application/json"},body:JSON.stringify({path:s.ungranted_directory})});
  assert.equal(denied.status,400,"a path submitted over HTTP must not authorize the folder");
  const scopeFile=path.join(local(s.ungranted_directory),"new-scope.jpg");
  const scopeHash=crypto.createHash("sha256").update(await fs.readFile(scopeFile)).digest("hex"),beforeGrant={...requests};
  await drop([s.ungranted_directory]);
  await page.waitForFunction(expected=>state.scan?.source_kind!=="import"&&state.scan?.root.replaceAll("\\","/").toLowerCase()===expected&&!importState.busy,ungrantedKey,{timeout:30000});
  assert.equal(await page.evaluate(()=>state.scan.entries.length),1);
  assert.deepEqual(await page.evaluate(()=>state.scan.entries.map(entry=>entry.relative)),["new-scope.jpg"]);
  assert.equal(requests.scan,beforeGrant.scan+1);
  for(const kind of ["allocate","upload","task","discard"])assert.equal(requests[kind],beforeGrant[kind],"new native scope must not perform "+kind);
  assert.equal(await page.locator("#mode").inputValue(),"export");
  const scopeAfter=await json("/api/environment"),oldRoots=new Set(scopeBefore.roots.map(key));
  assert.deepEqual(scopeAfter.roots.map(key).filter(value=>!oldRoots.has(value)),[ungrantedKey]);
  assert.ok(!scopeAfter.roots.some(value=>key(value)===key(s.root)),"the parent run directory must never be authorized");
  const persisted=JSON.parse(await fs.readFile(path.join(local(s.data),"authorized-roots.json"),"utf8"));
  assert.ok(persisted.some(value=>key(value)===ungrantedKey));assert.ok(!persisted.some(value=>key(value)===key(s.root)));
  assert.equal(crypto.createHash("sha256").update(await fs.readFile(scopeFile)).digest("hex"),scopeHash);
  report.new_scope={initial_http_scan_status:denied.status,exact_folder_added:true,parent_root_added:false,persisted:true,files:1,original_unchanged:true};
  report.checks.push("an initially unauthorized folder rejects an HTTP-only scan, then its real native drop grants and persists only that exact folder and scans one file without copying, discarding or starting optimization");
  assert.deepEqual(report.errors,[]);report.requests=requests;report.success=true;await save();
  console.log(JSON.stringify({success:true,report:reportFile,checks:report.checks.length,requests}));
  await cdp.detach();process.exit(0);
 }catch(error){report.success=false;report.error=error.message;await page.screenshot({path:path.join(root,"window-native-directory-failure.png")}).catch(()=>{});await save();console.error(JSON.stringify({success:false,report:reportFile,error:error.message}));throw error;}
})().catch(error=>{console.error(error.stack);process.exit(1);});
