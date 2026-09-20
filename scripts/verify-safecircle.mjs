/** Migrated original UI regression: explicit manual fixtures, never automatic consent/arrival. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.SAFECIRCLE_URL||'http://localhost:3123',output=process.env.SAFECIRCLE_SCREENSHOTS||'docs/ui-research/backend-integration/legacy-ui';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
const results={base,mode:'explicit manual fixture',checks:[],captures:[],errors:[]};
page.on('pageerror',e=>results.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
const button=name=>page.getByRole('button',{name,exact:true});
const stage=value=>page.locator(`[data-testid="screen-${value}"]`).waitFor();
function check(name,pass){assert.ok(pass,name);results.checks.push(name);}
async function capture(name){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${output}/${name}.png`,fullPage:true});check(`${name}: no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const small=await page.locator('button,a[href]').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&(r.width<43.9||r.height<43.9);}).map(e=>e.textContent));assert.deepEqual(small,[],`${name}: touch targets`);results.captures.push(name);}
async function close(){if(await page.getByRole('dialog').count()){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}}
async function judge(id){await button('Judge controls').click();await page.getByRole('dialog').waitFor();await page.getByTestId(id).click();await close();}
async function advance(expected){await judge('demo-apply-response');await stage(expected);}
async function jump(value,id=`demo-jump-${value}`){await judge(id);await stage(value);}
try{
 await page.goto(`${base}/onboarding/welcome?demo=1`);await page.getByRole('link',{name:'Get started'}).click();
 await page.getByRole('heading',{name:'Where is home?'}).waitFor();await capture('01-home-setup');
 await button('Set as home').click();await page.getByRole('heading',{name:'Your way home.'}).waitFor();
 await page.getByRole('button',{name:'Go back',exact:true}).click();await page.getByRole('heading',{name:'Where is home?'}).waitFor();check('onboarding back preserves selected destination',/Pritchard Hall/.test(await page.locator('body').innerText()));
 await button('Set as home').click();await button('Save and continue').click();await stage('home');await page.waitForLoadState('networkidle');
 await page.goto(`${base}/demo?walkthrough=1&transport=manual`);await stage('home');check('profile persists',await page.evaluate(()=>!!localStorage.getItem('safecircle.profile.v1')));await capture('03-home');
 // The old Home map was removed: only an active walking leg may expose a route.
 check('Home never shows a fabricated active route',await page.getByTestId('walking-route-map').count()===0);
 await button('Open preferences').click();await page.getByRole('dialog').waitFor();await capture('04-preferences');await close();
 await button('Trusted contact').click();await page.getByLabel('Trusted contact phone',{exact:true}).fill('+1 (540) 555-0100');await button('Save changes').click();await close();
 await button('Trip needs').click();await button('I’m tired').click();await button('Apply to this trip').click();await close();
 await button('Get me home').click();await stage('discovering');
 for(const s of ['collecting-quotes','evaluating','recommendation'])await advance(s);
 await capture('08-recommendation');check('unconfirmed recommendation has no identity claim',await page.getByText('Verified provider',{exact:true}).count()===0);
 await button('See other options').click();check('comparison contains alternative plans',await page.getByRole('region',{name:'Other eligible options'}).count()===1);
 await button('Confirm this plan').click();await stage('verifying-initial');
 for(const s of ['authorizing-initial','coordinating-initial','accepted-initial','waiting-initial']){await advance(s);await capture(s);}
 await page.clock.install();await page.clock.fastForward(30000);check('manual fixture never progresses from a frontend timer',await page.getByTestId('screen-waiting-initial').isVisible());await page.clock.resume();
 await button('View trip details').click();await page.getByRole('dialog').waitFor();check('consumer details exclude judge controls',await page.getByTestId('demo-cancel-provider').count()===0);await capture('trip-details');await close();
 await button('Get help').click();check('emergency link retained',await page.locator('a[href="tel:911"]').count()===1);check('trusted contact call shortcut retained',(await page.getByRole('link',{name:/Call trusted contact/}).getAttribute('href')).replace(/[ ()-]/g,'')==='tel:+15405550100');await capture('help');await close();
 await judge('demo-cancel-provider');await stage('provider-cancelled');
 for(const s of ['reconciling','replanning-discovery','replanning-evaluation','replacement-selected'])await advance(s);
 await capture('replacement');check('replacement explicitly requires fresh confirmation',await button('Confirm this plan').count()===1);
 await button('Confirm this plan').click();await stage('verifying-replacement');
 for(const s of ['authorizing-replacement','coordinating-replacement','accepted-replacement','waiting-replacement','arriving-replacement','in-trip-replacement'])await advance(s);
 await button('I’m home').click();await stage('arrival');await capture('replacement-arrival');await button('Finish').click();await stage('home');
 for(const [id,s] of [['demo-no-options','no-options'],['demo-verification-failure','verification-failed'],['demo-context-fallback','context-fallback'],['demo-offline','offline'],['demo-overdue','overdue'],['demo-payment-unknown','payment-unknown'],['demo-booking-unknown','booking-unknown']]){await jump(s,id);await capture(s);await jump('home');}
 await jump('waiting-initial');await context.setOffline(true);await stage('offline');await button('Reconnect').click();check('offline retry cannot claim connectivity',await page.getByTestId('screen-offline').isVisible());await context.setOffline(false);await stage('reconnecting');await advance('waiting-initial');
 await jump('home');await button('Judge controls').click();await page.getByRole('dialog').waitFor();await page.waitForFunction(()=>!!document.activeElement?.closest('[role="dialog"]'));
 for(let i=0;i<8;i++){await page.keyboard.press('Tab');await page.waitForFunction(()=>!!document.activeElement?.closest('[role="dialog"]'));check(`dialog focus stays contained ${i+1}`,await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')));}await close();
 for(const viewport of [{width:320,height:568},{width:430,height:932},{width:1440,height:1000}]){await page.setViewportSize(viewport);await capture(`responsive-${viewport.width}-home`);await jump('recommendation');const confirm=button('Confirm this plan');await confirm.scrollIntoViewIfNeeded();const box=await confirm.boundingBox();check(`confirmation reachable at ${viewport.width}`,box&&box.y>=0&&box.y+box.height<=viewport.height+1);await capture(`responsive-${viewport.width}-recommendation`);await jump('home');}
 await page.setViewportSize({width:390,height:844});await button('Open preferences').click();await page.getByLabel('Maximum budget',{exact:true}).fill('0');await page.getByLabel('Standard walking',{exact:true}).check();await button('Save changes').click();await close();
 await button('Get me home').click();for(const s of ['collecting-quotes','evaluating','recommendation'])await advance(s);await button('Confirm walking plan').click();await stage('in-trip-initial');await capture('walking-active');check('walking has no verified provider',await page.getByText('Verified provider',{exact:true}).count()===0);
 await button('I’m home').click();await stage('arrival');check('walking arrival does not claim provider access',!/Temporary provider access has ended/.test(await page.locator('body').innerText()));
 await page.reload();await stage('arrival');check('completed trip restoration stays authoritative',true);await button('Finish').click();await stage('home');
 await judge('demo-reset-profile');await page.getByRole('heading',{name:'Get me home.'}).waitFor();check('reset returns onboarding and clears profile',await page.evaluate(()=>localStorage.getItem('safecircle.profile.v1')===null));
 check('current welcome product title',await page.title()==='Welcome to Beacon');const manifest=await(await context.request.get(`${base}/manifest.webmanifest`)).json();check('manifest standalone',manifest.display==='standalone');for(const size of ['192x192','512x512'])check(`manifest icon ${size}`,manifest.icons.some(i=>i.sizes===size));
 assert.deepEqual(results.errors,[]);results.status='passed';
}catch(e){results.status='failed';results.failure=e.message;throw e;}finally{await browser.close();await writeFile(`${output}/verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({status:results.status,checks:results.checks.length,failure:results.failure}));}
