/* Frontend-only close-dialog acceptance, using a mocked host bridge and API.
   No Windows window, service, task or media is opened, closed or modified. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
(async()=>{
 const project=process.cwd(),run=path.join(project,".mediaslimx/window-tests","close-ui-mock-"+crypto.randomUUID());await fs.mkdir(run,{recursive:true});
 const report={scope:"Headless frontend with mocked native messages/API; not actual native close acceptance",checks:[],layouts:[],errors:[]};
 let native=false,page,browser;const base="http://127.0.0.1:42171";
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),id=n=>n.toString(16).padStart(32,"0");
 try{
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  page=await browser.newPage({viewport:{width:1440,height:900}});page.on("pageerror",error=>report.errors.push(error.message));
  await page.addInitScript(()=>{
   const listeners=[],messages=[];window.__closeMessages=messages;
   const bridge={addEventListener(type,listener){if(type==="message")listeners.push(listener);},postMessage(value){messages.push(JSON.parse(JSON.stringify(value)));}};
   window.__closeHost=value=>listeners.forEach(listener=>listener({data:value}));
   if(!window.chrome)window.chrome={};Object.defineProperty(window.chrome,"webview",{configurable:true,value:bridge});
  });
  await page.route(base+"/**",async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==="/api/environment")return route.fulfill({json:{window_directory_drop:native,runtime:"Mock window",platform:"UI fixture",python:"fixture",pillow:"fixture",pdf:true,ffmpeg:true,ffprobe:true,native_picker:false,roots:["/synthetic-media"],cwd:"/synthetic",data_dir:"/synthetic-data",version:"test"}});
   if(pathname==="/api/tasks"||pathname==="/api/imports/unused")return route.fulfill({json:[]});
   if(pathname==="/api/session")return route.fulfill({json:{ok:true}});
   if(pathname==="/")return route.fulfill({contentType:"text/html",body:await fs.readFile(path.join(project,"mediaslimx/static/index.html"))});
   if(pathname.startsWith("/static/")&&!pathname.includes("..")){
    const target=path.join(project,"mediaslimx",pathname.slice(1)),extension=path.extname(target);
    return route.fulfill({contentType:{".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml"}[extension]||"application/octet-stream",body:await fs.readFile(target)});
   }
   throw Error("Unexpected mock request: "+pathname);
  });
  const ready=async()=>page.locator("#connection[data-connected=true]").waitFor();
  const message=value=>page.evaluate(value=>window.__closeHost(value),value);
  const request=n=>message({type:"mediaslimx-close-request",request_id:id(n),busy:true});
  const replies=()=>page.evaluate(()=>window.__closeMessages.filter(value=>value.op==="close_response"));
  await page.goto(base+"/#token="+"x".repeat(32));await ready();
  assert.equal(await page.locator("#quit-app").isVisible(),false);await request(1);assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),false);
  assert.equal((await page.evaluate(()=>window.__closeMessages)).length,0);
  report.checks.push("browser mode hides Quit app and ignores native close requests without a capability handshake");
  native=true;await page.reload();await ready();await page.locator("#quit-app").waitFor({state:"visible"});
  assert.ok((await page.evaluate(()=>window.__closeMessages)).some(value=>value.op==="window_ui_ready"&&value.language==="zh-CN"&&value.theme==="dark"));
  await page.locator("#quit-app").click();assert.deepEqual((await page.evaluate(()=>window.__closeMessages)).at(-1),{op:"request_close"});
  for(const invalid of [
   {type:"mediaslimx-close-request",request_id:12345678901234567890123456789012,busy:true},
   {type:"mediaslimx-close-request",request_id:"A".repeat(32),busy:true},
   {type:"mediaslimx-close-request",request_id:id(2),busy:"true"},
   {type:"mediaslimx-close-request",request_id:id(2),busy:false},
   {type:"mediaslimx-close-request",request_id:id(2),busy:true,extra:true}
  ])await message(invalid);
  assert.equal((await replies()).length,0);assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),false);
  report.checks.push("native-only footer sends exact request_close; malformed fields, nonce types, uppercase nonce and non-boolean busy are ignored");

  await page.locator("#media-path").click();await request(3);
  assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.matches(":modal")),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"window-close-stay");
  assert.deepEqual((await replies()).at(-1),{op:"close_response",request_id:id(3),decision:"shown"});
  const count=(await replies()).length;await request(3);assert.equal((await replies()).length,count);
  await request(4);assert.equal(await page.evaluate(()=>windowClose.pending.id),id(4));assert.equal((await replies()).length,count+1);
  await message({type:"mediaslimx-close-dismiss",request_id:id(3)});assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),true);
  const beforeDismiss=(await replies()).length;await message({type:"mediaslimx-close-dismiss",request_id:id(4)});await delay(30);
  assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),false);assert.equal((await replies()).length,beforeDismiss);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"media-path");await request(4);assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),false);
  report.checks.push("modal defaults to Keep working, same nonce does not duplicate acknowledgment, new nonce reuses it, and only matching dismiss closes without Stay");

  for(const [n,action]of [[5,"escape"],[6,"close"],[7,"stay"]]){
   await page.locator("#media-path").click();await request(n);
   if(action==="escape")await page.keyboard.press("Escape");else await page.locator(action==="close"?"#close-window-close":"#window-close-stay").click();
   await page.waitForFunction(()=>!$("window-close-dialog").open);await delay(20);
   assert.equal(await page.evaluate(()=>document.activeElement.id),"media-path");assert.deepEqual((await replies()).at(-1),{op:"close_response",request_id:id(n),decision:"stay"});
   assert.ok(await page.locator(".skip-link").evaluate(link=>link.getBoundingClientRect().bottom<0));
  }
  await page.evaluate(()=>{const button=document.createElement("button");button.dataset.taskId="synthetic-focus-task";button.textContent="Synthetic task";$("history").append(button);button.focus();});
  await request(8);await page.evaluate(()=>{const original=document.querySelector('[data-task-id="synthetic-focus-task"]');original.replaceWith(original.cloneNode(true));});
  await page.locator("#window-close-stay").click();await delay(20);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.taskId),"synthetic-focus-task");
  report.checks.push("Stay, Escape and X each return one Stay and restore actual focus; a rebuilt task button is found by its stable task ID without showing the skip link");

  await page.reload();await ready();await page.keyboard.press("Tab");
  assert.equal(await page.locator(".skip-link").evaluate(link=>link===document.activeElement),true);
  assert.ok(await page.locator(".skip-link").evaluate(link=>link.getBoundingClientRect().bottom>0));
  await page.locator("#media-path").click();await page.locator(".skip-link").evaluate(link=>link.focus());
  assert.ok(await page.locator(".skip-link").evaluate(link=>link.getBoundingClientRect().bottom<0));
  await page.locator("#media-path").click();await request(9);await delay(300);
  report.checks.push("Tab still reveals the keyboard skip link, while pointer or native-style programmatic return focus does not surface it");
  for(const language of ["zh-CN","en"]){
   if(await page.locator("html").getAttribute("lang")!==language)await page.evaluate(()=>$("language-toggle").click());
   for(const theme of ["dark","light"]){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await delay(40);
    const handshake=(await page.evaluate(()=>window.__closeMessages)).filter(value=>value.op==="window_ui_ready").at(-1);
    assert.equal(handshake.language,language);assert.equal(handshake.theme,theme);
    for(const width of [320,390,768,1001,1440]){
     await page.setViewportSize({width,height:640});
     const audit=await page.locator("#window-close-dialog").evaluate(dialog=>{
      const bounds=dialog.getBoundingClientRect(),issues=[];let minFont=Infinity,minWidth=Infinity,minHeight=Infinity;
      if(bounds.left<0||bounds.right>innerWidth||bounds.top<0||bounds.bottom>innerHeight||dialog.scrollWidth>dialog.clientWidth+1)issues.push("dialog overflow");
      for(const node of dialog.querySelectorAll("h2,p,button"))if(node.getClientRects().length){const size=parseFloat(getComputedStyle(node).fontSize);minFont=Math.min(minFont,size);if(size<12)issues.push("small text");}
      for(const button of dialog.querySelectorAll("button")){const r=button.getBoundingClientRect();minWidth=Math.min(minWidth,r.width);minHeight=Math.min(minHeight,r.height);if(r.width<44||r.height<44)issues.push("small target");if(button.scrollWidth>button.clientWidth+1)issues.push("button text overflow");}
      return{issues,minFont,minWidth,minHeight};
     });
     assert.deepEqual(audit.issues,[],JSON.stringify({language,theme,width,audit}));
     report.layouts.push({language,theme,width,...audit});
    }
    if(language==="en")assert.doesNotMatch(await page.locator("#window-close-dialog").textContent(),/[\u3400-\u9fff]/);
   }
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.ok(await page.locator("#window-close-dialog").evaluate(dialog=>parseFloat(getComputedStyle(dialog).animationDuration)<=0.001));
  await page.setViewportSize({width:1001,height:640});await page.screenshot({path:path.join(run,"english-close-dialog.png")});
  report.checks.push("twenty Chinese/English light/dark layouts preserve >=12px text, >=44px buttons and no clipping; preferences are handshaken and reduced motion settles the dialog");

  await page.locator("#window-close-exit").click();assert.equal(await page.evaluate(()=>windowClose.pending.phase),"exiting");
  assert.equal(await page.locator("#window-close-dialog").getAttribute("data-state"),"exiting");
  for(const selector of ["#window-close-stay","#window-close-exit","#close-window-close","#quit-app"])assert.equal(await page.locator(selector).isDisabled(),true);
  const afterExit=(await replies()).length;await page.keyboard.press("Escape");await request(9);await request(10);
  assert.equal((await replies()).length,afterExit);assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),true);
  await message({type:"mediaslimx-close-dismiss",request_id:id(9)});await delay(20);
  assert.equal(await page.locator("#window-close-dialog").evaluate(dialog=>dialog.open),false);
  assert.equal(await page.locator("#quit-app").isDisabled(),false,"host cancellation must release the footer exit control");
  report.checks.push("Exit sends exactly once, disables duplicate actions and waits; matching host cancellation dismisses safely and restores the product exit control");
  assert.deepEqual(report.errors,[]);report.success=true;await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({success:true,report:path.join(run,"report.json"),checks:report.checks.length,layouts:report.layouts.length}));
 }catch(error){report.success=false;report.error=error.message;if(page)await page.screenshot({path:path.join(run,"failure.png")}).catch(()=>{});await fs.writeFile(path.join(run,"report.json"),JSON.stringify(report,null,2));throw error;}
 finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
