import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ts=require('typescript'), tmp=mkdtempSync(join(tmpdir(),'beacon-trip-final-'));
for(const name of ['mock-data','demo-controller'])writeFileSync(join(tmp,name+'.js'),ts.transpileModule(readFileSync(`src/components/safecircle/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
const {createDemoState,snapshotForStage,transitionDemo:act}=require(join(tmp,'demo-controller.js'));
const {defaultProfile}=require(join(tmp,'mock-data.js'));
const out='docs/ui-research/beacon-complete/workstream-c', base=process.env.BEACON_URL||'http://localhost:3100';
await mkdir(out+'/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const page=await ctx.newPage();page.setDefaultTimeout(10000);const results={base,checks:[],screens:[],errors:[],findings:[]};
page.on('pageerror',e=>results.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
const stage=s=>page.locator(`[data-stage="${s}"]`).waitFor({timeout:12000});
const tap=name=>page.getByRole('button',{name,exact:true}).tap();
const saved=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('beacon.demo-trip.v2')).state);
async function seed(s){await page.goto(base+'/offline.html');await page.evaluate(s=>{localStorage.setItem('safecircle.profile.v1',JSON.stringify(s.profile));sessionStorage.setItem('beacon.demo-trip.v2',JSON.stringify({version:2,mode:'local-simulation',state:s}));},s);await page.goto(base+'/app');await stage(s.stage);}
function snap(s,profile=defaultProfile){return snapshotForStage(createDemoState(profile),s,Date.now());}
async function evidence(name){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);await page.screenshot({path:`${out}/screenshots/${name}.png`,fullPage:true});const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,small:[...document.querySelectorAll('button,a')].filter(e=>e.getBoundingClientRect().height&&e.getBoundingClientRect().width).map(e=>({label:(e.innerText||e.getAttribute('aria-label')||'').trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width<43.9||e.height<43.9),animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName,duration:a.effect?.getTiming().duration,iterations:a.effect?.getTiming().iterations}))}));assert(metrics.scrollWidth<=metrics.width,`${name}: horizontal overflow`);assert.deepEqual(metrics.small,[],`${name}: undersized target`);results.screens.push({name,...metrics});}
try{
if(process.env.BEACON_DETAILS_ONLY){
for(const [width,height] of [[360,800],[393,852]]){
await page.setViewportSize({width,height});
for(const target of ['in-trip-initial','arrival']){
await seed({...snap(target),paused:true});await tap('View trip details');await page.getByRole('dialog').waitFor();await evidence(`${width}-${target}-details-fixed`);assert.match(await page.getByRole('dialog').innerText(),/Booking|booking/);await page.getByRole('button',{name:/Close.*details/i}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await stage(target);assert.equal(await page.getByRole('button',{name:'View trip details',exact:true}).evaluate(e=>e===document.activeElement),true);results.checks.push(`${width}: ${target} details open and close with focus restored`);
}
for(const mode of ['walk','transit']){
let s=snap('recommendation',{...defaultProfile,walkingPreference:'normal',avoidTransfers:false});s=act(s,{type:'SELECT_PLAN',planId:mode==='walk'?'walk-008':'transit-017',now:Date.now()});s=act(s,{type:'GO',now:Date.now()});if(mode==='transit')s=act(s,{type:'ADVANCE',now:Date.now()});s=act(s,{type:'CONFIRM_ARRIVAL'});await seed({...s,paused:true});await evidence(`${width}-${mode}-arrival-fixed`);const body=await page.locator('body').innerText();assert.match(body,/This demo plan is complete/);assert.doesNotMatch(body,/Provider access ended|Temporary provider access has ended/i);results.checks.push(`${width}: ${mode} arrival states local completion without claiming prior provider access`);
}
const profile={...defaultProfile,homeName:'Pritchard Hall — accessible east residential entrance',homeAddress:'630 Washington Street Southwest, East Residential Entrance, Blacksburg, Virginia 24061'};
await seed({...snap('in-trip-initial',profile),paused:true});await page.getByRole('button',{name:'Request cancellation',exact:true}).scrollIntoViewIfNeeded();const rect=await page.getByRole('button',{name:'Request cancellation',exact:true}).boundingBox();results.screens.push({name:`${width}-long-cancel-rect`,rect});assert(rect.y>=0&&rect.y+rect.height<=height+1);await evidence(`${width}-long-controls-reachable`);await tap('Request cancellation');await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button',{name:'Keep this trip',exact:true}).tap();await page.getByRole('dialog').waitFor({state:'hidden'});results.checks.push(`${width}: long destination lower controls remain reachable by scrolling`);
}
}else{
for(const [width,height] of [[360,800],[393,852]]){
await page.setViewportSize({width,height});
for(const mode of ['walk','transit']){
let s=snap('recommendation',{...defaultProfile,walkingPreference:'normal',avoidTransfers:false});s=act(s,{type:'SELECT_PLAN',planId:mode==='walk'?'walk-008':'transit-017',now:Date.now()});s=act(s,{type:'GO',now:Date.now()});await seed(s);await evidence(`${width}-${mode}-active`);
await tap('Request cancellation');await page.getByRole('dialog').waitFor();const dialog=await page.getByRole('dialog').innerText();assert(!dialog.includes('wait for the provider'));await evidence(`${width}-${mode}-cancel-sheet`);await page.getByRole('dialog').getByRole('button',{name:'Stop request',exact:true}).tap();await stage('cancelling');await evidence(`${width}-${mode}-cancelling`);let body=await page.locator('body').innerText();assert(body.includes('No provider booking or payment was requested'));assert(!body.includes('Waiting for the provider'));await stage('cancelled');await evidence(`${width}-${mode}-cancelled`);const ss=await saved();assert.equal(ss.bookingStatus,'not-required');assert.equal(ss.paymentStatus,'not-required');assert.equal(ss.sensitiveDataReleased,false);await tap('Finish');await stage('home');results.checks.push(`${width}: ${mode} cancellation closes local plan without provider booking/payment or provider-wait copy`);
}
for(const target of ['booking-unknown','payment-unknown']){
await seed({...snap(target),paused:true});await evidence(`${width}-${target}`);const body=await page.locator('body').innerText();assert.match(body,/reconciling this same attempt/);assert.equal(await page.getByRole('button',{name:'Get me home',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Confirm this plan',exact:true}).count(),0);results.checks.push(`${width}: ${target} explains same-attempt reconciliation and offers no new booking`);
}
await seed({...snap('overdue'),paused:true});await tap('Get help');await page.getByRole('dialog').waitFor();await evidence(`${width}-help`);assert.match(await page.getByRole('dialog').innerText(),/not an emergency service/);assert.match(await page.getByRole('dialog').innerText(),/does not automatically notify anyone/);assert.equal(await page.locator('a[href="tel:911"]').count(),1);assert.equal(await page.locator('a[href="tel:+15403824343"]').count(),1);results.checks.push(`${width}: help explains boundaries and exposes verified emergency/nonemergency links; no calls placed`);
await seed({...snap('arrival'),paused:true});await evidence(`${width}-arrival`);assert.match(await page.locator('body').innerText(),/Simulated status/i);await tap('Finish');await stage('home');
const longProfile={...defaultProfile,homeName:'Pritchard Hall — accessible east residential entrance',homeAddress:'630 Washington Street Southwest, East Residential Entrance, Blacksburg, Virginia 24061'};
await seed({...snap('in-trip-initial',longProfile),paused:true});await evidence(`${width}-long-destination`);assert.match(await page.locator('body').innerText(),/accessible east residential entrance/);await seed({...snap('waiting-initial',longProfile),paused:true});await tap('View trip details');await page.getByRole('dialog').waitFor();await evidence(`${width}-long-details`);results.checks.push(`${width}: long destination and trip details wrap, controls remain at least 44px, reduced-motion preference active`);
}
}
assert.deepEqual(results.errors,[]);results.checks.push('No browser console errors or page exceptions');
}catch(e){results.failure=e.stack;await page.screenshot({path:out+'/screenshots/FAILURE.png',fullPage:true}).catch(()=>{});throw e;}
finally{await writeFile(out+(process.env.BEACON_DETAILS_ONLY?'/details-fix-results.json':'/results.json'),JSON.stringify(results,null,2));await browser.close();rmSync(tmp,{recursive:true,force:true});console.log(JSON.stringify(results,null,2));}
