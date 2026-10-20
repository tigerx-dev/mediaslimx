/* Actual isolated ZIP/WebView2: detect interrupted work, then resume by click. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
const local=value=>process.platform==="win32"?value:(/^[A-Za-z]:[\\/]/.test(value)?"/mnt/"+value[0].toLowerCase()+value.slice(2).replaceAll("\\","/"):value);
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
(async()=>{
 assert.ok(process.env.MSX_WINDOW_TEST_STATE);
 const stateFile=local(process.env.MSX_WINDOW_TEST_STATE),s=JSON.parse(await fs.readFile(stateFile,"utf8")),root=path.resolve(local(s.root));
 assert.ok(root.startsWith(path.resolve(".mediaslimx/window-tests")+path.sep));
 assert.equal(path.resolve(local(s.data)),path.join(root,"data"));
 const record=JSON.parse(await fs.readFile(path.join(root,"data","window.json"),"utf8")),u=new URL(record.url),base=u.origin;
 assert.equal(u.hostname,"127.0.0.1");assert.ok(![8765,8766].includes(Number(u.port)));
 const token=new URLSearchParams(u.hash.slice(1)).get("token");assert.ok(token);
 const json=async route=>{const response=await fetch(base+route,{headers:{"X-MediaSlimX-Token":token}});assert.equal(response.status,200);return response.json();};
 const environment=await json("/api/environment");assert.equal(environment.pid,record.owner_pid);
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+s.debug_port);
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(base+"/"));assert.ok(page);
 const originalViewport=page.viewportSize()||await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 const originalLanguage=await page.locator("html").getAttribute("lang");
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const report={actual_zip:true,native_webview2:true,scope:"Private candidate window; seeded synthetic interruption, not a forced crash",checks:[],errors};
 const reportFile=path.join(root,"window-resume-report.json");
 try{
  await page.locator("#result-title").filter({hasText:"已中断"}).waitFor();
  assert.equal(await page.locator("#resume-summary").isVisible(),true);
  const desktopInset=await page.evaluate(()=>{const panel=document.querySelector(".results-panel").getBoundingClientRect(),card=document.querySelector("#resume-summary").getBoundingClientRect(),root=document.querySelector("#result-root").getBoundingClientRect();return {left:card.left-panel.left,right:panel.right-card.right,top:card.top-root.bottom};});
  assert.ok(desktopInset.left>=20&&desktopInset.right>=20&&desktopInset.top>=8,"native resume card spacing "+JSON.stringify(desktopInset));
  report.checks.push("resume card follows result-panel gutter in native WebView2");
  let task=await json("/api/tasks/"+s.resume_task_id);assert.equal(task.status,"interrupted");
  assert.deepEqual(task.entries.map(e=>e.status),["success","cancelled"]);
  assert.equal(task.entries[0].result_fp.sha256,s.kept_result_fp.sha256);
  report.checks.push("startup reconciles interrupted record and shows explicit resume without writing");
  await page.locator("#language-toggle").click();
  assert.equal(await page.locator("#resume-task").innerText(),"Continue remaining files");
  await page.setViewportSize({width:390,height:700});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const mobileInset=await page.evaluate(()=>{const panel=document.querySelector(".results-panel").getBoundingClientRect(),card=document.querySelector("#resume-summary").getBoundingClientRect();return {left:card.left-panel.left,right:panel.right-card.right};});
  assert.ok(mobileInset.left>=14&&mobileInset.right>=14,"narrow native resume card spacing "+JSON.stringify(mobileInset));
  report.checks.push("English resume control fits narrow native WebView2 viewport");
  // CDP changes the visible test window. Restore its original appearance before
  // continuing and closing so an observer never sees a mobile/English flash.
  await page.setViewportSize(originalViewport);
  if(await page.locator("html").getAttribute("lang")!==originalLanguage)await page.locator("#language-toggle").click();
  assert.equal(await page.locator("html").getAttribute("lang"),originalLanguage);
  await page.locator("#resume-task").click();
  await page.waitForFunction(()=>/Completed|已完成/.test(document.querySelector("#result-title")?.textContent||""),null,{timeout:30000});
  task=await json("/api/tasks/"+s.resume_task_id);
  assert.deepEqual(task.entries.map(e=>e.status),["success","success"]);
  assert.equal(task.entries[0].result_fp.sha256,s.kept_result_fp.sha256);
  const originals=Object.fromEntries(Object.entries(s.original_hashes).map(([name,digest])=>[name.replaceAll("\\","/"),digest]));
  for(const e of task.entries)assert.equal(sha(await fs.readFile(local(e.source))),originals[path.relative(local(s.root),local(e.source)).replaceAll("\\","/")]);
  report.checks.push("manual resume processes only remainder; earlier result and source hashes remain");
  assert.deepEqual(errors,[]);
  report.success=true;await fs.writeFile(reportFile,JSON.stringify(report,null,2));
  await page.locator("#quit-app").click({noWaitAfter:true}).catch(error=>{if(!/closed|disconnected|Target page/i.test(error.message))throw error;});
  console.log(JSON.stringify({success:true,report:reportFile,checks:report.checks.length}));
  process.exit(0);
 }catch(error){report.success=false;report.error=error.message;await fs.writeFile(reportFile,JSON.stringify(report,null,2));throw error;}
})().catch(e=>{console.error(e);process.exitCode=1;});
