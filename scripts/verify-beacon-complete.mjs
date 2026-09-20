/** Onboarding + explicitly selected manual fixture screen walkthrough. Real API journeys live in verify-beacon-backend. */
import { createRequire } from 'node:module';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ts=require('typescript');
const build=mkdtempSync(join(tmpdir(),'beacon-browser-'));
for(const name of ['mock-data','demo-controller']) writeFileSync(join(build,name+'.js'),ts.transpileModule(readFileSync(`src/components/safecircle/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
const base=process.env.BEACON_URL || 'http://localhost:3000';
const out='docs/ui-research/beacon-complete';
await mkdir(`${out}/screenshots`,{recursive:true});await mkdir(`${out}/video`,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[],shots=[];
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,recordVideo:{dir:`${out}/video`,size:{width:390,height:844}}});
const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const state=stage=>p.locator(`[data-stage="${stage}"]`).waitFor({timeout:18000});
async function shot(name){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`${out}/screenshots/${name}.png`});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' page overflow');shots.push(name);if(['02-welcome','03-home-setup','04-preferences','05-home','08-recommendation','08-offer-terms','13-travelling','14-arrival'].includes(name))await p.waitForTimeout(1200);}
async function tap(name){await p.getByRole('button',{name,exact:true}).tap();}
async function advance(){await tap('Judge controls');await p.getByTestId('demo-apply-response').click();await p.getByRole('dialog').waitFor({state:'hidden'});}
try{
  await p.goto(base+'/onboarding/welcome');await shot('02-welcome');await p.getByRole('link',{name:/Get started/i}).tap();await p.getByRole('heading',{name:'Where is home?'}).waitFor();await shot('03-home-setup');await tap('Set as home');await p.getByRole('heading',{name:'Your way home.'}).waitFor();await shot('04-preferences');await tap('Save and continue');await state('home');await shot('05-home');checks.push('New user onboarding');
  await p.goto(base+'/demo?walkthrough=1&transport=manual');await state('home');await tap('Get me home');await state('discovering');await shot('06-discovery');await p.clock.install();await p.clock.runFor(5000);assert.equal(await p.locator('[data-stage="discovering"]').count(),1);checks.push('Manual fixture does not advance from a frontend timer');await advance();await state('collecting-quotes');await advance();await state('evaluating');await shot('07-comparison');await advance();await state('recommendation');await shot('08-recommendation');await p.getByRole('button',{name:'Confirm this plan',exact:true}).scrollIntoViewIfNeeded();await shot('08-offer-terms');await tap('Confirm this plan');
  for(const [s,id]of [['verifying-initial','09-identity'],['authorizing-initial','10-authorization'],['coordinating-initial','11-booking'],['accepted-initial','12-accepted'],['waiting-initial','12-pickup'],['arriving-initial','12-approaching'],['in-trip-initial','13-travelling']]){if(s!=='verifying-initial')await advance();await state(s);await shot(id);}
  await tap('I’m home');await state('arrival');await shot('14-arrival');await tap('Finish');await state('home');checks.push('Explicit sample-response journey renders separate identity/access/payment/booking and arrival');
  const video=p.video();await p.close();await c.close();await rename(await video.path(),`${out}/video/main-walkthrough.webm`);
  // Remaining journeys use a fresh non-recorded context.
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const q=await ctx.newPage();
  // Use the same helpers with a new page by a separate suite below.
  await q.close();await ctx.close();
}catch(e){await writeFile(`${out}/main-failure.txt`,e.stack);throw e;}finally{await b.close();rmSync(build,{recursive:true,force:true});await writeFile(`${out}/main-results.json`,JSON.stringify({base,checks,shots,errors},null,2));}
assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,shots:shots.length,errors}));
