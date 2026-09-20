import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const output='docs/ui-research/beacon-preferences';
await mkdir(output,{recursive:true});
try {
  const page=await browser.newPage({reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>sessionStorage.setItem('beacon.onboarding.home.v1',JSON.stringify({homeName:'Pritchard Hall',homeAddress:'Virginia Tech, Blacksburg, VA'})));
  for(const [width,height] of [[390,844],[512,949],[320,568],[1440,1000]]) {
    await page.setViewportSize({width,height});
    await page.goto((process.env.BEACON_URL || 'http://localhost:3000')+'/onboarding/preferences',{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Your way home.'}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const art=page.locator('img[src*="beacon-preferences"]');
    assert.equal(await art.count(),4);
    assert(await art.evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const save=await page.getByRole('button',{name:'Save and continue'}).boundingBox();
    assert(save&&save.y>=0&&save.y+save.height<=height,'Save remains visible');
    await page.screenshot({path:`${output}/${width}.png`});
  }
  await page.getByRole('spinbutton').fill('17');
  await page.getByRole('switch',{name:'Less walking'}).click();
  await page.getByRole('switch',{name:'Fewer transfers'}).click();
  await page.getByRole('button',{name:'Save and continue'}).click();
  await page.getByRole('button',{name:'Get me home'}).waitFor();
  const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('safecircle.profile.v1')));
  assert.equal(profile.maxBudget,17);
  assert.equal(profile.walkingPreference,'normal');
  assert.equal(profile.avoidTransfers,false);
  assert.deepEqual(errors,[]);
  console.log('PASS: four custom assets, 320/390/512/1440 layouts, exact budget, switches, saved navigation; no page errors.');
} finally {await browser.close();}
