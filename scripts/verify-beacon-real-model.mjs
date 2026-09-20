/** One real laptop-model UI trip; canonical deterministic regression evidence stays untouched. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Backend} from '../tools/beacon-laptop-worker/worker.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
assert.ok(process.env.BEACON_OPERATOR_FILE,'Private operator file is required');
const operator=JSON.parse(await readFile(process.env.BEACON_OPERATOR_FILE,'utf8'));
assert.equal(operator.modelInference,'codex_subscription','Smoke requires launcher --real-model');
const base=operator.base,backend=new Backend(base,operator.workerToken),output='docs/ui-research/backend-integration/real-model';
await mkdir(output,{recursive:true});
const result={startedAt:new Date().toISOString(),base,runtime:operator.runtime,modelInference:'codex_subscription',ranking:'offline',providers:'simulated',notifications:'simulated',checks:[],screenshots:[],errors:[],failedRequests:[],abortedRequests:[],network:[]};
const check=(name,ok)=>{assert.ok(ok,name);result.checks.push(name);console.log(`PASS ${name}`);};
async function until(fn,label){const deadline=Date.now()+180000;while(Date.now()<deadline){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,500));}throw new Error(`Timeout: ${label}`);}
async function shot(page,name){const path=`${output}/${name}.png`;await page.screenshot({path,fullPage:true});result.screenshots.push(path);}
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
let tripId;
page.on('pageerror',error=>result.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
page.on('requestfailed',request=>{const url=new URL(request.url()),entry={path:url.pathname,method:request.method(),error:request.failure()?.errorText};const expectedGetCancellation=entry.error==='net::ERR_ABORTED'&&entry.method==='GET'&&(request.isNavigationRequest()||url.searchParams.has('_rsc')||/\/api\/trips\/[^/]+\/journey$/.test(url.pathname));if(expectedGetCancellation)result.abortedRequests.push({...entry,classification:'navigation_or_journey_read_cancellation'});else result.failedRequests.push(entry);});
page.on('response',async response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/'))result.network.push({path,method:response.request().method(),status:response.status()});if(path==='/api/trips'&&response.request().method()==='POST'&&response.status()===201)tripId=(await response.json()).id;});
async function view(){const response=await page.request.get(`${base}/api/trips/${tripId}/journey`);assert.ok(response.ok(),'Atomic journey HTTP read');return response.json();}
try{
 await page.goto(`${base}/demo`);await page.getByRole('link',{name:'Get started',exact:true}).click();await page.getByRole('button',{name:/Set as home/}).click();await page.getByRole('button',{name:'Save and continue',exact:true}).click();
 await page.getByRole('button',{name:'Get me home',exact:true}).waitFor();
 const pairing=await backend.post('pairing',{});await page.getByLabel('Pairing code').evaluate(input=>{input.type='password';});await page.getByLabel('Pairing code').fill(pairing.code);
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/demo/planner/pair'&&response.status()===200),page.getByRole('button',{name:'Pair planner',exact:true}).click()]);
 await page.getByRole('button',{name:'Get me home',exact:true}).click();await until(()=>Boolean(tripId),'trip creation');
 let snapshot;
 await until(async()=>{snapshot=await view();if(snapshot.planning?.phase==='unavailable'&&snapshot.planning.messageCode!=='PLANNER_NOT_STARTED')throw new Error(`Planner unavailable: ${snapshot.planning.messageCode}`);return snapshot.planning?.phase==='ready';},'real model recommendation');
 check('real laptop model supplies the recommendation explanation',snapshot.planning.modelSource==='codex_subscription'&&snapshot.planning.explanationSource==='llm_grounded');
 result.planning={phase:snapshot.planning.phase,model:snapshot.planning.model,modelSource:snapshot.planning.modelSource,explanationSource:snapshot.planning.explanationSource};
 result.decision={engine:snapshot.journey.complete?.execution.engine,selectedKind:snapshot.journey.complete?.selected.kind,alternativeCount:snapshot.journey.complete?.alternatives.length};
 check('ranking remains honestly offline',result.decision.engine==='local_fallback');
 await page.locator('[data-stage="recommendation"]').waitFor();await page.getByText(snapshot.planning.explanation,{exact:true}).waitFor({timeout:30000});check('grounded model explanation is visible in the offer',true);await shot(page,'recommendation');
 check('default saved preferences produce a ride offer',snapshot.journey.complete?.selected.kind==='ride');
 const confirm=page.getByRole('button',{name:'Confirm this plan',exact:true});await confirm.scrollIntoViewIfNeeded();const confirmBox=await confirm.boundingBox();check('confirmation action is reachable inside the 390x844 viewport',Boolean(confirmBox)&&confirmBox.x>=0&&confirmBox.y>=0&&confirmBox.x+confirmBox.width<=390&&confirmBox.y+confirmBox.height<=844);
 const actionShot=`${output}/recommendation-actions.png`;await page.screenshot({path:actionShot,fullPage:false});result.screenshots.push(actionShot);
 await confirm.click();await until(async()=>(await view()).trip.state==='WAITING_FOR_PICKUP','provider booking');await page.locator('[data-stage="waiting-initial"],[data-stage="waiting-replacement"]').waitFor();
 snapshot=await view();check('UI consent produces a simulated provider booking',snapshot.ride?.simulated===true&&Boolean(snapshot.ride?.vehicle?.licensePlate));await shot(page,'pickup');
 for(const stage of ['approaching','arrived','in_trip','completed']){const response=await page.request.post(`${base}/api/demo/trips/${tripId}/advance-ride`,{data:{stage}});assert.ok(response.ok(),`Explicit simulated provider ${stage}`);}
 await page.getByRole('button',{name:'I’m home',exact:true}).click();await until(async()=>(await view()).trip.state==='ARRIVED','manual arrival');await page.locator('[data-stage="arrival"]').waitFor();await shot(page,'arrival');
 check('manual arrival is confirmed by backend',true);await page.getByRole('button',{name:'Finish',exact:true}).click();await page.getByRole('button',{name:'Get me home',exact:true}).waitFor();await shot(page,'finished-home');check('Finish returns Home',true);
 check('no page or console errors',result.errors.length===0);check('no failed browser requests',result.failedRequests.length===0);check('no backend HTTP errors',result.network.every(entry=>entry.status<400));result.status='passed';
}catch(error){result.status='failed';result.failure=error.message;await shot(page,'failure').catch(()=>{});throw error;}finally{await context.close();await browser.close();result.finishedAt=new Date().toISOString();await writeFile(`${output}/results.json`,JSON.stringify(result,null,2));}
