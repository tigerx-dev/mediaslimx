/* Real Windows WebView2 acceptance for an already running, isolated ZIP build.
   This runner never launches, closes, adopts or kills a window. The owner must
   create a UUID directory under .mediaslimx/window-tests, explicitly pass its
   data directory to the EXE, and set MSX_WINDOW_TEST_STATE to that run's JSON.
   Native titlebar/confirmation interaction must be checked separately. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
const local=value=>process.platform==="win32"?value:(/^[A-Za-z]:[\\/]/.test(value)?"/mnt/"+value[0].toLowerCase()+value.slice(2).replaceAll("\\","/"):value);
const key=value=>value.replaceAll("\\","/").replace(/\/$/,"").toLowerCase();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");

(async()=>{
 assert.ok(process.env.MSX_WINDOW_TEST_STATE,"MSX_WINDOW_TEST_STATE must name a private test run; no default active.json is used");
 const stateFile=local(process.env.MSX_WINDOW_TEST_STATE),s=JSON.parse(await fs.readFile(stateFile,"utf8"));
 const expectedParent=path.resolve(".mediaslimx/window-tests"),root=path.resolve(local(s.root));
 assert.ok(key(root).startsWith(key(expectedParent)+"/")&&key(root)!==key(expectedParent),"only UUID test directories are permitted");
 assert.equal(key(path.resolve(local(s.data))),key(path.join(root,"data")),"test data must be the private run's data child");
 assert.ok(Number.isInteger(s.debug_port)&&s.debug_port>1024,"private CDP port required");
 assert.ok(s.large_directory&&s.exports,"large_directory and exports are required");
 const record=JSON.parse(await fs.readFile(path.join(local(s.data),"window.json"),"utf8")),u=new URL(record.url),base=u.origin;
 assert.equal(u.hostname,"127.0.0.1");assert.ok(![8765,8766].includes(Number(u.port)),"never use the existing browser services");
 const token=new URLSearchParams(u.hash.slice(1)).get("token");assert.ok(token);
 async function api(route){const response=await fetch(base+route,{headers:{"X-MediaSlimX-Token":token}});assert.equal(response.status,200,route+" "+response.status);return response;}
 async function json(route){return(await api(route)).json();}
 const environment=await json("/api/environment");
 assert.equal(environment.pid,record.owner_pid,"only the private window's actual owner may be tested");
 assert.equal(key(environment.data_dir),key(s.data));assert.equal(environment.runtime,"Windows 本地");
 assert.ok(environment.ffmpeg&&environment.ffprobe&&environment.pdf,"bundled image/video/PDF runtime must be available");
 const report={actual_zip:true,native_webview2:true,owner_pid:record.owner_pid,host_pid:record.host_pid,checks:[],errors:[],scope:"WebView2 DOM and local HTTP; physical titlebar X/confirmation is separate"};
 const reportFile=path.join(root,"window-ui-report.json");let page;
 async function save(){await fs.writeFile(reportFile,JSON.stringify(report,null,2));}
 try{
  const browser=await chromium.connectOverCDP("http://127.0.0.1:"+s.debug_port);
  page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith(base+"/"));
  assert.ok(page,"owned WebView2 page must be present");
  page.on("pageerror",error=>report.errors.push(error.message));
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
  await page.locator("#connection[data-connected=true]").waitFor();
  if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.locator("#language-toggle").click();
  assert.equal((await json("/api/tasks")).length,0,"test window must start with no tasks");
  assert.equal(await page.locator("#empty-import-limit").isVisible(),true);
  assert.match(await page.locator("#empty-import-limit").textContent(),/200/);
  assert.match(await page.locator("#empty-import-limit").textContent(),/2 GiB/);
  report.checks.push("real ZIP/WebView2 and private owner verified; import caps are visible in the empty state");await save();

  const sourceFiles=s.fixture_files||[];
  assert.ok(sourceFiles.length,"fixture_files must contain an actual synthetic JPEG path");
  const jpegFile=sourceFiles.find(name=>/\.jpe?g$/i.test(name));assert.ok(jpegFile,"synthetic JPEG required");
  const jpeg=await fs.readFile(local(jpegFile)),original=sha(jpeg);
  await page.locator("#import-file-input").setInputFiles({name:"文件选择.jpg",mimeType:"image/jpeg",buffer:jpeg});
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===1&&!importState.busy,{},{timeout:30000});
  await page.evaluate(bytes=>{
   const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],"实际拖入.jpg",{type:"image/jpeg"}));
   window.dispatchEvent(new DragEvent("dragenter",{dataTransfer:transfer,bubbles:true,cancelable:true}));
   window.dispatchEvent(new DragEvent("drop",{dataTransfer:transfer,bubbles:true,cancelable:true}));
  },[...jpeg]);
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===2&&!importState.busy,{},{timeout:30000});
  assert.equal(await page.locator("#mode").inputValue(),"export");
  report.checks.push("actual JPEG file input and browser DataTransfer drop both import into export-only pending state");await save();

  // Check a genuine 201-File payload before replacing the pending import. No
  // fake file sizes, allocator reservations or binary upload are involved.
  const snapshot=()=>page.evaluate(()=>({scan:state.scan,selected:[...state.selected],output:$("output-path").value,mode:$("mode").value,batch:importState.batch}));
  await page.locator("#scan-body input[type=checkbox]").last().uncheck();
  await page.locator("#output-path").fill(s.exports+"-pending-kept");
  const firstPending=await snapshot(),before201={...requests};
  await page.locator("#import-file-input").setInputFiles(Array.from({length:201},(_,i)=>({name:"too-many-"+i+".jpg",mimeType:"image/jpeg",buffer:jpeg})));
  await page.locator("#intake-guidance[data-state=limit]").waitFor();await page.waitForFunction(()=>!importState.busy);
  assert.equal(requests.allocate,before201.allocate);assert.equal(requests.upload,before201.upload);
  assert.deepEqual(await snapshot(),firstPending);
  report.checks.push("201 real File objects exceed the cap before allocate/upload and preserve the existing two entries, selection and output");await save();

  // Exactly 200 actual small JPEGs must still work. A later append is counted
  // cumulatively, not treated as an independent 200-file allowance.
  await page.locator("#new-task").click();
  await page.locator("#import-file-input").setInputFiles(Array.from({length:200},(_,i)=>({name:"pending-"+String(i).padStart(3,"0")+".jpg",mimeType:"image/jpeg",buffer:jpeg})));
  await page.waitForFunction(()=>state.scan?.source_kind==="import"&&state.scan.entries.length===200&&!importState.busy,{},{timeout:120000});
  await page.locator("#scan-body input[type=checkbox]").first().uncheck();
  await page.locator("#output-path").fill(s.exports+"-two-hundred-kept");
  const pending=await snapshot(),beforeAppend={...requests};
  await page.locator("#import-file-input").setInputFiles({name:"one-more.jpg",mimeType:"image/jpeg",buffer:jpeg});
  await page.locator("#intake-guidance[data-state=limit]").waitFor();await page.waitForFunction(()=>!importState.busy);
  assert.equal(requests.allocate,beforeAppend.allocate);assert.equal(requests.upload,beforeAppend.upload);assert.deepEqual(await snapshot(),pending);
  await page.locator("#intake-guidance").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,"window-limit-200.png")});
  report.checks.push("200 real JPEG uploads succeed; the 201st appended File is rejected before network allocation with all pending settings kept");await save();

  async function openLargeFolder(){
   await page.locator("#guidance-scan").click();await page.locator("#folder-dialog[open]").waitFor();
   await page.waitForFunction(()=>document.querySelectorAll(".folder-root").length>0);
   let found=false;
   for(const rootButton of await page.locator(".folder-root").all()){
    if(key(await rootButton.getAttribute("title"))===key(s.large_directory)){await rootButton.click();found=true;break;}
   }
   assert.ok(found,"large_directory must be an explicit --allow-root for actual folder-button navigation");
   await page.locator("#choose-folder:not([disabled])").waitFor();
   await page.waitForFunction(expected=>document.querySelector("#folder-current").textContent.replaceAll("\\","/").toLowerCase()===expected,key(s.large_directory));
   assert.match(await page.locator("#choose-folder").textContent(),/扫描此目录/);
  }
  for(const closing of ["escape","button"]){
   const before={...requests};await openLargeFolder();
   if(closing==="escape")await page.keyboard.press("Escape");else await page.locator("#close-folder").click();
   await page.locator("#folder-dialog").waitFor({state:"hidden"});
   assert.deepEqual(await snapshot(),pending);assert.equal(requests.scan,before.scan);assert.equal(requests.discard,before.discard);
  }
  report.checks.push("directory chooser Escape and close button both retain all 200 entries/settings and send no scan or discard");await save();

  const scanRoute=base+"/api/scans";
  await page.route(scanRoute,route=>route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({detail:"私有测试：目录暂时不可读"})}));
  try{
   await openLargeFolder();await page.locator("#choose-folder").click();
   await page.locator("#intake-guidance[data-state=error]").waitFor();
   assert.match(await page.locator("#guidance-detail").textContent(),/私有测试：目录暂时不可读/);
   assert.deepEqual(await snapshot(),pending);
  }finally{await page.unroute(scanRoute);}
  report.checks.push("a scan validation failure keeps imported entries, exact selection and custom output; no optimization starts");await save();

  await openLargeFolder();await page.locator("#choose-folder").click();
  await page.waitForFunction(()=>state.scan&&state.scan.source_kind!=="import"&&!importState.busy,{},{timeout:30000});
  const scan=await page.evaluate(()=>state.scan);
  assert.equal(scan.entries.length,201,"directory scan is not limited to the browser import's 200-file cap");
  assert.ok(scan.entries.every(entry=>entry.status==="ready"));
  assert.equal(await page.locator("#mode").inputValue(),"export");assert.equal(requests.task,0);
  assert.equal(await page.evaluate(()=>state.selected.size),201);
  report.directory_scan={files:scan.entries.length,skipped_directories:scan.skipped_dirs||0,warnings:scan.warnings||[],mode:"export",task_started_automatically:false};
  report.checks.push("explicit chooser action scans all 201 actual files in place, defaults to export and never auto-starts optimization");await save();

  // Optimize the scanned directory through the real Start button and export a
  // report through WebView2's actual download path. Originals stay in place.
  await page.locator("#output-path").fill(s.exports);
  const creating=page.waitForResponse(response=>response.url()===base+"/api/tasks"&&response.request().method()==="POST");
  await page.locator("#start-button").click();const created=await(await creating).json();
  let task;
  for(let i=0;i<480;i++){task=await json("/api/tasks/"+created.id);if(!["running","cancelling"].includes(task.status))break;await delay(250);}
  assert.equal(task.status,"completed");assert.equal(task.entries.length,201);
  assert.ok(task.entries.every(entry=>["success","no_gain"].includes(entry.status)));
  await page.waitForFunction(()=>document.querySelectorAll("#result-body tr").length===201,{},{timeout:30000});
  const downloadDir=path.join(root,"downloads");await fs.mkdir(downloadDir,{recursive:true});
  const nativeDownload=process.platform==="win32"?downloadDir:s.root+"\\downloads";
  const cdp=await browser.newBrowserCDPSession();
  await cdp.send("Browser.setDownloadBehavior",{behavior:"allow",downloadPath:nativeDownload,eventsEnabled:true});
  const csvFile=path.join(downloadDir,"mediaslimx-"+task.id+".csv");await page.locator("#export-report").click();
  for(let i=0;i<100;i++){try{if((await fs.stat(csvFile)).size>0)break;}catch{}await delay(100);}
  const csv=await fs.readFile(csvFile,"utf8");for(const entry of task.entries)assert.ok(csv.includes(entry.relative));
  assert.equal(sha(await fs.readFile(local(jpegFile))),original);
  const counts={};for(const entry of task.entries)counts[entry.status]=(counts[entry.status]||0)+1;
  report.completed_task_id=task.id;report.task={status:task.status,count:task.entries.length,entry_counts:counts};
  report.checks.push("all 201 scanned JPEGs complete through the real Start button, show per-file results and export a real CSV; fixture original SHA-256 is unchanged");
  await save();

  // Reload the same WebView2 document to return to visible intake controls.
  // Unlike reset/new-task this performs no unused-import discard. The process,
  // service, profiles and persisted results remain the same private instance.
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();
  assert.equal((await json("/api/tasks/"+report.completed_task_id)).status,"completed");
  assert.equal(key(s.media).startsWith(key(s.root)+"/"),true,"five-format fixtures must be inside the private run");
  const mediaNames=(await fs.readdir(local(s.media))).filter(name=>/\.(jpg|png|webp|mp4|pdf)$/i.test(name));
  assert.equal(mediaNames.length,5,"state.media must contain exactly five synthetic format fixtures");
  assert.deepEqual(mediaNames.map(name=>name.split(".").pop().toLowerCase()).sort(),["jpg","mp4","pdf","png","webp"]);
  const baseline={};for(const name of mediaNames)baseline[name]=sha(await fs.readFile(path.join(local(s.media),name)));
  await page.locator("#media-path").fill(s.media);await page.locator("#scan-button").click();
  await page.waitForFunction(()=>state.scan?.entries.length===5&&!$("scan-button").disabled,{},{timeout:30000});
  const fiveScan=await page.evaluate(()=>state.scan);
  assert.ok(fiveScan.entries.every(entry=>entry.status==="ready"));
  assert.equal(await page.locator("#mode").inputValue(),"export");
  await page.locator("#output-path").fill(s.exports+"-five-formats");
  const fiveCreating=page.waitForResponse(response=>response.url()===base+"/api/tasks"&&response.request().method()==="POST");
  await page.locator("#start-button").click();const fiveCreated=await(await fiveCreating).json();
  let fiveTask;
  for(let i=0;i<480;i++){fiveTask=await json("/api/tasks/"+fiveCreated.id);if(!["running","cancelling"].includes(fiveTask.status))break;await delay(250);}
  assert.equal(fiveTask.status,"completed");assert.equal(fiveTask.entries.length,5);
  assert.ok(fiveTask.entries.every(entry=>["success","no_gain","duplicate"].includes(entry.status)));
  await page.waitForFunction(()=>document.querySelectorAll("#result-body tr").length===5&&document.querySelector("#workspace-title-status").textContent.includes("已完成"),{},{timeout:30000});
  report.five_format_task_id=fiveTask.id;
  report.five_format_entries=fiveTask.entries.map(entry=>({relative:entry.relative,kind:entry.kind,status:entry.status,original_bytes:entry.size,result_bytes:entry.result_size}));
  const fiveCsvFile=path.join(downloadDir,"mediaslimx-"+fiveTask.id+".csv");await page.locator("#export-report").click();
  for(let i=0;i<100;i++){try{if((await fs.stat(fiveCsvFile)).size>0)break;}catch{}await delay(100);}
  const fiveCsv=await fs.readFile(fiveCsvFile,"utf8");for(const entry of fiveTask.entries)assert.ok(fiveCsv.includes(entry.relative));
  for(const [name,digest]of Object.entries(baseline))assert.equal(sha(await fs.readFile(path.join(local(s.media),name))),digest);
  report.checks.push("reloading keeps the 201-file task; visible directory controls scan and export actual JPG/PNG/WebP/MP4/PDF, CSV contains all five and all original hashes stay unchanged");await save();

  const image=fiveTask.entries.find(entry=>/\.jpg$/i.test(entry.relative));
  await page.locator('[data-detail-id="'+image.id+'"]').click();
  const imageOpener=page.locator("#preview-grid .image-preview-trigger").first();await imageOpener.click();
  await page.waitForFunction(()=>document.querySelector("#image-viewer-dialog").dataset.state==="ready");
  await page.locator("#image-viewer-original").click();assert.equal(await page.locator("#image-viewer-scale").textContent(),"100%");
  await page.keyboard.press("Escape");assert.equal(await page.locator("#detail-dialog").evaluate(dialog=>dialog.open),true);
  assert.equal(await imageOpener.evaluate(node=>node===document.activeElement),true);
  await page.locator("#close-detail").click();
  const video=fiveTask.entries.find(entry=>entry.kind==="video");assert.ok(video);
  await page.locator('[data-detail-id="'+video.id+'"]').click();
  await page.locator("#preview-grid video").first().evaluate(async player=>{await player.play();player.pause();});
  await page.locator("#close-detail").click();
  report.preview={image_zoom_100_percent:true,nested_escape_focus:true,video_playback:true};
  report.checks.push("actual exported-image zoom reaches 100%, Escape returns focus inside details, and the native WebView2 video preview plays");await save();

  report.themes=[];
  for(const language of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==language)await page.locator("#language-toggle").click();
   for(const theme of ["dark","light"]){
    if(await page.locator("html").getAttribute("data-theme")!==theme)await page.locator("#theme-toggle").click();
    await delay(180);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,language+" "+theme+" has horizontal overflow");
    report.themes.push({language,theme,horizontal_overflow:false});
    if(theme==="dark")await page.screenshot({path:path.join(root,"window-results-"+language+".png")});
   }
  }
  report.checks.push("both Chinese/English and dark/light themes remain free of horizontal overflow in the actual standalone window");await save();

  // The native picker is launched and cancelled through the app's public DOM
  // controls, without Windows UIA, synthetic OS input or a window-close hack.
  await page.reload();await page.locator("#connection[data-connected=true]").waitFor();
  const pathsBefore=await page.locator("#media-path").inputValue(),scansBefore=requests.scan;
  await page.locator("#browse-media").click();await page.locator("#folder-dialog[open]").waitFor();
  await page.locator("#native-folder").waitFor({state:"visible"});
  const nativeReply=page.waitForResponse(response=>response.url()===base+"/api/directories/native"&&response.request().method()==="POST");
  await page.locator("#native-folder").click();
  await page.locator("#cancel-native-folder").waitFor({state:"visible"});await delay(1500);
  const cancelReply=page.waitForResponse(response=>response.url()===base+"/api/directories/native/cancel"&&response.request().method()==="POST");
  await page.locator("#cancel-native-folder").click();
  const cancelled=await(await cancelReply).json(),picked=await(await nativeReply).json();
  assert.equal(cancelled.cancelled,true);assert.equal(picked.path,null);
  await page.waitForFunction(()=>folderState.nativeRequest===null);await page.locator("#close-folder").click();
  assert.equal(await page.locator("#media-path").inputValue(),pathsBefore);assert.equal(requests.scan,scansBefore);
  assert.equal((await json("/api/tasks/"+report.completed_task_id)).status,"completed");
  assert.equal((await json("/api/tasks/"+report.five_format_task_id)).status,"completed");
  report.native_picker={started:true,web_cancel_acknowledged:true,result_path:null,no_scan_or_path_change:true};
  report.checks.push("actual native folder-picker worker launches and cancels through app controls, changes no path and starts no scan; both completed tasks remain persisted");
  assert.deepEqual(report.errors,[]);assert.deepEqual(requests.external,[]);
  report.requests={allocate:requests.allocate,upload:requests.upload,scan:requests.scan,task:requests.task,discard:requests.discard};
  report.success=true;await save();
  console.log(JSON.stringify({success:true,report:reportFile,checks:report.checks.length,task:report.task,requests:report.requests}));
  // Do not call browser.close(): with CDP that would close the real test app.
  process.exit(0);
 }catch(error){
  report.success=false;report.error=error.message;
  if(page&&!page.isClosed())await page.screenshot({path:path.join(root,"window-ui-failure.png")}).catch(()=>{});
  await save();console.error(JSON.stringify({success:false,report:reportFile,error:error.message}));throw error;
 }
})().catch(error=>{console.error(error.stack);process.exit(1);});
