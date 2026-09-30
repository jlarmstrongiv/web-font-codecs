import { chromium, firefox, webkit } from 'playwright';
import type { Browser } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { detectFormat } from 'web-font-codecs-core';
import { createWoff1Codec } from 'woff1-codec';
import { createWoff2Codec } from 'woff2-codec';
const base = process.env.ASTRO_BASE_PATH ?? '/';
assert.match(base, /^\/(?:[A-Za-z0-9_.-]+\/)*$/);
const root = resolve('packages/web-font-converter-web/dist');
const mime: Record<string,string> = {'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.css':'text/css'};
const server = createServer(async (request,response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
    if(pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
    const relative = pathname.slice(base.length);
    const file = resolve(root, relative || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const body=await readFile(file);
    response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const address = server.address(); if (!address || typeof address==='string') throw new Error('No listening port');
const serverOrigin=`http://127.0.0.1:${address.port}`;
const origin=serverOrigin+base.replace(/\/$/, '');
let browser: Browser | undefined;
const directory = await mkdtemp(join(tmpdir(),'web-font-browser-'));
try {
  for (const [engineName, engine] of Object.entries({chromium,firefox,webkit})) {
  browser = await engine.launch({headless:true});
  const page=await browser.newPage();
  const errors: string[]=[],requests: {method:string;url:string}[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>requests.push({method:request.method(),url:request.url()}));
  const html = await (await page.request.get(origin+'/')).text();
  assert.match(html,/web-font-codecs/);assert.match(html,/data-css-hash/); // Styled SSR before hydration.
  await page.goto(origin+'/');
  await page.locator('astro-island:not([ssr])').waitFor();
  const disclosure=page.locator('.advanced-options-collapse');
  assert.equal(await disclosure.getAttribute('class').then(value=>value?.includes('ant-collapse-ghost')),true);
  assert.equal(await disclosure.locator('.ant-collapse-header').getAttribute('aria-expanded'),'false');
  assert.equal(await disclosure.evaluate(element=>getComputedStyle(element).borderTopWidth),'0px');
  await page.getByText('Compression options',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).fill('4');
  await page.getByRole('switch',{name:'Optimize glyph storage'}).uncheck();
  using one=await createWoff1Codec(),two=await createWoff2Codec();
  const labels={sfnt:'TTF / OTF',woff1:'WOFF',woff2:'WOFF2'} as const;
  const mimes={ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'} as const;
  let conversions=0;
  for (const fixture of ['Rochester.otf','OpenSans-Regular.ttf','corpus/variable-truetype.ttf','corpus/variable-cff2.otf','corpus/cjk.otf','corpus/color-colrv1.ttf']) {
    const sfnt=await readFile(resolve('test/fixtures',fixture));
    const originalFlavor=sfnt.readUInt32BE(0);
    const stem=fixture.split('/').at(-1)!.replace(/\.[^.]+$/,'');
    const inputs={sfnt,woff1:one.encode(sfnt).data,woff2:two.encode(sfnt,{quality:4}).data};
    for (const from of ['sfnt','woff1','woff2'] as const) for (const to of ['sfnt','woff1','woff2'] as const) {
      const inputExtension=from==='sfnt'?fixture.split('.').pop()!:from==='woff1'?'woff':'woff2';
      const extension=to==='sfnt'?(originalFlavor===0x4f54544f?'otf':'ttf'):to==='woff1'?'woff':'woff2';
      const name=stem+'.'+extension;
      await page.getByLabel('Font file',{exact:true}).setInputFiles({name:stem+'.'+inputExtension,mimeType:'application/octet-stream',buffer:Buffer.from(inputs[from])});
      await page.getByRole('radio',{name:labels[to],exact:true}).locator('xpath=ancestor::label').click();
      const link=page.getByRole('link',{name:'Download '+name,exact:true});
      await link.waitFor();
      const href=await link.getAttribute('href');assert.ok(href);
      const blobType=await page.evaluate(async url=>(await fetch(url)).headers.get('content-type'),href);
      assert.equal(blobType,mimes[extension]);
      const waiting=page.waitForEvent('download');await link.click();const download=await waiting;
      assert.equal(download.suggestedFilename(),name);
      const file=join(directory,`${conversions}-${name}`);await download.saveAs(file);
      const bytes=await readFile(file);assert.equal(detectFormat(bytes),to);
      assert.equal(bytes.readUInt32BE(to==='sfnt'?0:4),originalFlavor,'Outline flavor must remain unchanged');
      conversions++;
    }
  }
  // Every engine initializes our WOFF1 WASM and exercises both encoders in its worker.
  await page.getByRole('radio',{name:'WOFF',exact:true}).locator('xpath=ancestor::label').click();
  const zopfli=page.getByRole('radio',{name:'Zopfli · smaller',exact:true});
  if(!await zopfli.isVisible()) await page.getByText('Compression options',{exact:true}).click();
  await zopfli.locator('xpath=ancestor::label').click();
  await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).fill('1');
  for(const fixture of ['Rochester.otf','OpenSans-Regular.ttf','corpus/variable-truetype.ttf','corpus/variable-cff2.otf','corpus/cjk.otf','corpus/color-colrv1.ttf']) {
    await page.getByLabel('Font file',{exact:true}).setInputFiles(resolve('test/fixtures',fixture));
    const name=fixture.split('/').at(-1)!.replace(/\.[^.]+$/,'.woff');
    const link=page.getByRole('link',{name:'Download '+name,exact:true});
    await link.waitFor({timeout:60000});
    const bytes=await page.evaluate(async url=>Array.from(new Uint8Array(await(await fetch(url!)).arrayBuffer())),await link.getAttribute('href'));
    const decoded=one.decode(Uint8Array.from(bytes)).data;
    assert.deepEqual(decoded,one.decode(one.encode(await readFile(resolve('test/fixtures',fixture))).data).data);
  }
  await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).fill('100');
  await page.getByRole('button',{name:'Cancel conversion',exact:true}).click();
  await page.getByText('Conversion cancelled',{exact:true}).waitFor();
  await page.getByRole('radio',{name:'zlib · faster',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download color-colrv1.woff',exact:true}).waitFor();
  assert.equal(await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).count(),0);
  await page.getByLabel('Font file',{exact:true}).setInputFiles({name:'bad.woff',mimeType:'font/woff',buffer:Buffer.from('bad font')});
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('button',{name:'Convert font',exact:true}).count(),0);
  // A valid header with broken table contents exercises errors returned from the worker.
  const damaged=Buffer.from(await readFile(resolve('test/fixtures/Rochester.otf')));damaged.writeUInt32BE(0xffffffff,20);
  await page.getByLabel('Font file',{exact:true}).setInputFiles({name:'damaged.otf',mimeType:'font/otf',buffer:damaged});
  await page.getByRole('radio',{name:'WOFF',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('alert').waitFor();
  await page.getByText('The font may be damaged or contain unsupported data.',{exact:false}).waitFor();
  await page.getByLabel('Font file',{exact:true}).setInputFiles(resolve('test/fixtures/Rochester.otf'));
  await page.getByRole('radio',{name:'WOFF2',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download Rochester.woff2',exact:true}).waitFor();
  // Bundled samples require no file upload and use the same automatic path.
  assert.equal(await page.locator('.converter-panel').count(),1);
  assert.equal(await page.getByRole('region',{name:'Converter features'}).locator('.ant-card').count(),6);
  const samples=[
    {label:'Rochester · OTF',file:'Rochester.otf',format:'sfnt',tag:'OTF',output:'Rochester.woff2'},
    {label:'Open Sans · TTF',file:'OpenSans-Regular.ttf',format:'sfnt',tag:'TTF',output:'OpenSans-Regular.woff2'},
    {label:'Open Sans · WOFF',file:'OpenSans-Regular.woff',format:'woff1',tag:'WOFF',output:'OpenSans-Regular.woff2'},
    {label:'Open Sans · WOFF2',file:'OpenSans-Regular.woff2',format:'woff2',tag:'WOFF2',output:'OpenSans-Regular.woff2'},
  ];
  assert.equal(await page.locator('.converter-panel button[aria-pressed]').count(),4);
  for(const sample of samples) {
    const bytes=await(await page.request.get(origin+'/samples/'+sample.file)).body();
    assert.equal(detectFormat(bytes),sample.format);
    await page.getByRole('button',{name:'Try '+sample.label,exact:true}).click();
    await page.getByRole('link',{name:'Download '+sample.output,exact:true}).waitFor();
    await page.locator('.ant-upload-drag').getByText(sample.tag,{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Try Rochester · OTF',exact:true}).click();
  await page.getByRole('link',{name:'Download Rochester.woff2',exact:true}).waitFor();
  const credits=await (await page.request.get(origin+'/samples/NOTICE.txt')).text();assert.match(credits,/Apache License 2.0/);
  // A setting change replaces the result without any conversion button.
  await page.getByText('Compression options',{exact:true}).click();
  const oldHref=await page.getByRole('link',{name:'Download Rochester.woff2',exact:true}).getAttribute('href');
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).fill('5');
  await page.waitForFunction(old=>document.querySelector<HTMLAnchorElement>('a[download="Rochester.woff2"]')?.href!==old&&!!document.querySelector('a[download="Rochester.woff2"]'),oldHref);
  // Cancel scheduled/running work and ensure no late result appears.
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).fill('11');
  await page.getByRole('button',{name:'Try Open Sans · TTF',exact:true}).click();
  await page.getByRole('button',{name:'Cancel conversion',exact:true}).click();
  await page.getByText('Conversion cancelled',{exact:true}).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('a[download]').count(),0);
  await page.getByRole('button',{name:'Retry conversion',exact:true}).click();
  await page.getByRole('link',{name:'Download OpenSans-Regular.woff2',exact:true}).waitFor();
  // Replacing a font while its conversion is queued/in flight cannot resurrect old output.
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).fill('10');
  await page.getByRole('button',{name:'Try Rochester · OTF',exact:true}).click();
  await page.getByRole('radio',{name:'WOFF',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download Rochester.woff',exact:true}).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('a[download]').count(),1);
  assert.equal(await page.locator('a[download]').getAttribute('download'),'Rochester.woff');
  // Change output while a delayed sample is still loading; keep that sample alive.
  await page.route('**/samples/OpenSans-Regular.ttf',async route=>{ await new Promise(r=>setTimeout(r,200));await route.continue(); });
  await page.getByRole('button',{name:'Try Open Sans · TTF',exact:true}).click();
  await page.getByRole('radio',{name:'TTF / OTF',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download OpenSans-Regular.ttf',exact:true}).waitFor();
  await page.unroute('**/samples/OpenSans-Regular.ttf');
  await page.getByRole('button',{name:'Try Rochester · OTF',exact:true}).click();
  await page.getByRole('radio',{name:'WOFF2',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download Rochester.woff2',exact:true}).waitFor();
  await mkdir('.cache',{recursive:true});
  await page.screenshot({path:`.cache/${engineName}-demo-desktop.png`,fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`.cache/${engineName}-demo-mobile.png`,fullPage:true,animations:'disabled'});
  const mobileHeader=page.locator('.advanced-options-collapse .ant-collapse-header');
  await mobileHeader.focus();await mobileHeader.press('Enter');
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).waitFor({state:'visible'});
  assert.equal(await mobileHeader.getAttribute('aria-expanded'),'true');
  await page.screenshot({path:`.cache/${engineName}-demo-mobile-options.png`,fullPage:true,animations:'disabled'});
  await mobileHeader.press('Enter');
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).waitFor({state:'hidden'});
  assert.equal(await mobileHeader.getAttribute('aria-expanded'),'false');
  await page.setViewportSize({width:1280,height:960});
  await mobileHeader.press('Enter');
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).waitFor({state:'visible'});
  await page.screenshot({path:`.cache/${engineName}-demo-desktop-options.png`,fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});

  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow on mobile');
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(r=>r.method==='GET'&&(r.url.startsWith(origin)||r.url.startsWith('blob:'))),JSON.stringify(requests));
  console.log(`${engineName} demo: ${conversions} container conversions across TTF/CFF, exact filenames/MIME, unchanged outline flavor, automatic uploads/four samples/settings, worker errors, cancellation/retry, stale-work rejection, ghost disclosure/keyboard interaction, single-panel/mobile layout, SSR styles and no uploads passed.`);
  await browser.close(); browser=undefined;
  }
} finally { await browser?.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(directory,{recursive:true,force:true}); }
