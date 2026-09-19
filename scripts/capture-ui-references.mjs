import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:900}});
await mkdir('docs/ui-research/references', {recursive:true});
const references = [
  ['uber-trip-hierarchy','https://www.uber.com/iq/en/blog/live-activity-on-ios/','figure'],
  ['transit-trip-progress','https://help.transitapp.com/article/546-transit-6-0-quick-start-guide','img'],
  ['apple-maps','https://support.apple.com/en-ca/guide/iphone/iph02f94fc1c/ios','img'],
  ['lyft-progress','https://design.lyft.com/that-little-island-changes-everything-b89b108f45b4','figure'],
];
for (const [name,url,selector] of references) {
  try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(1500);
    const optout=page.getByRole('button',{name:'Opt out',exact:true});
    if(await optout.isVisible()) await optout.click();
    const images=await page.locator(selector).all();
    let captured=0;
    for(const el of images) {
      const box=await el.boundingBox();
      if(box && box.width>220 && box.height>180 && captured<3) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await el.screenshot({path:`docs/ui-research/references/${name}-${++captured}.png`});
      }
    }
    if(!captured) await page.screenshot({path:`docs/ui-research/references/${name}-page.png`});
    console.log(name, captured, await page.title());
  } catch(error) {console.log(name,error.message);}
}
await browser.close();
