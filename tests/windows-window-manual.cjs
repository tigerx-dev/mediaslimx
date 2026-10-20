/* Prepare the private synthetic window for human titlebar/Yes-No acceptance.
   No OS mouse/keyboard automation. The visible test banner is runtime-only. */
"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const stateFile=process.env.MSX_WINDOW_TEST_STATE;assert.ok(stateFile);
 const s=JSON.parse(await fs.readFile(stateFile,"utf8")),root=path.resolve(s.root);
 assert.ok(root.startsWith(path.resolve(".mediaslimx/window-tests")+path.sep));
 assert.equal(path.resolve(s.data),path.join(root,"data"));
 const record=JSON.parse(await fs.readFile(path.join(s.data,"window.json"),"utf8")),u=new URL(record.url),base=u.origin;
 assert.equal(u.hostname,"127.0.0.1");assert.ok(![8765,8766].includes(Number(u.port)));
 const token=new URLSearchParams(u.hash.slice(1)).get("token");
 const api=async(route,body)=>{const r=await fetch(base+route,{method:body?"POST":"GET",headers:{"X-MediaSlimX-Token":token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,await r.clone().text());return r.json();};
 assert.equal((await api("/api/environment")).pid,record.owner_pid);
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+s.debug_port);
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(base+"/"));assert.ok(page);
 await page.locator("#connection[data-connected=true]").waitFor();
 if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.locator("#language-toggle").click();
 const scan=await api("/api/scans",{path:s.closing_media});const count=s.manual_fixture_count||13;assert.equal(scan.entries.length,count);
 assert.ok(scan.entries.every(e=>e.status==="ready"));
 const task=await api("/api/tasks",{scan_id:scan.id,selected:scan.entries.map(e=>e.id),preset:"quality",mode:"export",output:path.join(root,"manual-exports")});
 await page.evaluate(id=>openTask(id),task.id);
 await page.evaluate(()=>{
  const banner=document.createElement("section");banner.id="manual-close-test-banner";banner.setAttribute("role","alert");
  banner.style.cssText="position:fixed;top:72px;left:244px;right:24px;z-index:9999;padding:16px;border:2px solid var(--accent);border-radius:12px;background:var(--accent-soft);color:var(--text);font:14px/1.6 system-ui;box-shadow:0 8px 24px #0003";
  const title=document.createElement("strong");title.style.fontSize="18px";title.textContent="仅合成素材 · 隔离关闭测试 3FEF68";
  const note=document.createElement("p");note.id="manual-close-test-instruction";note.style.margin="6px 0 0";note.textContent="第一步：点这个窗口标题栏的 ×，在弹窗中选择“否 / No”，先保持窗口打开。";
  banner.append(title,note);document.body.append(banner);
 });
 await page.screenshot({path:path.join(root,"manual-close-step1.png")});
 const manual={task_id:task.id,owner_pid:record.owner_pid,host_pid:record.host_pid,step:"awaiting_human_no",fixture_count:count,mode:"export",test_marker:"3FEF68",started:new Date().toISOString(),evidence:"human titlebar and native confirmation; no OS input automation"};
 await fs.writeFile(path.join(root,"manual-close-state.json"),JSON.stringify(manual,null,2));
 console.log(JSON.stringify({ready:true,task_id:task.id,files:count,marker:"3FEF68",state:path.join(root,"manual-close-state.json")}));process.exit(0);
})().catch(e=>{console.error(e.stack);process.exit(1)});
