/* Static storyboard previews only. Does not render a video or touch app services.
 * Uses WSL/Linux Node, FFmpeg, Chrome and existing development Playwright.
 * Run: node scripts/render-video-preview.cjs [--raw /absolute/capture.webm]
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');

(async()=>{
  const project=path.resolve(__dirname,'..');
  const output=path.join(project,'assets','launch','preview-frames');
  const rawFlag=process.argv.indexOf('--raw');
  if (process.argv.slice(2).some((argument,index,args)=>argument!=='--raw'&&args[index-1]!=='--raw')) throw Error('Only --raw is supported.');
  const raw=rawFlag>=0?path.resolve(process.argv[rawFlag+1]):path.join(project,'.mediaslimx','showcase','70b2795d-51d8-4ca2-9986-d16bc95f241b','raw-demo.webm');
  await fs.mkdir(output,{recursive:true});
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const rawHash=hash(await fs.readFile(raw));
  async function command(binary,args){
    return new Promise((resolve,reject)=>{
      const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';
      child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
      child.on('error',reject);child.on('exit',code=>code===0?resolve(stdout):reject(Error(stderr||`Command failed: ${binary}`)));
    });
  }
  const extracted=[];
  // FFmpeg receives an argument list; no shell interpolation or image editing.
  for(const [name,time] of [['source-plan.png',11.8],['source-progress.png',17.5]]){
    const target=path.join(output,name);
    await command(process.env.MSX_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-ss',String(time),'-i',raw,'-frames:v','1','-y',target]);
    extracted.push({file:`assets/launch/preview-frames/${name}`,raw_capture_sha256:rawHash,at_seconds:time,sha256:hash(await fs.readFile(target)),purpose:name.includes('plan')?'actual processing-plan dialog':'actual processing progress'});
  }
  const mark=await fs.readFile(path.join(project,'assets','brand','mark.svg'),'utf8');
  const frames=[
    {id:'01',range:[0,4],title:'批量压缩工具',subtitle:'图片 · MP4 · PDF',description:'本地处理<br>默认导出保留原件',image:'../../showcase/workbench.zh-CN.png'},
    {id:'02',range:[4,11],title:'选择目录<br>按类型勾选',subtitle:'按媒体类型选择待处理文件',description:'保留文件名、格式与相对目录<br>开始前可调整勾选',image:'../../showcase/workbench.zh-CN.png'},
    {id:'03',range:[11,18],title:'开始前<br>看清如何处理',subtitle:'默认导出 · 保留原件',description:'画质、尺寸、去向、命名与恢复<br>在处理计划中明确说明',image:'source-plan.png'},
    {id:'04',range:[18,25],title:'逐文件处理<br>随时取消剩余',subtitle:'已完成结果保留',description:'查看真实任务进度<br>错误与跳过原因逐项记录',image:'source-progress.png'},
    {id:'05',range:[25,33],title:'检查实际结果',subtitle:'图片前后预览 · 逐文件状态',description:'下载 CSV 报告<br>无收益保留原件，结果如实记录',image:'../../showcase/comparison.zh-CN.png'},
    {id:'06',range:[33,40],title:'免费开源<br>本地处理',subtitle:'计划通过 GitHub Releases',description:'提供便携包与源码<br>本地准备 · 尚未发布',closing:true},
  ];
  const {chromium}=require(process.env.MSX_PLAYWRIGHT||path.join(project,'.mediaslimx','browser-tools','node_modules','playwright'));
  const browser=await chromium.launch({executablePath:process.env.MSX_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const exported=[];
  try{
    for(const frame of frames){
      const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=1920"><title>MediaSlim X 分镜 ${frame.id}</title>
<style>
body{font-size:18px}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#15181D;color:#EDF1F5;font-family:"Segoe UI Variable","Segoe UI","Microsoft YaHei UI","Noto Sans CJK SC",system-ui,sans-serif}.frame{position:relative;width:100%;height:100%;padding:72px 80px}.brand{display:flex;align-items:center;gap:18px;font-size:32px;font-weight:600;letter-spacing:-.7px}.brand svg{width:52px;height:52px}.brand em{font-style:normal;color:#B4EDC6}.chapter{position:absolute;right:80px;top:89px;font-size:18px;color:#A0AAB7;font-variant-numeric:tabular-nums;letter-spacing:1px}.intro{position:absolute;left:80px;top:${frame.closing?'307':'325'}px;width:${frame.closing?'1120':'500'}px}h1{margin:0 0 31px;font-size:${frame.closing?'88':'64'}px;font-weight:600;line-height:1.3;letter-spacing:-1.8px;text-wrap:balance}.subtitle{font-size:${frame.closing?'31':'26'}px;line-height:1.6;color:#B4EDC6;margin:0 0 29px;white-space:nowrap}.description{font-size:24px;line-height:1.75;color:#A0AAB7;margin:0;white-space:nowrap}.screen{position:absolute;right:80px;top:175px;width:1190px;margin:0}.screen img{display:block;width:100%;height:auto;border:1px solid #333C47;border-radius:12px}.signature{position:absolute;right:150px;top:345px;width:300px;height:300px}.signature svg{width:100%;height:100%}.footer{position:absolute;left:80px;right:80px;bottom:47px;padding-top:22px;border-top:1px solid #333C47;display:flex;justify-content:space-between;font-size:18px;color:#A0AAB7;line-height:1.6}.footer .identity{color:#EDF1F5}
</style><main class="frame"><div class="brand">${mark}<span>MediaSlim <em>X</em></span></div><div class="chapter">${frame.id} / 06 · ${String(frame.range[0]).padStart(2,'0')}–${String(frame.range[1]).padStart(2,'0')}s</div><section class="intro"><h1>${frame.title}</h1><p class="subtitle">${frame.subtitle}</p><p class="description">${frame.description}</p></section>${frame.closing?`<div class="signature">${mark}</div>`:`<figure class="screen"><img src="${frame.image}" alt="合成演示素材的 WSL 实际界面"></figure>`}<footer class="footer"><span>合成演示素材 · WSL 实际界面 · 分镜草稿</span><span class="identity">${frame.closing?'本地准备 · 尚未发布':'MediaSlim X'}</span></footer></main></html>`;
      const name=`frame-${frame.id}`;
      const source=path.join(output,`${name}.html`),target=path.join(output,`${name}.png`);
      await fs.writeFile(source,html);
      const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
      const external=[];page.on('request',request=>{if(!/^(file:|data:)/.test(request.url()))external.push(request.url());});
      await page.goto(pathToFileURL(source).href);
      if(!frame.closing)await page.locator('.screen img').evaluate(image=>image.decode());
      await page.evaluate(()=>document.fonts.ready);
      const layout=await page.evaluate(()=>{
        const box=selector=>{const element=document.querySelector(selector);if(!element)return null;const{x,y,width,height,right,bottom}=element.getBoundingClientRect();return{x,y,width,height,right,bottom};};
        return{intro:box('.intro'),screen:box('.screen'),footer:box('.footer'),minimum_font_px:Math.min(...[...document.querySelectorAll('body *')].filter(element=>element.textContent.trim()).map(element=>parseFloat(getComputedStyle(element).fontSize)))};
      });
      if(external.length||layout.minimum_font_px<18||layout.intro.bottom>layout.footer.y-30||(layout.screen&&(layout.intro.right>layout.screen.x-20||layout.screen.bottom>layout.footer.y-20)))throw Error(`Preview layout failed: ${frame.id} ${JSON.stringify(layout)}`);
      await page.screenshot({path:target});
      const imagePath=frame.image?path.resolve(output,frame.image):null;
      exported.push({id:frame.id,timeline_seconds:frame.range,file:`assets/launch/preview-frames/${name}.png`,source:`assets/launch/preview-frames/${name}.html`,width:1920,height:1080,title:frame.title.replace(/<br>/g,' '),image_source:imagePath?path.relative(project,imagePath).split(path.sep).join('/'):null,image_sha256:imagePath?hash(await fs.readFile(imagePath)):null,sha256:hash(await fs.readFile(target)),screenshot_content_edited:false,minimum_text_px:layout.minimum_font_px,external_requests:external.length});
      await page.close();
    }
  }finally{await browser.close();}
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({kind:'MediaSlim X six-frame video approval preview',status:'static storyboard draft; not a rendered video; not approved for publication',language:'zh-CN',duration_seconds:40,renderer:'scripts/render-video-preview.cjs',design:'DESIGN.md',synthetic_media:true,capture_platform:'WSL Linux / Chrome',actual_interface:'Local Python service and browser workbench; no native desktop wrapper',raw_source:{private_capture:true,sha256:rawHash},extracted_frames:extracted,frames:exported},null,2)+'\n');
  console.log(JSON.stringify({static_frames:exported.map(frame=>frame.file),video_rendered:false,extracted:extracted.map(frame=>({file:frame.file,at_seconds:frame.at_seconds}))}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
