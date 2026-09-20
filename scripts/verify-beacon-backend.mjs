/** Browser acceptance against the real trip API; fixture model and provider progress are explicit. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {Backend} from '../tools/beacon-laptop-worker/worker.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
if(!process.env.BEACON_OPERATOR_FILE)throw new Error('Set BEACON_OPERATOR_FILE to the private runtime operator.json');
const operator=JSON.parse(await readFile(process.env.BEACON_OPERATOR_FILE,'utf8'));
const base=process.env.BEACON_BROWSER_URL||operator.base.replace('127.0.0.1','localhost'),backend=new Backend(operator.base,operator.workerToken);
const output='docs/ui-research/backend-integration';
await mkdir(`${output}/screenshots`,{recursive:true});await mkdir(`${output}/recordings`,{recursive:true});
const result={base,startedAt:new Date().toISOString(),runtime:operator.runtime||'unspecified',modelInference:operator.modelInference||'fixture_only',ranking:'offline',rides:'simulated',notifications:'simulated',checks:[],screenshots:[],recordings:[],errors:[],failedRequests:[],abortedRequests:[],httpFailures:[],network:[],uiStages:[],planning:[]};
function network(source,path,method,status,body){const entry={source,path,method,status};if(path.endsWith('/confirm')&&body&&typeof body==='object')entry.confirmation=Object.fromEntries(['journeyContract','journeyRevision','planId','quoteId'].filter(key=>body[key]!==undefined).map(key=>[key,key==='quoteId'&&typeof body[key]==='string'?`${body[key].split('.')[0]}.[signature-redacted]`:body[key]]));result.network.push(entry);}
function check(name,value){assert.ok(value,name);result.checks.push(name);console.log(`PASS ${name}`);}
async function waitFor(fn,label,timeout=90000){const until=Date.now()+timeout;while(Date.now()<until){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,300));}throw new Error(`Timeout: ${label}`);}
async function shot(page,name){const path=`${output}/screenshots/${name}.png`;await page.screenshot({path,fullPage:true});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));result.screenshots.push(path);}
async function api(page,path,body){const method=body===undefined?'GET':'POST';const response=await page.request.fetch(`${base}${path}`,{method,...(body===undefined?{}:{data:body})});network('test_driver',path,method,response.status(),body);assert.ok(response.ok(),`${path}: HTTP ${response.status()}`);return response.json();}
async function session(browser,name,video=true){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',...(video?{recordVideo:{dir:`${output}/recordings`,size:{width:390,height:844}}}:{})});
 const page=await context.newPage();let tripId;
 await page.exposeFunction('__beaconObservedStage',stage=>{result.uiStages.push({name,stage});});
 await page.addInitScript(()=>{let last;const observe=()=>{const stage=document.querySelector('[data-backend="atomic"][data-stage]')?.getAttribute('data-stage');if(stage&&stage!==last){last=stage;void window.__beaconObservedStage(stage).catch(()=>{});}};const start=()=>{new MutationObserver(observe).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage']});observe();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();});
 page.on('pageerror',error=>result.errors.push({name,message:error.message}));
 page.on('console',message=>{if(message.type()==='error')result.errors.push({name,message:message.text()});});
 page.on('requestfailed',request=>{const url=new URL(request.url()),entry={name,path:url.pathname,method:request.method(),error:request.failure()?.errorText};const expectedGetCancellation=entry.error==='net::ERR_ABORTED'&&entry.method==='GET'&&(request.isNavigationRequest()||url.searchParams.has('_rsc')||/\/api\/trips\/[^/]+\/journey$/.test(url.pathname));if(expectedGetCancellation)result.abortedRequests.push({...entry,classification:'navigation_or_journey_read_cancellation'});else result.failedRequests.push(entry);});
 page.on('response',async response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/')){let body;try{body=response.request().postDataJSON();}catch{}network('student_ui',url.pathname,response.request().method(),response.status(),body);}if(url.pathname==='/api/trips'&&response.request().method()==='POST'&&response.status()===201){tripId=(await response.json()).id;}if(url.pathname.endsWith('/journey')&&response.ok()){try{const view=await response.json();result.planning.push({name,state:view.trip?.state,phase:view.planning?.phase,messageCode:view.planning?.messageCode});}catch{}}if(url.pathname.startsWith('/api/')&&response.status()>=500)result.httpFailures.push({name,path:url.pathname,status:response.status()});});
 await page.goto(`${base}/demo`);
 await page.getByRole('link',{name:'Get started'}).waitFor();await shot(page,`${name}-onboarding-welcome`);
 await page.getByRole('link',{name:'Get started'}).click();
 await page.getByRole('button',{name:/Set as home/}).waitFor();await shot(page,`${name}-onboarding-home`);
 await page.getByRole('button',{name:/Set as home/}).click();
 if(name==='walking')await page.getByRole('switch',{name:'Less walking',exact:true}).click();
 await page.getByRole('button',{name:'Save and continue'}).waitFor();await shot(page,`${name}-onboarding-preferences`);
 await page.getByRole('button',{name:'Save and continue'}).click();
 await page.getByRole('button',{name:'Get me home',exact:true}).waitFor();
 const pairing=await backend.post('pairing',{});
 // Pair this isolated browser session before the journey begins; the consumer UI stays clean.
 await api(page,'/api/demo/planner/pair',{code:pairing.code});
 await page.getByRole('button',{name:'Get me home',exact:true}).click();
 await waitFor(()=>tripId,'UI creates trip');
 const view=()=>api(page,`/api/trips/${tripId}/journey`);
 await waitFor(async()=>(await view()).planning?.phase==='ready','planner ready');
 await page.locator('[data-stage="recommendation"]').waitFor({timeout:30000});
 await shot(page,`${name}-offer`);
 check(`${name}: healthy planning never flashes an error screen`,!result.uiStages.some(entry=>entry.name===name&&entry.stage==='slow-request'));
 check(`${name}: onboarding and UI create a real backend trip`,Boolean(tripId));
 return{name,context,page,view,id:()=>tripId,async finish(){if(video){const path=await page.video().path();await context.close();const target=`${output}/recordings/${name}.webm`;await rename(path,target);result.recordings.push(target);}else await context.close();}};
}
async function ride(s){let v=await s.view();if(v.journey.complete?.selected.kind!=='ride'){await api(s.page,`/api/demo/trips/${s.id()}/scenario`,{variant:'lighting_outage',journeyRevision:v.journey.revision});
 await api(s.page,`/api/trips/${s.id()}/planning`,{});await waitFor(async()=>{v=await s.view();return v.planning?.phase==='ready'&&v.journey.complete?.selected.kind==='ride';},'ride recommendation');await s.page.locator('[data-stage="replacement-selected"]').waitFor({timeout:30000});}
 await s.page.getByRole('button',{name:'Confirm this plan',exact:true}).waitFor();
 await confirm(s);
 await waitFor(async()=>(await s.view()).trip.state==='WAITING_FOR_PICKUP','confirmed ride');
 await s.page.locator('[data-stage="waiting-initial"],[data-stage="waiting-replacement"]').waitFor({timeout:30000});
 check('consent through UI creates provider booking',Boolean((await s.view()).ride?.vehicle?.licensePlate));
}
async function confirm(s){
 const confirmation=s.confirmationCount=(s.confirmationCount??0)+1;
 let releaseVerify,releaseRequest;const verifyGate=new Promise(resolve=>{releaseVerify=resolve;});const requestGate=new Promise(resolve=>{releaseRequest=resolve;});
 const verifyPath=`**/api/trips/${s.id()}/verify`,requestPath=`**/api/trips/${s.id()}/request`;
 await s.page.route(verifyPath,async route=>{await verifyGate;await route.continue();});await s.page.route(requestPath,async route=>{await requestGate;await route.continue();});
 try{await s.page.getByRole('button',{name:'Confirm this plan',exact:true}).click();await s.page.locator('[data-stage="verifying-initial"],[data-stage="verifying-replacement"]').waitFor({timeout:30000});await shot(s.page,`${s.name}-${confirmation}-verification-pending`);releaseVerify();await s.page.locator('[data-stage="coordinating-initial"],[data-stage="coordinating-replacement"]').waitFor({timeout:30000});await shot(s.page,`${s.name}-${confirmation}-request-pending`);}finally{releaseVerify();releaseRequest();}
 await waitFor(async()=>(await s.view()).trip.state==='WAITING_FOR_PICKUP','confirmed pickup');await s.page.unroute(verifyPath);await s.page.unroute(requestPath);
}
async function advance(s,stage){await api(s.page,`/api/demo/trips/${s.id()}/advance-ride`,{stage,...(stage==='approaching'?{pickupEtaSeconds:90}:{})});if(stage!=='cancelled'){await waitFor(async()=>(await s.view()).ride?.stage===stage,`ride ${stage}`);const view=await s.view();const finalWalk=stage==='completed'&&view.journey.legs.find(leg=>leg.id===view.journey.nextStep?.legId)?.kind==='walk';const headings={approaching:'Your ride is close.',arrived:'Your ride is here.',in_trip:'On the way home.',completed:finalWalk?'Walk home.':'Are you home?'};await s.page.getByRole('heading',{name:headings[stage],exact:true}).waitFor({timeout:30000});check(`backend ${stage}${finalWalk?' final walk':''} is visibly rendered`,true);await shot(s.page,`${s.name}-${stage}`);}}
async function arrive(s){const sequence=['approaching','arrived','in_trip','completed'];const current=(await s.view()).ride?.stage;const start=Math.max(0,sequence.indexOf(current)+1);for(const stage of sequence.slice(start))await advance(s,stage);await s.page.getByRole('button',{name:'I’m home',exact:true}).click();await waitFor(async()=>(await s.view()).trip.state==='ARRIVED','arrival');await s.page.locator('[data-stage="arrival"]').waitFor({timeout:30000});await s.page.getByRole('heading',{name:'You’re home.',exact:true}).waitFor({timeout:30000});check(`${s.name}: arrival remains in the unified map shell`,await s.page.getByTestId('ride-status').count()===1&&await s.page.getByRole('img',{name:/Static campus route/}).count()===1);}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const normal=await session(browser,'normal');
 const stale=await normal.view();const rejected=await normal.page.request.post(`${base}/api/trips/${normal.id()}/confirm`,{data:{planId:stale.journey.selectedPlanId,journeyRevision:Math.max(0,stale.journey.revision-1)}});
 check('stale consent revision is rejected',rejected.status()===409);
 const outsider=await browser.newContext();const inaccessible=await outsider.request.get(`${base}/api/trips/${normal.id()}/journey`);check('another browser cannot read owned trip',[401,403,404].includes(inaccessible.status()));await outsider.close();
 await ride(normal);await shot(normal.page,'normal-pickup');
 check('active ride uses the unified map shell',await normal.page.getByTestId('ride-status').count()===1&&await normal.page.getByRole('img',{name:/Static campus route/}).count()===1);
 check('normal ride hides presenter controls',await normal.page.getByRole('button',{name:/Presenter/}).count()===0);
 check('simulated ride disclosure is concise',await normal.page.getByText('Simulation',{exact:true}).count()===1&&await normal.page.getByText(/Beacon simulation only/).count()===0);
 const before=await normal.view();await normal.page.reload();await normal.page.locator('[data-stage="waiting-initial"],[data-stage="waiting-replacement"]').waitFor({timeout:30000});
 check('refresh restores same backend trip',before.trip.id===(await normal.view()).trip.id);
 check('waiting ride has no walking map',await normal.page.getByTestId('walking-route-map').count()===0);
 for(const [width,height] of [[360,800],[390,844],[393,852],[430,932],[1440,900]]){await normal.page.setViewportSize({width,height});check(`${width}x${height} has no horizontal overflow`,await normal.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(normal.page,`pickup-${width}`);}
 await normal.page.goto(`${base}/demo?walkthrough=1&presenter=1`);await normal.page.getByRole('button',{name:'Presenter: Show ride approaching',exact:true}).click();await normal.page.getByRole('heading',{name:'Your ride is close.',exact:true}).waitFor({timeout:30000});check('presenter Next advances the owner-scoped backend ride in place',(await normal.view()).ride?.stage==='approaching'&&await normal.page.getByTestId('ride-status').count()===1);
 await normal.page.goto(`${base}/demo?walkthrough=1`);check('presenter controls disappear again on the normal URL',await normal.page.getByRole('button',{name:/Presenter/}).count()===0);
 await normal.page.setViewportSize({width:390,height:844});await arrive(normal);await shot(normal.page,'normal-arrival');check('normal UI reaches backend arrival',true);await normal.page.getByRole('button',{name:'Finish',exact:true}).click();await normal.page.getByRole('button',{name:'Get me home',exact:true}).waitFor();await shot(normal.page,'normal-finished-home');check('Finish returns Home',true);await normal.finish();
 const recovery=await session(browser,'recovery');await ride(recovery);const old=(await recovery.view()).trip.selectedPlan.providerId;
 await advance(recovery,'cancelled');await waitFor(async()=>{const v=await recovery.view();return v.journey.complete?.selected&&v.trip.selectedPlan?.providerId!==old;},'replacement planning');
 await recovery.page.locator('[data-stage="replacement-selected"]').waitFor({timeout:30000});check('replacement waits for fresh consent',(await recovery.view()).trip.state!=='WAITING_FOR_PICKUP');await shot(recovery.page,'replacement-consent');
 await confirm(recovery);await arrive(recovery);await shot(recovery.page,'replacement-arrival');await recovery.finish();
 const cancel=await session(browser,'cancellation');await ride(cancel);let releaseCancel;const cancellationGate=new Promise(resolve=>{releaseCancel=resolve;});const cancellationPath=`**/api/trips/${cancel.id()}/cancel`;await cancel.page.route(cancellationPath,async route=>{await cancellationGate;await route.continue();});
 try{await cancel.page.getByRole('button',{name:'Cancel',exact:true}).click();await cancel.page.getByRole('button',{name:'Request cancellation',exact:true}).last().click();await cancel.page.locator('[data-stage="cancelling"]').waitFor({timeout:30000});check('cancellation remains pending while request is in flight',(await cancel.view()).cancellation?.status!=='resolved');await shot(cancel.page,'cancellation-pending');}finally{releaseCancel();}
 await waitFor(async()=>(await cancel.view()).cancellation?.status==='resolved','cancellation response');await cancel.page.locator('[data-stage="cancelled"]').waitFor({timeout:30000});await cancel.page.unroute(cancellationPath);await cancel.page.reload();await cancel.page.locator('[data-stage="cancelled"]').waitFor({timeout:30000});await shot(cancel.page,'cancellation');check('UI cancellation restores backend terminal response after reload',true);await cancel.finish();
 const walking=await session(browser,'walking',false);check('baseline walking recommendation is backend supplied',(await walking.view()).journey.complete?.selected.kind==='walk');await walking.page.getByRole('button',{name:'Confirm walking plan',exact:true}).click();await walking.page.getByTestId('walking-route-map').waitFor({timeout:30000});await shot(walking.page,'walking-route');check('active walking displays backend route',true);await walking.finish();
 const overdue=await session(browser,'overdue',false);await ride(overdue);await api(overdue.page,`/api/demo/trips/${overdue.id()}/expire-deadline`,{});const overdueView=await overdue.view();check('overdue does not claim a message without a consented destination',overdueView.notification===null||['not_requested','not_configured','skipped'].includes(overdueView.notification?.state));await overdue.page.locator('[data-stage="overdue"]').waitFor({timeout:30000});await shot(overdue.page,'overdue');await overdue.finish();
 check('healthy journeys never render a slow-request error',!result.uiStages.some(entry=>entry.stage==='slow-request'));check('no page or console errors',result.errors.length===0);check('no failed browser requests',result.failedRequests.length===0);check('no server errors',result.httpFailures.length===0);result.status='passed';
}catch(error){result.status='failed';result.failure=error.message;const pages=browser.contexts().flatMap(context=>context.pages());if(pages.length)await shot(pages.at(-1),'failure').catch(()=>{});throw error;}finally{for(const context of browser.contexts())await context.close().catch(()=>{});await browser.close();result.finishedAt=new Date().toISOString();await writeFile(`${output}/browser-results.json`,JSON.stringify(result,null,2));}
