/* Actual WebView2 close-dialog acceptance in an already running private ZIP.
   The Python owner prepares a long synthetic export and records close_task_id
   in MSX_WINDOW_TEST_STATE. This script only uses that window's DOM/CDP/HTTP:
   it never launches or kills processes, changes OS priorities, or calls
   Browser.close. Terminal process/file/SQLite verification belongs to Python.
   This checks the shared host Close path through the app's Quit button; it is
   not evidence of a physical titlebar X or Explorer mouse interaction. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
const local=value=>process.platform==="win32"?value:(/^[A-Za-z]:[\\/]/.test(value)?"/mnt/"+value[0].toLowerCase()+value.slice(2).replaceAll("\\","/"):value);
const key=value=>value.replaceAll("\\","/").replace(/\/$/,"").toLowerCase();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 assert.ok(process.env.MSX_WINDOW_TEST_STATE,"explicit private test-state path required; default running instances are forbidden");
 const s=JSON.parse(await fs.readFile(local(process.env.MSX_WINDOW_TEST_STATE),"utf8")),root=path.resolve(local(s.root));
 const expectedParent=path.resolve(".mediaslimx/window-tests");
 assert.ok(key(root).startsWith(key(expectedParent)+"/")&&key(root)!==key(expectedParent),"only isolated window-test run directories are allowed");
 assert.equal(key(path.resolve(local(s.data))),key(path.join(root,"data")));
 assert.ok(Number.isInteger(s.debug_port)&&s.debug_port>1024&&! [8765,8766].includes(s.debug_port),"private CDP port required");
 assert.match(s.close_task_id||"",/^[a-f0-9]{32}$/i,"Python must explicitly identify its running synthetic close task");
 const record=JSON.parse(await fs.readFile(path.join(local(s.data),"window.json"),"utf8")),u=new URL(record.url),base=u.origin;
 assert.equal(u.hostname,"127.0.0.1");assert.ok(![8765,8766].includes(Number(u.port)),"never test the existing browser services");
 const token=new URLSearchParams(u.hash.slice(1)).get("token");assert.ok(token);
 async function json(route){const response=await fetch(base+route,{headers:{"X-MediaSlimX-Token":token},signal:AbortSignal.timeout(5000)});assert.equal(response.status,200,route);return response.json();}
 const environment=await json("/api/environment");
 assert.equal(environment.pid,record.owner_pid);assert.equal(key(environment.data_dir),key(s.data));assert.equal(environment.runtime,"Windows 本地");
 assert.equal(environment.window_directory_drop,true,"the actual native host capability is required");
 const taskRoute="/api/tasks/"+s.close_task_id;
 assert.equal((await json(taskRoute)).status,"running","a long real synthetic task must already be running");
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+s.debug_port);
 const page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith(base+"/"));assert.ok(page);
 page.setDefaultTimeout(8000);
 const cdp=await page.context().newCDPSession(page),started=Date.now();
 const report={actual_webview2:true,phase_only:true,owner_pid:record.owner_pid,host_pid:record.host_pid,task_id:s.close_task_id,checks:[],layouts:[],errors:[],unexpected_popups:[],started_utc:new Date().toISOString(),scope:"DOM Quit button -> actual native Close/coordinator -> same-page HTML dialog; no OS input or display-process termination",terminal_verification_required:true};
 const reportFile=path.join(root,"window-close-ui-report.json");
 const save=()=>fs.writeFile(reportFile,JSON.stringify(report,null,2));
 page.on("pageerror",error=>report.errors.push(error.message));
 page.on("popup",popup=>report.unexpected_popups.push(popup.url()));
 const dialog=page.locator("#window-close-dialog"),quit=page.locator("#quit-app");
 const finishedIds=[];
 function deadline(){assert.ok(Date.now()-started<115000,"close UI phase exceeded its compact synthetic-task time budget");}
 async function stillRunning(label){
  deadline();const current=await json("/api/environment"),task=await json(taskRoute);
  assert.equal(current.pid,record.owner_pid,label+": owner changed");assert.equal(key(current.data_dir),key(s.data));
  assert.equal(task.status,"running",label+": synthetic task completed too soon to test busy close");
  return task;
 }
 async function desktop(){await page.setViewportSize({width:1440,height:800});}
 async function open(){
  await stillRunning("before request_close");await quit.scrollIntoViewIfNeeded();await quit.click();
  await page.locator("#window-close-dialog[open]").waitFor();
  await page.waitForFunction(()=>document.activeElement?.id==="window-close-stay");
  const request=await page.evaluate(()=>window.__closeUIRequests.at(-1));
  assert.ok(request&&request.type==="mediaslimx-close-request"&&request.busy===true&&/^[a-f0-9]{32}$/i.test(request.request_id),"actual native nonce request must reach the page");
  assert.equal(await page.locator("dialog[open]").count(),1,"busy close opens one HTML dialog");
  return request.request_id;
 }
 async function stay(method,id){
  if(method==="Escape")await page.keyboard.press("Escape");
  else await page.locator(method).click();
  await page.locator("#window-close-dialog[open]").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.activeElement?.id==="quit-app");
  const focus=await page.evaluate(()=>({id:document.activeElement?.id,skip:document.activeElement?.matches(".skip-link")||false}));
  assert.deepEqual(focus,{id:"quit-app",skip:false},"dismissing close must restore its real opener, not reveal the skip link");
  await stillRunning("after "+method);finishedIds.push(id);
 }
 async function language(value){if(await page.locator("html").getAttribute("lang")!==value)await page.locator("#language-toggle").click();}
 async function theme(value){if(await page.locator("html").getAttribute("data-theme")!==value)await page.locator("#theme-toggle").click();}
 async function layout(width,height,lang,skin,reduced=false){
  await page.setViewportSize({width,height});await delay(60);
  const result=await dialog.evaluate(node=>{
   const problems=[],r=node.getBoundingClientRect(),visible=element=>element.getClientRects().length&&getComputedStyle(element).visibility!=="hidden";
   if(document.documentElement.scrollWidth>innerWidth+1)problems.push("document horizontal overflow");
   if(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5)problems.push("dialog outside viewport");
   if(node.scrollWidth>node.clientWidth+1)problems.push("dialog horizontal overflow");
   for(const button of node.querySelectorAll("button")){
    if(!visible(button))continue;
    const b=button.getBoundingClientRect();
    if(b.width<43.9||b.height<43.9)problems.push("target below 44px: "+button.id);
    if(b.left<r.left-.5||b.right>r.right+.5||b.top<-.5||b.bottom>innerHeight+.5)problems.push("button clipped: "+button.id);
    if(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)!==button&&!button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)))problems.push("button obscured: "+button.id);
    const walk=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let text;
    while((text=walk.nextNode())){
     if(!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);
     if([...range.getClientRects()].some(t=>t.left<b.left-1||t.right>b.right+1||t.top<b.top-1||t.bottom>b.bottom+1))problems.push("button text clipped: "+button.id);
    }
   }
   const texts=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;
   while((text=texts.nextNode()))if(text.textContent.trim()&&visible(text.parentElement)&&parseFloat(getComputedStyle(text.parentElement).fontSize)<12)problems.push("text below 12px");
   return {problems,text:node.innerText,reduced_motion:matchMedia("(prefers-reduced-motion: reduce)").matches};
  });
  assert.deepEqual(result.problems,[],lang+" "+skin+" "+width+"x"+height+": "+result.problems.join("; "));
  if(lang==="en")assert.doesNotMatch(result.text,/[\u3400-\u9fff]/,"English close dialog must not contain an appended Chinese translation");
  else {assert.match(result.text,/[\u3400-\u9fff]/);assert.doesNotMatch(result.text,/Keep working|Safe exit|Stay|Cancel remaining|Continue working/i,"Chinese close dialog must not append the English copy");}
  if(reduced)assert.equal(result.reduced_motion,true);
  report.layouts.push({language:lang,theme:skin,width,height,reduced_motion:result.reduced_motion,problems:result.problems});
 }
 try{
  await page.locator("#connection[data-connected=true]").waitFor();await desktop();
  await page.evaluate(()=>{window.__closeUIRequests=[];chrome.webview.addEventListener("message",event=>{if(event.data?.type==="mediaslimx-close-request")window.__closeUIRequests.push(event.data);});});
  await quit.waitFor({state:"visible"});
  await page.evaluate(id=>chrome.webview.postMessage({op:"close_response",request_id:id,decision:"exit"}),crypto.randomBytes(16).toString("hex"));
  await delay(100);await stillRunning("unmatched close_response");assert.equal(await dialog.isVisible(),false);
  report.checks.push("a real bridge exit response with no pending native nonce is ignored; the same owner and real task continue");await save();

  await language("zh-CN");await theme("dark");
  let id=await open();
  await page.evaluate(nonce=>chrome.webview.postMessage({op:"close_response",request_id:nonce,decision:"exit"}),crypto.randomBytes(16).toString("hex"));
  await delay(100);assert.equal(await dialog.isVisible(),true);await stillRunning("bad nonce");
  const count=await page.evaluate(()=>window.__closeUIRequests.length);
  await page.evaluate(()=>document.getElementById("quit-app").click());await delay(100);
  assert.equal(await page.locator("dialog[open]").count(),1);
  const repeated=await page.evaluate(offset=>window.__closeUIRequests.slice(offset),count);
  assert.ok(repeated.length<=1,"one repeated Quit may produce at most one reminder");
  assert.ok(repeated.every(request=>request.request_id===id),"repeat Quit must retain the native pending nonce");
  assert.equal(await page.evaluate(()=>windowClose.pending?.id),id,"repeat Quit must reuse the existing dialog context");
  report.checks.push("busy close defaults focus to Keep working; a bad nonce cannot exit, and repeat Quit does not stack or replace the pending dialog");await save();
  await stay("#window-close-stay",id);
  id=await open();await stay("Escape",id);
  id=await open();await stay("#close-window-close",id);
  report.checks.push("Keep working, Escape and the dialog X each preserve the running task/owner and return focus to Quit without showing the skip link");await save();

  await page.evaluate(old=>chrome.webview.postMessage({op:"close_response",request_id:old,decision:"exit"}),finishedIds[0]);
  await delay(100);await stillRunning("finished nonce replay");
  report.checks.push("replaying an already dismissed nonce cannot exit a later live owner");await save();

  for(const lang of ["zh-CN","en"]){
   for(const skin of ["dark","light"]){
    await desktop();await language(lang);await theme(skin);id=await open();
    for(const [width,height] of [[320,568],[390,640],[768,640],[1001,500],[1440,640]])await layout(width,height,lang,skin);
    await page.screenshot({path:path.join(root,"window-close-"+lang+"-"+skin+".png")});
    await desktop();await stay("#window-close-stay",id);
   }
  }
  report.checks.push("Chinese/English and dark/light close-dialog copy and controls pass twenty short/narrow viewport checks with 12px text, 44px targets and no clipping/overflow");await save();
  await page.emulateMedia({reducedMotion:"reduce"});await language("en");await theme("dark");id=await open();
  await layout(390,640,"en","dark",true);await desktop();await stay("Escape",id);await page.emulateMedia({reducedMotion:null});
  report.checks.push("reduced-motion mode retains readable controls, dismissal and focus restoration");await save();

  await desktop();await language("zh-CN");await theme("dark");id=await open();
  const task=await stillRunning("immediately before Safe exit");
  report.status_before_exit=task.status;report.exit_requested_utc=new Date().toISOString();report.exit_request_id=id;
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected_popups,[]);await save();
  const closed=new Promise(resolve=>{page.once("close",()=>resolve("page closed"));browser.once("disconnected",()=>resolve("CDP disconnected"));});
  await page.locator("#window-close-exit").click({noWaitAfter:true}).catch(error=>{if(!/closed|disconnected|Target page/i.test(error.message))throw error;});
  report.exit_button_clicked=true;await save();
  report.close_observed=await Promise.race([closed,delay(45000).then(()=>{throw Error("the requested safe exit did not close its display connection");})]);
  report.checks.push("Safe exit was clicked while the actual task was still running; the window/CDP connection then closed naturally (Python must verify cancellation, owned processes and retained files)");
  report.success=true;report.finished_utc=new Date().toISOString();report.elapsed_ms=Date.now()-started;await save();
  console.log(JSON.stringify({success:true,phase_only:true,report:reportFile,checks:report.checks.length,layouts:report.layouts.length,status_before_exit:report.status_before_exit}));
  await cdp.detach().catch(()=>{});process.exit(0);
 }catch(error){
  report.success=false;report.error=error.message;report.elapsed_ms=Date.now()-started;
  await page.screenshot({path:path.join(root,"window-close-ui-failure.png")}).catch(()=>{});await save();
  console.error(JSON.stringify({success:false,report:reportFile,error:error.message}));await cdp.detach().catch(()=>{});throw error;
 }
})().catch(error=>{console.error(error.stack);process.exit(1);});
