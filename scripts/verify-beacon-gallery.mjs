/** Capture all real gallery specimens; connected journeys are tested separately. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='docs/ui-research/beacon-complete/gallery',base=process.env.BEACON_URL||'http://localhost:3000';
await mkdir(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});const p=await c.newPage();p.setDefaultTimeout(12000);const errors=[],shots=[];
p.on('pageerror',e=>errors.push(e.message));
try {
 await p.goto(base+'/beacon-system');const nav=p.getByRole('navigation',{name:'Beacon screen inventory'});const names=await nav.getByRole('button').allTextContents();
 for(const [index,name] of names.entries()){
  await nav.getByRole('button').nth(index).click();await p.evaluate(()=>document.fonts.ready);
  const id=name.match(/^\d+|^[A-Z]\d+[ab]?/)[0];
  const dialog=p.getByRole('dialog');
  if(await dialog.count()) {await dialog.waitFor();await p.screenshot({path:`${out}/${id}.png`});await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});}
  else {const preview=p.locator('[class*="previewViewport"]').first();await preview.scrollIntoViewIfNeeded();await preview.screenshot({path:`${out}/${id}.png`});}
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');shots.push({id,name});
 }
 await p.goto(base+'/onboarding/splash?gallery=1');await p.getByRole('status').waitFor();await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:'docs/ui-research/beacon-complete/screenshots/01-boot.png'});
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({base,viewport:'390x844',shots,errors},null,2));console.log(JSON.stringify({screens:shots.length,errors}));
}finally{await c.close();await b.close()}
