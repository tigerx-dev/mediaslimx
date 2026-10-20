/* Development-only launch artwork. Uses actual, unmodified showcase screenshots.
 * Product runtime has no Node/Playwright dependency. Nothing is uploaded.
 * Run from WSL/Linux with its own Node, Chrome and Playwright runtime:
 * MSX_PLAYWRIGHT=/absolute/path/to/playwright node scripts/render-launch-assets.cjs
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');

(async () => {
  const project = path.resolve(__dirname, '..');
  const destination = path.join(project, 'assets', 'launch');
  const showcase = path.join(project, 'assets', 'showcase');
  const evidence = JSON.parse(await fs.readFile(path.join(showcase, 'manifest.json'), 'utf8'));
  if (evidence.synthetic !== true) throw Error('Review non-synthetic showcase media before using this recipe.');
  if (evidence.viewport?.width !== 1600 || evidence.viewport?.height !== 1000) {
    throw Error('Showcase composition expects complete 1600×1000 screenshots.');
  }
  const {chromium} = require(process.env.MSX_PLAYWRIGHT || path.join(project, '.mediaslimx', 'browser-tools', 'node_modules', 'playwright'));
  const executablePath = process.env.MSX_CHROME || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');
  const mark = (await fs.readFile(path.join(project, 'assets', 'brand', 'mark.svg'), 'utf8'))
    .replace('role="img" aria-label="MediaSlim X"', 'aria-hidden="true"');
  await fs.mkdir(destination, {recursive:true});
  const languages = {
    'zh-CN': {
      headline: '批量压缩工具',
      formats: '图片 · MP4 · PDF',
      detail: '本地处理<br>默认导出保留原件',
      workbench: '本地媒体工作台',
      disclosure: '合成演示素材 · 实际运行界面',
      alt: 'MediaSlim X 中文媒体工作台，显示合成演示素材的真实已完成任务',
      footer: '免费开源 / 本地处理',
    },
    en: {
      headline: 'Batch<br>compressor',
      formats: 'Images · MP4 · PDF',
      detail: 'Processed locally<br>Export by default. Keep originals.',
      workbench: 'LOCAL MEDIA WORKBENCH',
      disclosure: 'Synthetic demo media · Actual interface',
      alt: 'MediaSlim X English media workbench showing a real completed task using synthetic demo media',
      footer: 'FREE & OPEN SOURCE / LOCAL PROCESSING',
    },
  };
  const artifacts = [];
  const browser = await chromium.launch({executablePath, headless:true, args:['--no-sandbox']});
  try {
    for (const [language, copy] of Object.entries(languages)) {
      const screenshot = `results.${language}.png`;
      const sourceBytes = await fs.readFile(path.join(showcase, screenshot));
      const screenshotHash = crypto.createHash('sha256').update(sourceBytes).digest('hex');
      for (const shape of ['social', 'hero']) {
        const large = shape === 'hero', width = large ? 1920 : 1200, height = large ? 1080 : 630;
        const basename = `${shape}.${language}`;
        const html = `<!doctype html>
<html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=${width}">
<title>MediaSlim X — ${copy.headline.replace('<br>', ' ')}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#15181D;color:#EDF1F5;font-family:"Segoe UI Variable","Segoe UI","Microsoft YaHei UI","Noto Sans CJK SC",system-ui,sans-serif}
.cover{width:100%;height:100%;position:relative;padding:${large ? '72px 80px' : '44px 48px'}}
.brand{display:flex;align-items:center;gap:${large ? 4 : 3}px;font-weight:600;font-size:${large ? 32 : 22}px;letter-spacing:-.7px}
.brand svg{width:${large ? 35 : 25}px;height:${large ? 35 : 25}px;flex-shrink:0}
.descriptor{position:absolute;right:${large ? 80 : 48}px;top:${large ? 91 : 57}px;color:#A0AAB7;font-size:${large ? 18 : 13}px;letter-spacing:${language === 'en' ? '1.2px' : '.8px'}}
.intro{position:absolute;left:${large ? 80 : 48}px;top:${large ? 327 : 218}px;width:${large ? 500 : 385}px}
h1{font-size:${large ? 76 : 52}px;line-height:${language === 'en' ? 1.08 : 1.3};font-weight:600;letter-spacing:${language === 'en' ? '-2.4px' : '-1.8px'};margin:0 0 ${large ? 28 : 24}px;text-wrap:balance;white-space:${language === 'zh-CN' ? 'nowrap' : 'normal'}}
.formats{font-size:${large ? 26 : 18}px;line-height:1.6;color:#B4EDC6;white-space:nowrap;margin:0 0 ${large ? 28 : 21}px}
.detail{font-size:${large ? 22 : 16}px;color:#A0AAB7;line-height:1.75;margin:0;white-space:nowrap}
.screen{position:absolute;right:${large ? 80 : 48}px;top:${large ? 175 : 94}px;width:${large ? 1190 : 685}px;margin:0}
.screen img{display:block;width:100%;height:auto;border:1px solid #333C47;border-radius:12px}
.screen figcaption{color:#A0AAB7;font-size:${large ? 16 : 12}px;line-height:1.75;text-align:right;margin-top:${large ? 16 : 11}px}
.footer{position:absolute;left:${large ? 80 : 48}px;right:${large ? 80 : 48}px;bottom:${large ? 47 : 28}px;border-top:1px solid #333C47;padding-top:${large ? 22 : 15}px;display:flex;justify-content:space-between;color:#A0AAB7;font-size:${large ? 16 : 12}px;letter-spacing:${language === 'en' ? '.4px' : '0'}}
.footer .identity{color:#EDF1F5}
</style>
<main class="cover">
  <div class="brand" aria-label="MediaSlim X"><span>MediaSlim</span>${mark}</div>
  <div class="descriptor">${copy.workbench}</div>
  <section class="intro"><h1>${copy.headline}</h1><p class="formats">${copy.formats}</p><p class="detail">${copy.detail}</p></section>
  <figure class="screen"><img src="../showcase/${screenshot}" alt="${copy.alt}"><figcaption>${copy.disclosure}</figcaption></figure>
  <footer class="footer"><span>${copy.footer}</span><span class="identity">MediaSlim X</span></footer>
</main></html>`;
        const htmlPath = path.join(destination, `${basename}.html`);
        const pngPath = path.join(destination, `${basename}.png`);
        await fs.writeFile(htmlPath, html);
        const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
        const external = [];
        page.on('request', request => {if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) external.push(request.url());});
        await page.goto(pathToFileURL(htmlPath).href);
        await page.locator('.screen img').evaluate(image => image.decode());
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const rect = selector => {const {x,y,width,height,left,right,top,bottom}=document.querySelector(selector).getBoundingClientRect();return {x,y,width,height,left,right,top,bottom};};
          return {intro:rect('.intro'),screen:rect('.screen'),footer:rect('.footer'),headline:rect('h1'),minFont:Math.min(...[...document.querySelectorAll('body *')].filter(element=>element.textContent.trim()).map(element=>parseFloat(getComputedStyle(element).fontSize)))};
        });
        if (external.length || layout.intro.right > layout.screen.left - 10 || layout.screen.bottom > layout.footer.top - 12 || layout.minFont < 12) {
          throw Error(`Artwork overflow/request/font check failed: ${basename} ${JSON.stringify(layout)}`);
        }
        await page.screenshot({path:pngPath});
        artifacts.push({file:`assets/launch/${basename}.png`,source:`assets/launch/${basename}.html`,language,width,height,screenshot:`assets/showcase/${screenshot}`,screenshot_sha256:screenshotHash,sha256:crypto.createHash('sha256').update(await fs.readFile(pngPath)).digest('hex'),synthetic_media_disclosed:true,external_requests:external.length,layout_checks:{text_image_separation:true,footer_clearance:true,min_text_px:layout.minFont}});
        await page.close();
      }
    }
  } finally {await browser.close();}
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({kind:'MediaSlim X local launch artwork',status:'local preparation; not published',actual_interface:'Local Python service in a browser workbench; no native desktop shell shown or claimed.',source_screenshots:'assets/showcase/manifest.json',renderer:'scripts/render-launch-assets.cjs',brand_source:'assets/brand/mark.svg',synthetic_media:true,screenshot_content_edited:false,screenshot_placement:'Full source screenshot scaled proportionally; no crop or replacement of interface content.',artifacts},null,2)+'\n');
  console.log(JSON.stringify({exported:artifacts.map(item=>item.file),external_requests:0}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
