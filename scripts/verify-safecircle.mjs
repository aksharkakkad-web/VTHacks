/** Browser verification for the local UI demo. Set PLAYWRIGHT_MODULE if not installed locally. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.SAFECIRCLE_URL || 'http://localhost:3000';
const output = process.env.SAFECIRCLE_SCREENSHOTS || 'docs/ui-research/final';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
const captures=[];
const interactions=[];
const screenshotNames=new Set();

async function capture(name) {
  // Let the browser commit composited frames after React changes under the paused test clock.
  await page.clock.runFor(100);
  await page.evaluate(()=>document.fonts.ready);
  await new Promise(resolve=>setTimeout(resolve,80));
  await page.screenshot({path:`${output}/${name}.png`,animations:'disabled'});
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}));
  assert(geometry.scrollWidth <= geometry.width, `${name}: horizontal overflow`);
  const smallTargets=await page.locator('button, summary, a[href]').evaluateAll(elements=>elements.filter(el=>{
    const r=el.getBoundingClientRect();
    return r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight && getComputedStyle(el).visibility!=='hidden' && (r.width<43.9 || r.height<43.9);
  }).map(el=>({text:el.textContent?.trim(),label:el.getAttribute('aria-label'),height:el.getBoundingClientRect().height})));
  assert.deepEqual(smallTargets,[],`${name}: undersized touch targets`);
  captures.push({name,...geometry});
  screenshotNames.add(name);
}

async function screen(stage, name=stage) {
  await page.getByTestId(`screen-${stage}`).waitFor({state:'visible'});
  if(stage.startsWith('in-trip')) assert.match(await page.locator('[aria-current="step"]').innerText(),/On trip|Walking/);
  if(!screenshotNames.has(name)) await capture(name);
  interactions.push(stage);
}
async function advance(ms,stage) {
  for(let elapsed=0;elapsed<ms+1000 && !await page.getByTestId(`screen-${stage}`).isVisible();elapsed+=100) await page.clock.runFor(100);
  await screen(stage);
}
async function judge() {
  await page.getByRole('button',{name:'Open technical demo details'}).click();
  await page.getByRole('dialog').waitFor({state:'visible'});
  await page.clock.runFor(100);
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await page.clock.runFor(350);
  await page.getByRole('dialog').waitFor({state:'hidden'});
}
async function scenario(id,stage) {
  await judge();
  await page.getByTestId(id).click();
  await closeDialog();
  await screen(stage);
}

try {
  await page.goto(baseURL, {waitUntil:'networkidle'});
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await screen('setup-home','01-onboarding-home');
  await page.getByLabel('Place name',{exact:true}).fill('Campus home');
  await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
  await page.getByRole('button',{name:'Back to home address'}).click();
  assert.equal(await page.getByLabel('Place name',{exact:true}).inputValue(),'Campus home');
  await page.getByLabel('Place name',{exact:true}).fill('Home');
  await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
  await screen('setup-preferences','02-onboarding-preferences');
  await page.getByRole('button',{name:'SAVE AND CONTINUE',exact:true}).click();
  await screen('home','03-home');
  assert(await page.evaluate(()=>!!localStorage.getItem('safecircle.profile.v1')));
  await page.getByRole('button',{name:'Center map on current location'}).click();
  assert.equal(await page.getByRole('button',{name:'Show route overview'}).getAttribute('aria-pressed'),'true');
  await capture('map-centered');
  await page.getByRole('button',{name:'Show route overview'}).click();

  await page.getByRole('button',{name:/Edit saved destination/}).click();
  await capture('04-edit-home');
  await page.getByLabel('Trusted contact phone (optional)',{exact:true}).fill('+1 (540) 555-0100');
  await page.getByRole('button',{name:'SAVE CHANGES'}).click();
  await page.clock.runFor(350);
  await page.getByRole('button',{name:/Add context/}).click();
  await capture('05-trip-context');
  await page.getByLabel('I’m tired',{exact:true}).check();
  await page.getByRole('button',{name:'APPLY TO THIS TRIP'}).click();
  await page.clock.runFor(350);
  await page.getByRole('button',{name:'GET ME HOME',exact:true}).click();
  await screen('discovering');
  await advance(1800,'collecting-quotes');
  await advance(1900,'evaluating');
  await advance(2200,'recommendation');
  if(await page.locator('summary').count()) {
    await page.locator('summary').click();
    await capture('recommendation-alternatives');
    await page.locator('summary').click();
  }
  assert.equal(await page.getByTestId('screen-recommendation').getByText('Verified provider',{exact:true}).count(),0);
  await page.getByRole('button',{name:'GO WITH THIS PLAN'}).click();
  await screen('verifying-initial');
  await advance(2300,'authorizing-initial');
  await advance(1900,'coordinating-initial');
  await advance(2200,'accepted-initial');
  await advance(2400,'waiting-initial');
  await judge();
  await page.getByTestId('demo-toggle-pause').click();
  await capture('judge-paused');
  await closeDialog();
  await page.clock.runFor(10000);
  assert(await page.getByTestId('screen-waiting-initial').isVisible(),'Pause freezes demo timers');
  await judge();
  await page.getByTestId('demo-toggle-pause').click();
  await closeDialog();

  await page.getByRole('button',{name:'Trip details',exact:true}).click();
  await capture('trip-details');
  assert.equal(await page.getByTestId('demo-cancel-provider').count(),0,'Consumer details must not contain judge controls');
  await closeDialog();
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await capture('help');
  assert.equal(await page.getByRole('link',{name:/Call 911/}).getAttribute('href'),'tel:911');
  assert.equal(await page.getByRole('link',{name:/Call trusted contact/}).getAttribute('href'),'tel:+15405550100');
  await closeDialog();
  await judge();
  await capture('technical-timeline');
  await page.getByTestId('demo-cancel-provider').click();
  await closeDialog();
  await screen('provider-cancelled');
  await advance(2600,'replanning-discovery');
  await advance(2500,'replanning-evaluation');
  await advance(2700,'replacement-selected');
  await advance(2500,'verifying-replacement');
  await advance(2300,'authorizing-replacement');
  await advance(1900,'coordinating-replacement');
  await advance(2200,'accepted-replacement');
  await advance(2500,'waiting-replacement');
  await advance(4200,'arriving-replacement');
  await advance(3800,'in-trip-replacement');
  await advance(4800,'arrival');
  assert(await page.getByTestId('screen-arrival').getByText('Rideshare',{exact:false}).count());
  await page.getByRole('button',{name:'FINISH',exact:true}).click();
  await screen('home');

  // Initial-provider arrival, supporting states and judge shortcuts use public controls.
  await scenario('demo-jump-arriving-initial','arriving-initial');
  await advance(3800,'in-trip-initial');
  await advance(4800,'arrival');
  await capture('arrival-initial');
  await page.getByRole('button',{name:'FINISH',exact:true}).click();
  for(const [id,stage] of [['demo-no-options','no-options'],['demo-verification-failure','verification-failed'],['demo-context-fallback','context-fallback'],['demo-offline','offline'],['demo-overdue','overdue']]) {
    await scenario(id,stage);
    await scenario('demo-jump-home','home');
  }
  await scenario('demo-no-options','no-options');
  await page.getByRole('button',{name:'EDIT PREFERENCES'}).click();
  await page.getByRole('dialog').waitFor();
  await closeDialog();
  await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();
  await screen('discovering');
  await scenario('demo-jump-home','home');
  await scenario('demo-context-fallback','context-fallback');
  await page.getByRole('button',{name:'CONTINUE',exact:true}).click();
  await screen('discovering');
  await scenario('demo-jump-home','home');
  await scenario('demo-verification-failure','verification-failed');
  await page.getByRole('button',{name:'RETRY VERIFICATION'}).click();
  await screen('verifying-initial');
  await scenario('demo-jump-home','home');
  await scenario('demo-overdue','overdue');
  await page.getByRole('button',{name:'STILL TRAVELLING'}).click();
  await screen('in-trip-initial');
  await scenario('demo-overdue','overdue');
  await page.getByRole('button',{name:'YES, I’M HOME'}).click();
  await screen('arrival');
  await page.getByRole('button',{name:'FINISH',exact:true}).click();
  await scenario('demo-jump-waiting-initial','waiting-initial');
  await scenario('demo-offline','offline');
  await capture('offline-last-known-trip');
  assert(await page.getByText('Last estimate',{exact:true}).count());
  await page.getByRole('button',{name:'TRY TO RECONNECT'}).click();
  await screen('waiting-initial');
  await scenario('demo-jump-home','home');

  await context.setOffline(true);
  await screen('offline');
  await page.getByRole('button',{name:'TRY TO RECONNECT'}).click();
  assert(await page.getByTestId('screen-offline').isVisible(),'Retry cannot pretend the browser is online');
  await context.setOffline(false);
  await screen('home');

  // Modal focus must stay contained, Escape must close, and keyboard focus remain visible.
  await judge();
  for(let i=0;i<8;i++) {
    await page.keyboard.press('Tab');
    await page.clock.runFor(20);
    assert(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')),`Focus escaped dialog: ${await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,300))}`);
  }
  await closeDialog();

  for(const viewport of [{width:320,height:568},{width:430,height:932},{width:1440,height:1000}]) {
    await page.setViewportSize(viewport);
    await capture(`responsive-${viewport.width}-home`);
    await scenario('demo-jump-recommendation','recommendation');
    await capture(`responsive-${viewport.width}-recommendation`);
    const cta=await page.getByRole('button',{name:'GO WITH THIS PLAN'}).boundingBox();
    assert(cta && cta.y>=0 && cta.y+cta.height<=viewport.height,`GO must remain fully visible at ${viewport.width}×${viewport.height}`);
    if(viewport.width===320) {
      const body=page.getByTestId('screen-recommendation').locator('.sc-sheet-content');
      await body.evaluate(el=>el.scrollTop=el.scrollHeight);
      const card=await page.locator('.sc-provider-card').boundingBox();
      assert(card && card.y+card.height<=cta.y,'Recommendation reasons can scroll entirely above fixed action');
      await capture('responsive-320-recommendation-scrolled');
    }
    await scenario('demo-jump-home','home');
    if(viewport.width===320) {
      await page.getByRole('button',{name:/Edit saved destination/}).click();
      await capture('responsive-320-edit-home');
      await page.getByRole('button',{name:'SAVE CHANGES'}).scrollIntoViewIfNeeded();
      const save=await page.getByRole('button',{name:'SAVE CHANGES'}).boundingBox();
      assert(save && save.y>=0 && save.y+save.height<=viewport.height,'Profile save reachable on short phones');
      await capture('responsive-320-edit-home-scrolled');
      await closeDialog();
    }
  }
  await page.setViewportSize({width:390,height:844});

  // Walking-only preferences must not manufacture a vehicle, pickup or ANS claim.
  await page.getByRole('button',{name:/Edit saved destination/}).click();
  await page.getByLabel(/Maximum trip cost/).fill('0');
  await page.getByLabel('Normal',{exact:true}).check();
  await page.getByRole('button',{name:'SAVE CHANGES'}).click();
  await page.clock.runFor(350);
  await page.getByRole('button',{name:'GET ME HOME',exact:true}).click();
  await advance(1800,'collecting-quotes');
  await advance(1900,'evaluating');
  await advance(2200,'recommendation');
  await capture('walking-recommendation');
  await page.getByRole('button',{name:'GO WITH THIS PLAN'}).click();
  await screen('in-trip-initial');
  await capture('walking-active');
  assert.equal(await page.getByText('Verified provider',{exact:true}).count(),0);
  await advance(4800,'arrival');
  await capture('walking-arrival');
  assert.equal(await page.getByTestId('screen-arrival').getByText('Provider access',{exact:true}).count(),0);
  assert(await page.getByTestId('screen-arrival').getByText('Not shared',{exact:true}).count());
  await page.reload({waitUntil:'networkidle'});
  await screen('home','returning-user');
  assert(await page.getByText('Up to $0',{exact:true}).count());
  await judge();
  await page.getByTestId('demo-reset-profile').click();
  await page.clock.runFor(350);
  await screen('setup-home','reset-profile');
  assert.equal(await page.evaluate(()=>localStorage.getItem('safecircle.profile.v1')),null);
  assert.equal(await page.title(),'SafeCircle — Get me home');
  const manifestHref=await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest=await (await context.request.get(`${baseURL}${manifestHref}`)).json();
  assert.equal(manifest.display,'standalone');
  assert(manifest.icons.some(icon=>icon.sizes==='192x192'));
  assert(manifest.icons.some(icon=>icon.sizes==='512x512'));
  assert.deepEqual(errors,[],'Browser errors');
  await writeFile(`${output}/verification.json`, JSON.stringify({baseURL,captures,interactions,errors},null,2));
  console.log(JSON.stringify({captures:captures.length,errors}));
} finally { await browser.close(); }
