/** Production-only PWA and restricted-storage smoke checks. No external calls are placed. */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=process.env.SAFECIRCLE_URL || 'http://localhost:3001';
const output=process.env.SAFECIRCLE_SCREENSHOTS || 'docs/ui-research/final';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[];
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto(url);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  const cached=await page.evaluate(async()=>{
    const names=await caches.keys();
    return (await Promise.all(names.map(async name=>(await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)))).flat();
  });
  assert(cached.includes('/offline.html'));
  assert(cached.every(path=>path==='/offline.html'||path.startsWith('/safecircle-icon')),'Only public offline assets may be cached');
  await context.setOffline(true);
  await page.goto(`${url}/offline-check`);
  assert.match(await page.locator('body').innerText(),/offline|reconnect/i);
  await page.screenshot({path:`${output}/offline-reload.png`});
  checks.push('Production service worker installs; offline navigation shows reconnect fallback; no trip/API data cached');
  await context.close();

  const restricted=await browser.newContext({viewport:{width:390,height:844}});
  await restricted.addInitScript(()=>{
    for(const method of ['getItem','setItem','removeItem']) Storage.prototype[method]=()=>{throw new DOMException('Storage blocked','SecurityError');};
  });
  const storagePage=await restricted.newPage();
  const errors=[];
  storagePage.on('pageerror',e=>errors.push(e.message));
  await storagePage.goto(url);
  await storagePage.getByTestId('screen-setup-home').waitFor();
  await storagePage.getByRole('button',{name:'CONTINUE',exact:true}).click();
  await storagePage.getByRole('button',{name:'SAVE AND CONTINUE'}).click();
  await storagePage.getByTestId('screen-home').waitFor();
  assert.match(await storagePage.locator('body').innerText(),/session only/);
  assert.deepEqual(errors,[]);
  await storagePage.screenshot({path:`${output}/restricted-storage.png`});
  checks.push('Blocked browser storage still permits setup and home with honest session-only notice');
  await restricted.close();
  await writeFile(`${output}/pwa-verification.json`,JSON.stringify({url,checks,cached},null,2));
  console.log(JSON.stringify({checks}));
} finally {await browser.close();}
