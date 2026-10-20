/* Development-only SVG exports. The shipped application does not require Node. */
const path = require('path');
const playwright = require(process.env.MSX_PLAYWRIGHT || 'playwright');

(async () => {
  const executablePath = process.env.MSX_CHROME || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');
  const root = path.resolve(__dirname, '..');
  const browser = await playwright.chromium.launch({executablePath, headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    const assets = path.join(root, 'assets', 'brand');
    for (const language of ['', '.en']) {
      await page.goto(require('url').pathToFileURL(path.join(assets, 'social-cover' + language + '.svg')).href);
      await page.screenshot({path:path.join(assets,'social-cover' + language + '.png')});
    }
    await page.setViewportSize({width:256,height:256});
    // Explicit viewport dimensions avoid the browser's default 300×150 SVG size.
    await page.goto(require('url').pathToFileURL(path.join(assets, 'favicon.svg')).href);
    await page.evaluate(() => {
      document.documentElement.setAttribute('width','256');
      document.documentElement.setAttribute('height','256');
    });
    await page.screenshot({path:path.join(assets,'app-icon.png'),omitBackground:true});
    await page.setViewportSize({width:36,height:36});
    await page.goto(require('url').pathToFileURL(path.join(assets, 'github-mark.svg')).href);
    await page.screenshot({path:path.join(assets,'github-mark.png'),omitBackground:true});
    console.log('Exported Chinese/English social covers (1200×630), app-icon.png (256×256), and github-mark.png (36×36).');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
