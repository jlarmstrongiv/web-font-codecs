/** Regression for the actual running Astro server, including a concurrent build. */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { run } from './process.ts';
import assert from 'node:assert/strict';
const origin = process.env.DEMO_URL ?? 'http://127.0.0.1:4324';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  async function ready() {
    await page.goto(origin);
    await page.locator('astro-island:not([ssr])').waitFor();
    assert.equal(await page.locator('.converter-panel').count(),1);
  }
  async function samples() {
    for (const [label, name] of [
      ['Rochester · OTF','Rochester'], ['Open Sans · TTF','OpenSans-Regular'],
      ['Open Sans · WOFF','OpenSans-Regular'], ['Open Sans · WOFF2','OpenSans-Regular'],
    ]) {
      await page.getByRole('button',{name:'Try '+label,exact:true}).click();
      await page.getByRole('link',{name:`Download ${name}.woff2`,exact:true}).waitFor();
    }
  }
  await ready(); await samples();
  await mkdir('.cache',{recursive:true});
  await page.screenshot({path:'.cache/live-desktop.png',fullPage:true,animations:'disabled'});
  const metadata = 'packages/web-font-converter-web/node_modules/.vite/dev/deps/_metadata.json';
  const before = createHash('sha256').update(await readFile(metadata)).digest('hex');
  // Reproduce the precise operation that previously invalidated live module URLs.
  await run('npm',['run','web:build'],{stdio:'inherit'});
  assert.equal(createHash('sha256').update(await readFile(metadata)).digest('hex'),before,'Production build must not rewrite the live dev optimizer cache');
  await page.setViewportSize({width:390,height:844});
  await ready(); await samples();
  await page.getByRole('radio',{name:'TTF / OTF',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download OpenSans-Regular.ttf',exact:true}).waitFor();
  await page.getByRole('radio',{name:'WOFF2',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download OpenSans-Regular.woff2',exact:true}).waitFor();
  await page.getByText('Compression options',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'Compression quality',exact:true}).fill('4');
  await page.getByRole('link',{name:'Download OpenSans-Regular.woff2',exact:true}).waitFor();
  await page.getByRole('radio',{name:'WOFF',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download OpenSans-Regular.woff',exact:true}).waitFor();
  // The disclosure stays expanded across output changes.
  const engine=page.getByRole('radio',{name:'Zopfli · smaller',exact:true});
  if(!await engine.isVisible()) await page.getByText('Compression options',{exact:true}).click();
  await engine.locator('xpath=ancestor::label').click();
  await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).fill('1');
  await page.getByRole('link',{name:'Download OpenSans-Regular.woff',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Try Rochester · OTF',exact:true}).click();
  await page.getByRole('link',{name:'Download Rochester.woff',exact:true}).waitFor({timeout:60000});
  await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).fill('100');
  await page.getByRole('button',{name:'Cancel conversion',exact:true}).click();
  await page.getByRole('radio',{name:'zlib · faster',exact:true}).locator('xpath=ancestor::label').click();
  await page.getByRole('link',{name:'Download Rochester.woff',exact:true}).waitFor();
  assert.equal(await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).count(),0);
  await engine.locator('xpath=ancestor::label').click();
  await page.getByRole('spinbutton',{name:'Zopfli iterations',exact:true}).fill('1');
  await page.getByRole('link',{name:'Download Rochester.woff',exact:true}).waitFor({timeout:60000});
  await page.screenshot({path:'.cache/live-mobile.png',fullPage:true,animations:'disabled'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(problems,[],'Live server must have no failed HTTP requests, console errors, or hydration failures');
  console.log(`Live ${origin}: desktop/mobile hydration, four samples, controls and build-while-running passed; no HTTP/console/page errors.`);
} finally { await browser.close(); }
