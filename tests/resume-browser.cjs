/* Isolated restart/continue UI acceptance. No default data or user media. */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const {spawn,spawnSync}=require("node:child_process");
const {chromium}=require(process.env.MSX_PLAYWRIGHT||"playwright");
const project=process.cwd(),run=path.join(project,".mediaslimx","resume-tests",crypto.randomUUID());
const python=process.env.MSX_PYTHON||path.join(project,process.platform==="win32"?".venv-win/Scripts/python.exe":".venv/bin/python");
const source=path.join(run,"media"),data=path.join(run,"data"),output=path.join(run,"export");
const seed=`import json,sys
from pathlib import Path
from PIL import Image
from mediaslimx.engine import Engine
root,data,out=map(Path,sys.argv[1:4]);root.mkdir(parents=True,exist_ok=True)
for i,color in enumerate(((220,70,20),(20,100,220))):
 Image.new('RGB',(640,480),color).save(root/f'{i}.jpg',quality=100)
e=Engine(data,[root]);s=e.scan(str(root));key=e.create(s['id'],[x['id'] for x in s['entries']],{'preset':'balanced','max_width':None,'max_height':None},'export',output=str(out));task=e.wait(key)
assert all(x['status']=='success' for x in task['entries'])
last=task['entries'][-1];Path(last['destination']).unlink();last.update(status='processing',destination=None,result_fp=None,result_size=last['size'])
task.update(status='running',stop_reason=None);e.save('task',task)
print(json.dumps({'id':key,'first_result_sha':task['entries'][0]['result_fp']['sha256']}))`;
async function main(){
 await fs.mkdir(run,{recursive:true});
 const prepared=spawnSync(python,["-B","-c",seed,source,data,output],{cwd:project,encoding:"utf8"});
 assert.equal(prepared.status,0,prepared.stderr);const fixture=JSON.parse(prepared.stdout.trim());
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(python,["-B","-m","mediaslimx","--port",String(port),"--data-dir",data,"--allow-root",source,"--no-browser"],{cwd:project,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"},stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",browser;child.stdout.on("data",v=>stdout+=v);child.stderr.on("data",v=>stderr+=v);
 const base="http://127.0.0.1:"+port,delay=ms=>new Promise(r=>setTimeout(r,ms));let token;
 const request=async(route,method="GET")=>fetch(base+route,{method,headers:{"X-MediaSlimX-Token":token,...(method==="POST"?{"Content-Type":"application/json"}:{})},body:method==="POST"?"{}":undefined});
 try{
  for(let i=0;i<150;i++){
   const match=stdout.match(/#token=([A-Za-z0-9_-]+)/);if(match){token=match[1];try{if((await request("/api/environment")).ok)break;}catch{}}
   if(child.exitCode!==null)throw Error(stderr);await delay(100);
  }
  assert.ok(token,"isolated service failed to start: "+stderr);
  browser=await chromium.launch({executablePath:process.env.MSX_CHROME||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:800}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/#token="+token);
  await page.locator("#result-title").filter({hasText:"已中断"}).waitFor();
  assert.equal(await page.locator("#resume-summary").isVisible(),true);
  assert.match(await page.locator("#resume-description").innerText(),/剩余 1 项/);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:720});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"Chinese overflow at "+width);
   assert.ok((await page.locator("#resume-task").boundingBox()).height>=44);
   const inset=await page.evaluate(()=>{const panel=document.querySelector(".results-panel").getBoundingClientRect(),card=document.querySelector("#resume-summary").getBoundingClientRect(),root=document.querySelector("#result-root").getBoundingClientRect();return {left:card.left-panel.left,right:panel.right-card.right,top:card.top-root.bottom};});
   assert.ok(inset.left>=14&&inset.right>=14&&inset.top>=8,"resume card too close to panel/root: "+width+" "+JSON.stringify(inset));
  }
  await page.locator("#language-toggle").click();
  assert.equal(await page.locator("#resume-task").innerText(),"Continue remaining files");
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:720});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"English overflow at "+width);
   const inset=await page.evaluate(()=>{const panel=document.querySelector(".results-panel").getBoundingClientRect(),card=document.querySelector("#resume-summary").getBoundingClientRect();return {left:card.left-panel.left,right:panel.right-card.right};});
   assert.ok(inset.left>=14&&inset.right>=14,"English resume card too close to panel: "+width+" "+JSON.stringify(inset));
  }
  await page.locator("#resume-task").click();
  await page.waitForFunction(()=>document.querySelector("#result-title")?.textContent.includes("Completed"),null,{timeout:30000});
  assert.equal(await page.locator("#resume-summary").isVisible(),false);
  const response=await request("/api/tasks/"+fixture.id);assert.equal(response.status,200);const task=await response.json();
  assert.equal(task.status,"completed");assert.deepEqual(task.entries.map(e=>e.status),["success","success"]);
  assert.equal(task.entries[0].result_fp.sha256,fixture.first_result_sha);
  for(const language of ["en","zh-CN"]){
   if(await page.locator("html").getAttribute("lang")!==language)await page.locator("#language-toggle").click();
   await page.evaluate(()=>document.querySelector("#window-close-dialog").showModal());
   for(const width of [320,390]){
    await page.setViewportSize({width,height:568});
    await delay(300); // Measure after the dialog entrance transform settles.
    const rect=await page.locator("#window-close-dialog").boundingBox();
    assert.ok(rect.x>=0&&rect.x+rect.width<=width,"close dialog clipped: "+language+" "+width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const selector of ["#window-close-stay","#window-close-exit"]){
     const button=await page.locator(selector).boundingBox();
     assert.ok(button.height>=44,language+" "+width+" "+selector+" height "+button.height);
    }
   }
   const copy=await page.locator("#window-close-dialog").innerText();
   if(language==="en")assert.match(copy,/Save progress and quit/);
   else assert.match(copy,/保留进度并退出/);
   await page.evaluate(()=>document.querySelector("#window-close-dialog").close());
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({isolated_root:run,restart_detection:true,explicit_resume:true,source_results:task.entries.map(e=>e.status),layouts:[320,390,768,1440],languages:["zh-CN","en"],errors},null,2));
 }finally{
  if(browser)await browser.close();child.kill("SIGINT");
  await Promise.race([new Promise(r=>child.once("exit",r)),delay(5000)]);
  if(child.exitCode===null)child.kill("SIGTERM");
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
