/* Processing-plan layout, reversible disclosure motion and real export checks.
   Private synthetic media and isolated service; no user records are changed. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),{spawn}=require("node:child_process"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),platform=process.platform==="win32"?"windows":"wsl";
 const run=path.join(project,".mediaslimx","import-tests",platform+"-processing-plan-"+crypto.randomUUID()),data=path.join(run,"data"),source=path.join(run,"source");
 await fs.mkdir(path.join(source,"images"),{recursive:true});
 const original=await fs.readFile(path.join(project,".test-media","images","landscape.jpg"));
 const target=path.join(source,"images","sample.jpg");await fs.writeFile(target,original);
 const png=await fs.readFile(path.join(project,".test-media","images","alpha.png"));
 const webp=await fs.readFile(path.join(project,".test-media","images","static.webp"));
 const video=await fs.readFile(path.join(project,".test-media","video","sample.mp4"));
 await fs.writeFile(path.join(source,"images","alias.jpeg"),original);
 await fs.writeFile(path.join(source,"images","alpha.png"),png);
 await fs.writeFile(path.join(source,"images","static.webp"),webp);
 await fs.writeFile(path.join(source,"images","sample.mp4"),video);
 await fs.writeFile(path.join(source,"images","broken.jpg"),"damaged synthetic file");
 const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const python=process.env.MSX_PYTHON||path.join(project,platform==="windows"?".venv-win/Scripts/python.exe":".venv/bin/python");
 const child=spawn(python,["-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser,token,url;child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],errors:[]};
 async function api(route,body,headers={}){return fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"X-MediaSlimX-Token":token,...(body===undefined?{}:{"Content-Type":"application/json"}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
 try{
  for(let i=0;i<150;i++){const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];url=match[0];try{if((await api("/api/environment")).ok)break;}catch{}}if(child.exitCode!==null)throw Error(stderr);await delay(100);}
  assert.ok(url);




  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});

  await page.addInitScript(()=>{
   window.motionCalls=[];const original=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){window.motionCalls.push({id:this.id,className:this.className,frames,options});return original.call(this,frames,options);};
  });
  page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(url);await page.locator("#connection[data-connected=true]").waitFor();
  await page.locator("#import-file-input").setInputFiles({name:"展示 sample.jpg",mimeType:"image/jpeg",buffer:original});
  await page.waitForFunction(()=>state.scan?.entries.length===1&&!importState.busy);
  await page.click("#review-task-plan");await page.locator("#task-plan-dialog[open]").waitFor();
  assert.match(await page.locator("#plan-source-note").textContent(),/副本.*原文件保持不变.*原始绝对路径/);
  assert.equal(await page.locator("#plan-name-example").textContent(),"展示 sample.jpg");
  assert.equal((await (await api("/api/tasks")).json()).length,0);
  await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"review-task-plan");
  await page.locator('input[name="preset"][value="quality"]').check();
  await page.locator("#resize-fit").check();await page.fill("#max-width","640");
  await page.click("#review-task-plan");assert.match(await page.locator("#plan-preset").textContent(),/画质优先/);
  assert.match(await page.locator("#plan-dimensions").textContent(),/640/);
  assert.match(await page.locator("#plan-size-example").textContent(),/1280×800 → 640×400/);
  await page.click("#return-task-settings");assert.equal(await page.evaluate(()=>document.activeElement.id),"review-task-plan");
  report.checks.push("import copy/original boundary, filename preservation and real proportional-size preview; review entry returns focus and never creates a task");

  await page.click("#new-task");await page.fill("#media-path",source);
  let folderScanRequests=0;page.on("request",r=>{if(r.url()===base+"/api/scans"&&r.method()==="POST")folderScanRequests++;});
  await page.click("#browse-media");await page.locator("#folder-dialog[open]").waitFor();
  await page.getByRole("button",{name:"images",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector("#folder-current").textContent.endsWith("images"));
  assert.equal(folderScanRequests,0,"browsing child folders must not scan");
  await page.click("#folder-up");await page.waitForFunction(expected=>document.querySelector("#folder-current").textContent===expected,source);
  assert.match(await page.locator("#choose-folder").textContent(),/扫描此目录/);
  await page.click("#choose-folder");await page.locator("#folder-dialog").waitFor({state:"hidden"});
  await page.locator("#settings-section").waitFor();
  assert.equal(folderScanRequests,1,"confirming a media folder scans it exactly once");
  assert.equal((await (await api("/api/tasks")).json()).length,0,"folder selection must not start optimization");
  await page.setViewportSize({width:2560,height:1369});
  const wide=await page.evaluate(()=>({main:document.querySelector("main").getBoundingClientRect().width,list:document.querySelector("#scan-section").getBoundingClientRect().width,settings:document.querySelector("#settings-section").getBoundingClientRect().width,document:document.documentElement.scrollWidth}));
  assert.ok(wide.main>=2000&&wide.list>=1500&&wide.settings>=350,"wide desktop should give the file list useful space: "+JSON.stringify(wide));
  assert.equal(wide.document,2560,"wide workbench must not overflow");
  await page.click("#media-path");
  const focusFrame=await page.locator(".path-well").evaluate(el=>({border:getComputedStyle(el).borderColor,outline:getComputedStyle(el).outlineStyle,shadow:getComputedStyle(el).boxShadow}));
  assert.equal(focusFrame.outline,"none","focused path must have one continuous boundary, not a second outline");
  assert.notEqual(focusFrame.shadow,"none","focused path boundary must remain visible");
  await page.screenshot({path:path.join(run,"wide-workbench-single-focus-frame.png")});
  report.checks.push("2560px workbench expands the file list while keeping the settings column readable; focused path has one continuous frame");
  for(const [width,height] of [[1001,640],[1440,640],[390,640]]){
   await page.setViewportSize({width,height});
   const geometry=await page.evaluate(()=>{
    const card=document.querySelector("#review-task-plan"),action=document.querySelector("#start-button"),scroll=document.querySelector(".settings-scroll");
    const before=card.getBoundingClientRect(),start=action.getBoundingClientRect(),panel=document.querySelector("#settings-section").getBoundingClientRect();
    scroll.scrollTop=scroll.scrollHeight;
    const after=card.getBoundingClientRect();
    return {cardTop:before.top,cardBottom:before.bottom,cardHeight:before.height,actionTop:start.top,actionBottom:start.bottom,panelBottom:panel.bottom,moved:Math.abs(after.top-before.top),insideScroll:scroll.contains(card),documentWidth:document.documentElement.scrollWidth,font:parseFloat(getComputedStyle(card).fontSize)};
   });
   assert.equal(geometry.insideScroll,false,"plan summary must sit outside settings scroller");
   assert.equal(geometry.documentWidth,width,"plan summary causes horizontal overflow");
   assert.ok(geometry.cardHeight>=44&&geometry.font>=12,"plan summary stays readable and clickable");
   assert.ok(geometry.cardBottom<=geometry.actionTop+1,"plan summary must precede start action");
   if(width>=1001)assert.ok(geometry.cardTop>=64&&geometry.actionBottom<=Math.min(height,geometry.panelBottom)+1&&geometry.moved<1,"plan summary clipped or scrolled at "+width+"x"+height+" "+JSON.stringify(geometry));
  }
  await page.setViewportSize({width:1440,height:640});
  report.checks.push("compact plan summary stays above start action outside the parameter scroller at desktop minimum height; narrow layout remains readable");
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   assert.match(await page.locator("#start-count").textContent(),lang==="en"?/\d+ files/:/\d+ 个文件/,"summary count follows language");
   for(const [width,height] of [[1001,640],[390,640]]){
    await page.setViewportSize({width,height});
    const check=await page.locator("#review-task-plan").evaluate(card=>{
     const r=card.getBoundingClientRect(),offenders=[];
     for(const item of card.querySelectorAll("span:not(.sr-only)")){
      const b=item.getBoundingClientRect();
      if(b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1)offenders.push(item.id||item.className||item.textContent);
      if(parseFloat(getComputedStyle(item).fontSize)<12)offenders.push("font too small");
     }
     return {offenders,scrollWidth:card.scrollWidth,clientWidth:card.clientWidth};
    });
    assert.deepEqual(check.offenders,[],"plan summary text clipped "+lang+" "+width);
    assert.ok(check.scrollWidth<=check.clientWidth+1,"plan summary overflows "+lang+" "+width);
    if(width<1001)await page.locator("#review-task-plan").scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(run,"plan-summary-"+lang+"-"+width+"x"+height+".png")});
   }
  }
  await page.click("#language-toggle");await page.setViewportSize({width:1440,height:640});
  report.checks.push("Chinese/English compact summary fits 1001px short desktop and 390px narrow layout without clipping; screenshots saved");
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const [width,height] of [[320,568],[390,640],[768,900],[1001,640],[1280,820]]){
    await page.setViewportSize({width,height});
    const entry=await page.locator("#toggle-settings").evaluate(button=>{const b=button.getBoundingClientRect(),h=button.closest(".section-title").getBoundingClientRect();return {text:button.textContent.trim(),left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,headerLeft:h.left,headerRight:h.right};});
    assert.equal(entry.text,lang==="en"?"Expand":"展开设置");
    assert.ok(entry.width>=44&&entry.height>=44&&entry.left>=entry.headerLeft-1&&entry.right<=entry.headerRight+1,"visible settings entry must fit its header "+lang+" "+width+" "+JSON.stringify(entry));
    const before=await page.evaluate(()=>{window.__settingsForm=document.querySelector("#task-form");return {list:document.querySelector("#scan-section").getBoundingClientRect().toJSON(),preset:document.querySelector('input[name="preset"]:checked').value};});
    await page.locator("#toggle-settings").click();
    const expanded=await page.evaluate(()=>{
     const panel=document.querySelector("#settings-section"),list=document.querySelector("#scan-section").getBoundingClientRect(),scroll=document.querySelector(".settings-scroll"),button=document.querySelector("#toggle-settings");
     const p=panel.getBoundingClientRect(),s=scroll.getBoundingClientRect();
     return {open:panel.dataset.expanded,role:panel.getAttribute("role"),ariaModal:panel.getAttribute("aria-modal"),buttonLabel:button.getAttribute("aria-label"),buttonWidth:button.getBoundingClientRect().width,buttonHeight:button.getBoundingClientRect().height,panel:p.toJSON(),list:list.toJSON(),scroll:s.toJSON(),scrollTop:scroll.scrollTop,actionWidth:document.querySelector("#start-button").getBoundingClientRect().width,docWidth:document.documentElement.scrollWidth,formSame:document.querySelector("#task-form")===window.__settingsForm,preset:document.querySelector('input[name="preset"]:checked').value};
    });
    assert.equal(expanded.open,"true");assert.equal(expanded.role,"dialog");assert.equal(expanded.ariaModal,"true");
    assert.ok(expanded.buttonWidth>=44&&expanded.buttonHeight>=44);
    assert.ok(expanded.panel.width>=Math.min(width-32,590)&&expanded.panel.height>=height-33);
    assert.ok(expanded.scroll.height>=Math.min(250,height*.38));
    assert.equal(expanded.scrollTop,0,"expanded editor should show the first setting");
    assert.ok(expanded.actionWidth>=expanded.panel.width-50,"expanded primary action should fill the footer");
    assert.ok(Math.abs(expanded.list.width-before.list.width)<1&&Math.abs(expanded.list.left-before.list.left)<1,"file list must not shift behind editor");
    assert.equal(expanded.docWidth,width);assert.equal(expanded.preset,before.preset);
    assert.equal(expanded.formSame,true);
    assert.match(expanded.buttonLabel,lang==="en"?/Collapse settings/:/收起参数设置/);
    assert.equal(await page.locator("#toggle-settings use").getAttribute("href"),"/static/icons.svg#collapse","collapse icon must describe restoring the side pane, not closing settings");
    await delay(260);await page.screenshot({path:path.join(run,"settings-expanded-"+lang+"-"+width+"x"+height+".png")});
    await page.keyboard.press("Escape");
    await page.waitForFunction(()=>document.querySelector("#settings-section").dataset.expanded==="false");
    assert.equal(await page.locator("#settings-section").getAttribute("data-expanded"),"false");
    assert.equal(await page.evaluate(()=>document.activeElement.id),"toggle-settings");
   }
  }
  await page.setViewportSize({width:1280,height:820});
  await page.click("#toggle-settings");
  const slide=await page.locator("#settings-section").evaluate(panel=>{
   const animation=panel.getAnimations().find(item=>item.animationName==="settings-arrive");
   if(!animation)return null;
   animation.pause();animation.currentTime=0;const start=panel.getBoundingClientRect().left;
   animation.currentTime=120;const middle=panel.getBoundingClientRect().left;
   animation.finish();const end=panel.getBoundingClientRect().left;
   return {start,middle,end};
  });
  assert.ok(slide&&slide.start>slide.middle&&slide.middle>slide.end&&Math.abs(slide.start-slide.end-24)<1,"settings panel must arrive a short distance from the right: "+JSON.stringify(slide));
  const retreat=await page.evaluate(()=>{
   const panel=document.querySelector("#settings-section");document.querySelector("#toggle-settings").click();
   const animation=panel.getAnimations().find(item=>item.effect.getTiming().duration===160);
   if(!animation)return null;
   animation.pause();animation.currentTime=0;const start=panel.getBoundingClientRect().left;
   animation.currentTime=80;const middle=panel.getBoundingClientRect().left;
   animation.finish();const end=panel.getBoundingClientRect().left,finalOpacity=Number(getComputedStyle(panel).opacity);
   return {start,middle,end,finalOpacity,heldModal:panel.dataset.expanded==="true"};
  });
  assert.ok(retreat&&retreat.heldModal&&retreat.start<retreat.middle&&retreat.middle<retreat.end&&Math.abs(retreat.end-retreat.start-24)<1,"collapse must retreat right before releasing the modal: "+JSON.stringify(retreat));
  assert.ok(retreat.finalOpacity<=.01,"large panel must fade out before returning to the narrow sidebar: "+JSON.stringify(retreat));
  await page.waitForFunction(()=>document.querySelector("#settings-section").dataset.expanded==="false");
  await page.click("#toggle-settings");
  const interrupted=await page.evaluate(()=>{
   const panel=document.querySelector("#settings-section"),entry=panel.getAnimations().find(item=>item.animationName==="settings-arrive");
   if(!entry)return null;
   entry.pause();entry.currentTime=120;const before=panel.getBoundingClientRect().left;
   document.querySelector("#settings-backdrop").click();
   const exit=panel.getAnimations().find(item=>item.effect.getTiming().duration===160);
   if(!exit)return null;
   exit.pause();exit.currentTime=0;const after=panel.getBoundingClientRect().left;exit.finish();
   return {before,after};
  });
  assert.ok(interrupted&&Math.abs(interrupted.before-interrupted.after)<1,"outside click during entry must reverse without a jump: "+JSON.stringify(interrupted));
  await page.waitForFunction(()=>document.querySelector("#settings-section").dataset.expanded==="false");
  await page.click("#toggle-settings");
  await page.evaluate(()=>document.querySelector("#toggle-settings").click());
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.waitForFunction(()=>document.querySelector("#settings-section").dataset.expanded==="false");
  await page.click("#toggle-settings");
  assert.equal(await page.locator("#settings-section").evaluate(panel=>getComputedStyle(panel).animationName),"none","reduced motion must show settings without sliding");
  assert.equal(await page.locator("#settings-backdrop").evaluate(backdrop=>getComputedStyle(backdrop).animationName),"none","reduced motion must avoid backdrop animation");
  await page.keyboard.press("Escape");await page.emulateMedia({reducedMotion:"no-preference"});
  report.checks.push("settings overlay enters and retreats 24px at right, fades fully before restoring the side pane; button and outside click share a smooth close, early reversal has no jump, reduced motion is immediate");
  await page.setViewportSize({width:1440,height:640});
  if(await page.locator("html").getAttribute("lang")!=="zh-CN")await page.click("#language-toggle");
  await page.click("#toggle-settings");
  await page.click("#mode-trigger");assert.equal(await page.locator("#mode-options").isVisible(),true);
  await page.keyboard.press("Escape");assert.equal(await page.locator("#mode-options").isVisible(),false);
  assert.equal(await page.locator("#settings-section").getAttribute("data-expanded"),"true","Escape closes the select first");
  await page.click("#mode-trigger");await page.click("#mode-option-1");assert.equal(await page.locator("#mode").inputValue(),"backup");
  await page.click("#review-task-plan");assert.equal(await page.locator("#task-plan-dialog").evaluate(n=>n.open),true);
  await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"review-task-plan");
  assert.equal(await page.locator("#settings-section").getAttribute("data-expanded"),"true","closing plan must keep editable overlay open");
  await page.keyboard.press("Escape");await page.waitForFunction(()=>document.querySelector("#settings-section").dataset.expanded==="false");assert.equal(await page.evaluate(()=>document.activeElement.id),"toggle-settings");
  await page.click("#toggle-settings");await page.locator("#settings-backdrop").click({position:{x:20,y:20}});
  await page.waitForFunction(()=>document.querySelector("#settings-section").dataset.expanded==="false");
  assert.equal(await page.locator("#settings-section").getAttribute("data-expanded"),"false","backdrop closes editor");
  assert.equal((await (await api("/api/tasks")).json()).length,0,"editing overlay must not start a task");
  report.checks.push("same editable settings form expands to a modal-width overlay across Chinese/English and short desktop/mobile viewports; file list stays put, Escape restores focus, no task starts");
  async function mode(value){await page.click("#mode-trigger");await page.locator("#mode-option-"+({export:0,backup:1,overwrite:2}[value])).click();}
  await mode("backup");assert.match(await page.locator("#plan-mode").textContent(),/备份原件/);await page.fill("#backup-path",path.join(run,"backups"));
  await page.click("#review-task-plan");assert.match(await page.locator("#plan-effect").textContent(),/复制原件.*写回原路径.*不移动/);
  assert.match(await page.locator("#plan-recovery").textContent(),/修改冲突/);
  assert.ok((await page.locator("#plan-paths").textContent()).includes(path.join(run,"backups")));
  await page.keyboard.press("Escape");
  await mode("overwrite");await page.click("#review-task-plan");
  assert.equal(await page.locator("#plan-recovery").evaluate(n=>n.classList.contains("bad")),true);
  assert.match(await page.locator("#plan-effect").textContent(),/不保留原件.*无法恢复/);
  await page.keyboard.press("Escape");await mode("export");
  await page.fill("#output-path",path.join(run,"exports","long-folder-".repeat(20)));
  await page.locator("#resize-fit").check();await page.fill("#max-width","640");await page.fill("#max-height","480");
  const sizes=[[320,568],[390,640],[768,900],[1001,640],[1440,640],[1440,900]];
  report.layouts=[];
  async function layout(width,height,lang,theme){
   await page.setViewportSize({width,height});await page.click("#review-task-plan");await delay(270);
   const check=await page.evaluate(()=>{
    const d=document.querySelector("#task-plan-dialog"),box=d.getBoundingClientRect(),content=d.querySelector(".task-plan-content"),footer=d.querySelector(".task-plan-footer"),header=d.querySelector(".dialog-header");
    const visible=n=>!!n.getClientRects().length&&getComputedStyle(n).visibility!=="hidden";
    const offenders=[];let minW=Infinity,minH=Infinity;
    if(innerWidth>=900){
     const grid=d.querySelector(".plan-grid").getBoundingClientRect();
     for(const sel of [".plan-naming",".plan-reliability"]){
      const section=d.querySelector(sel).getBoundingClientRect();
      if(Math.abs(section.width-grid.width)>1)offenders.push("section must use full width "+sel);
     }
     const recovery=d.querySelector("#plan-recovery").getBoundingClientRect();
     if(recovery.width<grid.width*.6)offenders.push("recovery text column too narrow");
    }
    for(const n of d.querySelectorAll("button,a,input,select,[tabindex]")){
     if(!visible(n))continue;const r=n.getBoundingClientRect();minW=Math.min(minW,r.width);minH=Math.min(minH,r.height);
     if(r.width<43.9||r.height<43.9)offenders.push(n.id||n.className);
     if(r.left<box.left||r.right>box.right||r.top<box.top||r.bottom>box.bottom)offenders.push("out of dialog "+n.id);
    }
    const walk=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);let n;
    while(n=walk.nextNode()){
     if(!n.textContent.trim()||!visible(n.parentElement))continue;
     if(parseFloat(getComputedStyle(n.parentElement).fontSize)<12)offenders.push("font: "+n.textContent);
    }
    const f=footer.getBoundingClientRect(),h=header.getBoundingClientRect(),c=content.getBoundingClientRect();
    if(content.scrollWidth>content.clientWidth+1)offenders.push("content horizontal overflow");
    if(box.left<0||box.right>innerWidth||box.top<0||box.bottom>innerHeight)offenders.push("dialog outside viewport");
    if(h.bottom>c.top+1||f.top<c.bottom-1)offenders.push("fixed header/footer overlap content");
    if(c.height<60)offenders.push("content too short");
    return {offenders,minW,minH,width:box.width,height:box.height,scrollable:content.scrollHeight>content.clientHeight};
   });
   assert.deepEqual(check.offenders,[],JSON.stringify({width,height,lang,theme,...check}));
   if(lang==="en"){
    const untranslated=await page.locator("#task-plan-dialog").evaluate(d=>{
     const out=[],walk=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);let n;
     while(n=walk.nextNode())if(/[\u3400-\u9fff]/.test(n.textContent)&&!n.parentElement.closest("[data-i18n-skip],#plan-size-example,#plan-paths"))out.push(n.textContent);
     return out;
    });assert.deepEqual(untranslated,[],"untranslated plan labels");
   }
   await page.locator(".task-plan-content").evaluate(n=>n.scrollTop=n.scrollHeight);
   assert.equal(await page.locator("#return-task-settings").isVisible(),true);
   await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"review-task-plan");
   report.layouts.push({viewportWidth:width,viewportHeight:height,lang,theme,...check});
  }
  for(const lang of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==lang)await page.click("#language-toggle");
   for(const theme of ["dark","light"]){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const size of sizes)await layout(...size,lang,theme);
   }
  }
  assert.equal((await (await api("/api/tasks")).json()).length,0,"reviewing modes does not submit anything");
  report.checks.push("three modes show true destination/recovery behavior; 24 bilingual/theme/viewport cases: >=12px text, >=44px targets, no modal clipping, independent content scroll, close/focus reachable");
  await page.setViewportSize({width:1440,height:900});
  await page.click("#language-toggle");await page.evaluate(()=>document.documentElement.dataset.theme="dark");
  await page.click("#review-task-plan");await delay(270);await page.screenshot({path:path.join(run,"processing-plan-desktop.png")});await page.keyboard.press("Escape");
  await page.click("#language-toggle");await page.setViewportSize({width:390,height:640});
  await page.click("#review-task-plan");await delay(270);await page.screenshot({path:path.join(run,"processing-plan-mobile-en.png")});await page.keyboard.press("Escape");

  await page.setViewportSize({width:1440,height:900});
  const env=page.locator(".environment"),summary=env.locator(">summary");
  const closed=await env.evaluate(n=>n.getBoundingClientRect().height);
  await summary.click();await page.waitForFunction(()=>document.querySelector(".environment").getAnimations().length>0);
  const mid=await env.evaluate(n=>{const a=n.getAnimations()[0];a.pause();a.currentTime=a.effect.getTiming().duration/2;return n.getBoundingClientRect().height;});
  const expanded=await env.evaluate(n=>{const a=n.getAnimations()[0];a.finish();return n.getBoundingClientRect().height;});
  await page.waitForFunction(()=>!document.querySelector(".environment").classList.contains("disclosure-moving"));
  assert.ok(mid>closed+1&&mid<expanded-1,"opening must interpolate real height");
  await summary.click();await page.waitForFunction(()=>document.querySelector(".environment").getAnimations().length>0);
  const closing=await env.evaluate(n=>{const a=n.getAnimations()[0];a.pause();a.currentTime=a.effect.getTiming().duration/2;return n.getBoundingClientRect().height;});
  assert.ok(closing>closed&&closing<expanded,"closing must interpolate too");
  await env.evaluate(n=>n.querySelector("summary").click());
  await page.waitForFunction(()=>document.querySelector(".environment").dataset.expanded==="true"&&!document.querySelector(".environment").classList.contains("disclosure-moving"));
  assert.equal(await env.evaluate(n=>n.open),true,"rapid reversal settles to latest intent");
  const continuity=await env.evaluate(n=>{
   n.querySelector("summary").click();const a=n.getAnimations()[0];a.pause();a.currentTime=a.effect.getTiming().duration/2;
   const before=n.getBoundingClientRect().height;n.querySelector("summary").click();return {before,after:n.getBoundingClientRect().height};
  });
  assert.ok(Math.abs(continuity.before-continuity.after)<1,"reversal must not jump");
  await page.waitForFunction(()=>!document.querySelector(".environment").classList.contains("disclosure-moving"));
  await env.evaluate(n=>{document.querySelector("#open-environment").focus();n.querySelector("summary").click();});
  await page.waitForFunction(()=>!document.querySelector(".environment").open);
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),"SUMMARY");
  await summary.focus();await page.keyboard.press("Space");
  await page.waitForFunction(()=>document.querySelector(".environment").open&&!document.querySelector(".environment").classList.contains("disclosure-moving"));
  await page.keyboard.press("Space");await page.waitForFunction(()=>!document.querySelector(".environment").open);
  const compression=page.locator(".compression-notice");
  await compression.locator("summary").click();
  await page.waitForFunction(()=>document.querySelector(".compression-notice").open&&!document.querySelector(".compression-notice").classList.contains("disclosure-moving"));
  await compression.locator("summary").click();await page.waitForFunction(()=>!document.querySelector(".compression-notice").open);
  report.checks.push("real opening/closing intermediate heights; rapid reversal <1px discontinuity; stable semantic state, Space activation and focused-content recovery; compression notice also collapses smoothly");

  await summary.click();await page.waitForFunction(()=>document.querySelector(".environment").classList.contains("disclosure-moving"));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.waitForFunction(()=>!document.querySelector(".environment").classList.contains("disclosure-moving"));
  const before=await page.evaluate(()=>motionCalls.length);
  await summary.click();assert.equal(await env.evaluate(n=>n.open),false);
  await summary.click();assert.equal(await env.evaluate(n=>n.open),true);
  assert.equal(await page.evaluate(()=>motionCalls.length),before,"reduced motion must launch no animation");
  await page.setViewportSize({width:390,height:640});await page.locator("#environment-dialog[open]").waitFor();
  await page.keyboard.press("Escape");await summary.click();await page.locator("#environment-dialog[open]").waitFor();
  await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.tagName),"SUMMARY");
  report.checks.push("reduced motion settles an active disclosure and prevents new WAAPI calls; mobile environment uses explicit dialog with focus return");

  await page.setViewportSize({width:1440,height:900});
  await page.fill("#output-path",path.join(run,"exports"));
  await page.click("#selection-type-trigger");await page.click("#selection-type-option-1");
  const request=page.waitForRequest(r=>r.url()===base+"/api/tasks"&&r.method()==="POST");
  await page.click("#start-button");const body=(await request).postDataJSON();
  assert.equal(body.mode,"export");assert.equal(body.max_width,640);
  await page.waitForFunction(()=>state.task?.status==="completed",{},{timeout:60000});
  const task=await page.evaluate(()=>state.task),entry=task.entries.find(e=>e.relative==="images/sample.jpg");
  assert.equal(entry.status,"success");assert.equal(path.basename(entry.destination),"sample.jpg");
  assert.equal(entry.result_info.width,640);
  assert.deepEqual(await fs.readFile(target),original);
  report.checks.push("actual export after review retains original basename/tree, resizes as planned and leaves source bytes unchanged");
  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({platform,evidence:run,checks:report.checks,layoutCases:report.layouts.length,errors:report.errors},null,2));
 }finally{
  if(browser)await browser.close();
  if(child.exitCode===null){if(process.platform==="win32")await new Promise(r=>{const stop=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});stop.on("close",r);});else{child.kill("SIGTERM");await Promise.race([new Promise(r=>child.on("close",r)),delay(5000)]);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
