/* Reproducible public screenshots + private raw viewport recording.
 * Development only: uses existing Python runtime, FFmpeg, Chrome and Playwright.
 * Never talks to the user's service; generates a new /tmp demo and free port.
 * Usage: node scripts/capture-showcase.cjs [--output /absolute/new-directory]
 * MSX_PYTHON / MSX_PLAYWRIGHT / MSX_CHROME may select development dependencies.
 * Recording helper: PLAYWRIGHT_BROWSERS_PATH=.mediaslimx/browser-tools/browsers
 * node .mediaslimx/browser-tools/node_modules/playwright/cli.js install ffmpeg
 * Original media remains in /tmp; capture evidence/recording remains ignored.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

(async () => {
  assert.equal(process.platform, 'linux', 'This capture recipe uses a separate WSL/Linux environment.');
  const project = path.resolve(__dirname, '..');
  const outputFlag = process.argv.indexOf('--output');
  const publicOutput = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : path.join(project, 'assets', 'showcase');
  assert.ok(!process.argv.slice(2).some((argument, index, args) => argument !== '--output' && args[index - 1] !== '--output'), 'Only --output is supported.');
  // Every run gets new service state and media; no cleanup touches user files.
  const id = crypto.randomUUID();
  const run = path.join(project, '.mediaslimx', 'showcase', id);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'MediaSlimX-Demo-'));
  const source = path.join(temporary, 'website-demo');
  const data = path.join(temporary, 'service-data');
  const python = process.env.MSX_PYTHON || path.join(project, '.venv', 'bin', 'python');
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(project, '.mediaslimx', 'browser-tools', 'browsers');
  const {chromium} = require(process.env.MSX_PLAYWRIGHT || path.join(project, '.mediaslimx', 'browser-tools', 'node_modules', 'playwright'));
  await fs.mkdir(run, {recursive:true});
  await fs.mkdir(publicOutput, {recursive:true});
  // Avoid accidentally replacing previously reviewed public assets.
  for (const name of ['workbench.zh-CN.png','workbench.en.png','results.zh-CN.png','results.en.png','comparison.zh-CN.png','manifest.json','results.csv']) {
    assert.equal(await fs.stat(path.join(publicOutput, name)).then(() => true, () => false), false, 'Output already exists: ' + name);
  }
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function execute(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {cwd:project, env:{...global.process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}, stdio:['ignore','pipe','pipe']});
      let stdout = '', stderr = '';
      process.stdout.on('data', part => stdout += part); process.stderr.on('data', part => stderr += part);
      process.on('error', reject); process.on('exit', code => code === 0 ? resolve(stdout) : reject(Error(stderr || 'Fixture command failed')));
    });
  }
  const fixtures = JSON.parse(await execute(python, ['-X','utf8',path.join(project,'scripts','showcase-fixtures.py'),'--dest',source]));
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0,'127.0.0.1',resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  assert.ok(![8765,8766].includes(port));
  const child = spawn(python, ['-m','mediaslimx','--port',String(port),'--data-dir',data,'--allow-root',source,'--no-browser'], {cwd:project,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['ignore','pipe','pipe']});
  let stdout = '', stderr = '', browser, context, page, token, url, video, task;
  child.stdout.on('data', part => stdout += part); child.stderr.on('data', part => stderr += part);
  const base = 'http://127.0.0.1:' + port, errors = [], requests = [], timeline = [], started = Date.now();
  const mark = name => timeline.push({at_seconds:Number(((Date.now()-started)/1000).toFixed(2)),event:name});
  async function api(route) {
    const response = await fetch(base + route, {headers:{'X-MediaSlimX-Token':token}});
    assert.ok(response.ok, route + ' failed'); return response;
  }
  async function capture(name) {
    await page.screenshot({path:path.join(publicOutput,name),fullPage:false});
  }
  async function point(selector) {
    const control = page.locator(selector); await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox(); assert.ok(box,selector+' must be visible');
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:14}); await delay(260);
  }
  try {
    for (let index=0;index<200;index++) {
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#token=([A-Za-z0-9_-]+)/);
      if (match) {token=match[1];url=match[0];try {if ((await api('/api/environment')).ok) break;} catch {}}
      if (child.exitCode!==null) throw Error('Private service stopped: '+stderr);
      await delay(100);
    }
    assert.ok(url,'Private service must start');
    browser = await chromium.launch({executablePath:process.env.MSX_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    context = await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,acceptDownloads:true,recordVideo:{dir:path.join(run,'raw'),size:{width:1600,height:1000}}});
    page = await context.newPage(); video = page.video();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(url); await page.locator('#connection[data-connected=true]').waitFor();
    await delay(1000); mark('real_empty_state');
    await page.locator('#media-path').fill(source); await point('#scan-button'); await delay(550);
    await page.click('#scan-button'); await page.locator('#scan-section').waitFor();
    assert.equal(await page.locator('#scan-body tr').count(),fixtures.files.length);
    await page.locator('#output-path').fill(path.join(temporary,'exports'));
    await page.locator('#output-path').blur();
    // Filling the lower output field naturally scrolls the parameter region.
    // Restore its top using the real scroll container for the overview image.
    await page.locator('.settings-scroll').evaluate(node=>node.scrollTo({top:0,behavior:'instant'}));
    await page.mouse.move(930,320); await delay(1500);
    mark('scan_complete'); await capture('workbench.zh-CN.png');
    // Actual bilingual UI; never rewrite labels or inject pretend states.
    await point('#language-toggle'); await page.click('#language-toggle'); await delay(750);
    await capture('workbench.en.png'); await page.click('#language-toggle'); await delay(550);
    // Type picker is a genuine selection operation, then restore all media.
    await page.click('#selection-type-trigger'); await page.locator('#selection-type-options [role=option]').filter({hasText:'仅 JPG'}).click();
    assert.equal(await page.evaluate(()=>state.selected.size),2); mark('only_jpg_selected'); await delay(900);
    await point('#select-all'); await page.click('#select-all'); await delay(800);
    assert.equal(await page.evaluate(()=>state.selected.size),fixtures.files.length);
    await point('#review-task-plan'); await page.click('#review-task-plan'); await page.locator('#task-plan-dialog[open]').waitFor();
    mark('processing_plan_opened'); await delay(3200);
    await point('#close-task-plan'); await page.click('#close-task-plan'); await delay(500);
    assert.equal(await page.locator('#mode').inputValue(),'export','Demo must preserve original media');
    assert.equal(await page.locator('#resize-keep').isChecked(),true,'Demo uses actual default original dimensions');
    await point('#start-button'); await delay(450); mark('actual_processing_started'); await page.click('#start-button');
    await page.waitForFunction(()=>state.task&&state.task.status==='completed',null,{timeout:180000});
    task=await (await api('/api/tasks/'+await page.evaluate(()=>state.task.id))).json(); mark('actual_processing_completed');
    assert.equal(task.entries.length,fixtures.files.length);
    assert.ok(task.entries.every(entry=>['success','no_gain'].includes(entry.status)),JSON.stringify(task.entries.map(entry=>({relative:entry.relative,status:entry.status,reason:entry.reason}))));
    await page.locator('#history [data-task-id="'+task.id+'"][data-active=true]').waitFor();
    assert.equal(await page.locator('#workspace-title-name').textContent(),'website-demo');
    assert.equal(await page.locator('#workspace-title-status').textContent(),'已完成');
    await delay(1200); await page.mouse.move(1300,350); await capture('results.zh-CN.png');
    await page.click('#language-toggle'); await delay(450);
    assert.equal(await page.locator('#workspace-title-name').textContent(),'website-demo');
    assert.equal(await page.locator('#workspace-title-status').textContent(),'Completed');
    await capture('results.en.png'); await page.click('#language-toggle'); await delay(550);
    await delay(1800);
    const picture=task.entries.find(entry=>entry.relative==='website/hero.jpg');
    const row=page.locator('#result-body tr').filter({hasText:'website/hero.jpg'});
    await row.locator('button').first().click(); await page.locator('#detail-dialog[open]').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('#preview-grid img').length===2&&[...document.querySelectorAll('#preview-grid img')].every(image=>image.complete&&image.naturalWidth>0));
    mark('actual_image_comparison'); await delay(1000); await capture('comparison.zh-CN.png'); await delay(3500);
    await point('#close-detail'); await page.click('#close-detail'); await delay(400);
    const downloadPromise=page.waitForEvent('download'); await point('#export-report'); await page.click('#export-report');
    const report=await downloadPromise; await report.saveAs(path.join(publicOutput,'results.csv')); mark('actual_csv_downloaded');
    const csv=await fs.readFile(path.join(publicOutput,'results.csv'),'utf8');
    assert.ok(csv.includes('website/hero.jpg')); assert.ok(!csv.includes(source),'CSV should use relative paths');
    const measured=[];
    for (const fixture of fixtures.files) {
      const original=await fs.readFile(path.join(source,fixture.relative));
      assert.equal(hash(original),fixture.sha256,'Export must preserve every original');
      const entry=task.entries.find(entry=>entry.relative===fixture.relative);
      const result=await fs.readFile(entry.destination);
      assert.equal(result.length,entry.result_size); assert.equal(hash(result),entry.result_fp.sha256);
      measured.push({relative:fixture.relative,format:entry.info.format||'PDF',status:entry.status,original_bytes:original.length,result_bytes:result.length,saved_bytes:original.length-result.length,original_sha256:fixture.sha256,result_sha256:hash(result),original_info:entry.info,result_info:entry.result_info,actual_parameters:entry.actual_params});
    }
    const remaining=Math.max(0,40000-(Date.now()-started));await delay(Math.min(remaining,6000));
    assert.deepEqual(errors,[]); assert.ok(requests.every(request=>request.startsWith(base+'/')),'All browser requests must stay on the isolated service');
    await context.close(); context=null;
    const rawPath=await video.path(); const recording=path.join(run,'raw-demo.webm'); await fs.rename(rawPath,recording);
    const publicManifest={synthetic:true,description:{'zh-CN':'全部为自行生成的合成演示素材；截图来自真实扫描和导出任务，不代表真实网站收益。','en':'All media is self-generated synthetic demo material. Screenshots show a real scan and export task, not real website savings.'},platform:'WSL Linux; Chrome headless viewport capture',viewport:{width:1600,height:1000},mode:'export',preset:task.params.preset,resize:'original dimensions',originals_unchanged:true,third_party_browser_requests:0,page_errors:errors,original_bytes:measured.reduce((sum,entry)=>sum+entry.original_bytes,0),result_bytes:measured.reduce((sum,entry)=>sum+entry.result_bytes,0),files:measured,capture_script:'scripts/capture-showcase.cjs',fixture_script:'scripts/showcase-fixtures.py'};
    publicManifest.saved_bytes=publicManifest.original_bytes-publicManifest.result_bytes;
    publicManifest.saved_percent=Number((publicManifest.saved_bytes/publicManifest.original_bytes*100).toFixed(2));
    await fs.writeFile(path.join(publicOutput,'manifest.json'),JSON.stringify(publicManifest,null,2)+'\n');
    await fs.writeFile(path.join(run,'evidence.json'),JSON.stringify({public_manifest:path.join(publicOutput,'manifest.json'),synthetic_root:temporary,raw_recording:recording,timeline,actual_task:task,source_fixture_manifest:fixtures},null,2)+'\n');
    console.log(JSON.stringify({public_assets:publicOutput,evidence:run,recording,original_bytes:publicManifest.original_bytes,result_bytes:publicManifest.result_bytes,saved_bytes:publicManifest.saved_bytes,synthetic:true,service_stopped_after_capture:true},null,2));
  } finally {
    if(context)await context.close(); if(browser)await browser.close();
    if(child.exitCode===null&&child.signalCode===null){
      const closed=new Promise(resolve=>child.once('close',resolve));
      child.kill('SIGTERM');await Promise.race([closed,delay(5000)]);
      if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await closed;}
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
