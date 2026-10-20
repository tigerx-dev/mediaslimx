/* Mark a private running synthetic task for a human titlebar-close check.
   CDP only opens the task in its own WebView and adds a runtime-only banner.
   It never sends a close command or any OS mouse/keyboard input. */
"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const stateFile=process.env.MSX_WINDOW_TEST_STATE;assert.ok(stateFile);
 const state=JSON.parse(await fs.readFile(stateFile,"utf8"));
 const root=path.resolve(state.root),testRoot=path.resolve(".mediaslimx/window-tests")+path.sep;
 assert.ok(root.startsWith(testRoot));
 assert.equal(path.resolve(state.data),path.join(root,"data"));
 assert.match(state.close_task_id||"",/^[a-f0-9]{32}$/);
 const record=JSON.parse(await fs.readFile(path.join(state.data,"window.json"),"utf8"));
 const url=new URL(record.url),base=url.origin,marker=root.slice(-6).toUpperCase();
 assert.equal(url.hostname,"127.0.0.1");assert.equal(Number(url.port),state.port);
 assert.ok(![8765,8766].includes(state.port));
 assert.equal(record.owner_pid,state.owner_pid);
 const token=new URLSearchParams(url.hash.slice(1)).get("token");assert.ok(token);
 const response=await fetch(base+"/api/tasks/"+state.close_task_id,{headers:{"X-MediaSlimX-Token":token}});
 assert.equal(response.status,200);const task=await response.json();
 assert.equal(task.status,"running","A finished queue would make titlebar X exit directly");
 const browser=await chromium.connectOverCDP("http://127.0.0.1:"+state.debug_port);
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith(base+"/"));assert.ok(page);
 await page.locator("#connection[data-connected=true]").waitFor();
 if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.locator("#language-toggle").click();
 await page.evaluate(id=>openTask(id),state.close_task_id);
 await page.evaluate(tag=>{
  document.querySelector("#manual-close-test-banner")?.remove();
  const banner=document.createElement("section");banner.id="manual-close-test-banner";banner.setAttribute("role","status");
  banner.style.cssText="position:fixed;top:72px;left:244px;right:24px;z-index:9999;padding:12px 16px;border:2px solid var(--accent);border-radius:12px;background:var(--accent-soft);color:var(--text);font:14px/1.6 system-ui;box-shadow:0 8px 24px #0003;pointer-events:none";
  const title=document.createElement("strong");title.style.fontSize="18px";title.textContent="仅合成素材 · 新版关闭测试 "+tag;
  const note=document.createElement("p");note.style.margin="4px 0 0";note.textContent="请点本窗口标题栏 ×。若出现确认层，先选“继续使用”，回报你看到的内容；请勿点其他 MediaSlim X 窗口。";
  banner.append(title,note);document.body.append(banner);
 },marker);
 await page.screenshot({path:path.join(root,"manual-close-ready.png")});
 await fs.writeFile(path.join(root,"manual-close-ready.json"),JSON.stringify({marker,task_id:state.close_task_id,owner_pid:state.owner_pid,host_pid:state.host_pid,task_status:task.status,prepared_at:new Date().toISOString(),human_titlebar_action_pending:true},null,2));
 console.log(JSON.stringify({ready:true,marker,task_status:task.status,fixture_count:task.entries.length,state:stateFile}));
 process.exit(0);
})().catch(e=>{console.error(e.stack);process.exit(1)});
