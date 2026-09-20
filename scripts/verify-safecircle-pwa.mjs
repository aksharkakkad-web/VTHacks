/** Production Beacon manifest, installability, offline and restricted-storage verification. */
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.BEACON_URL||process.env.SAFECIRCLE_URL||'http://localhost:3100',output=process.env.BEACON_EVIDENCE_DIR||'docs/ui-research/beacon-complete';
await mkdir(output+'/screenshots',{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});const checks=[];const profile=await mkdtemp(join(tmpdir(),'beacon-pwa-'));let c;
try{
 c=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c.newPage();p.setDefaultTimeout(15000);await p.goto(url);await p.getByRole("link",{name:/Get started/i}).waitFor();
 const manifest=await(await p.request.get(url+'/manifest.webmanifest')).json();
 assert.equal(manifest.name,'Beacon');assert.equal(manifest.short_name,'Beacon');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert(manifest.theme_color&&manifest.background_color);
 for(const size of ['192x192','512x512']) {const icon=manifest.icons.find(i=>i.sizes===size);assert(icon);assert((await p.request.get(url+icon.src)).ok());}
 assert.match(await p.locator('meta[name="viewport"]').getAttribute('content'),/viewport-fit=cover/);
 assert.equal(await p.locator('meta[name="mobile-web-app-capable"]').first().getAttribute('content'),'yes');
 const cdp=await c.newCDPSession(p);const install=await cdp.send('Page.getInstallabilityErrors');assert.deepEqual(install.installabilityErrors,[]);
 checks.push('Manifest, icons, standalone metadata, safe-area viewport; Chromium installability reports zero errors');
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 const cached=await p.evaluate(async()=>{const names=await caches.keys();return (await Promise.all(names.map(async n=>(await(await caches.open(n)).keys()).map(r=>new URL(r.url).pathname)))).flat()});
 assert(cached.includes('/offline.html'));assert(cached.every(path=>['/offline.html','/beacon-192.png'].includes(path)));
 const worker=await p.request.get(url+'/sw.js');assert.match(worker.headers()['cache-control'],/no-store/);
 await c.setOffline(true);await p.goto(url+'/app');assert.match(await p.locator('body').innerText(),/reconnect/i);await p.getByRole('button',{name:'Try again'}).click();await p.waitForFunction(()=>document.body.innerText.includes('Still offline'));assert.match(await p.locator('body').innerText(),/Still offline/);await p.screenshot({path:output+'/screenshots/PWA-offline-shell.png'});
 await c.setOffline(false);await p.getByRole('button',{name:'Try again'}).click();await p.getByRole('link',{name:/Get started/i}).waitFor();checks.push('Service worker installs, public-only cache, offline shell and reconnect retry');await c.close();
 const r=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await r.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=()=>{throw new DOMException('Storage blocked','SecurityError')}});const q=await r.newPage(),errors=[];q.on('pageerror',e=>errors.push(e.message));await q.goto(url);await q.getByRole('link',{name:/Get started/i}).click();await q.getByRole('button',{name:'Set as home'}).click();await q.getByRole('button',{name:'Save and continue'}).click();await q.locator('[data-stage="home"]').waitFor();assert.match(await q.locator('body').innerText(),/Storage unavailable/);assert.deepEqual(errors,[]);await q.screenshot({path:output+'/screenshots/PWA-restricted-storage.png'});checks.push('Storage blocked: onboarding remains usable, persistence limits visible');await r.close();
 await writeFile(output+'/pwa-results.json',JSON.stringify({url,checks,manifest,install,cached},null,2));console.log(JSON.stringify({checks}));
}finally{await c?.close();await b.close();await rm(profile,{recursive:true,force:true})}
