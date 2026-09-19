import assert from 'node:assert/strict';
import { connectPlanner } from '../tools/beacon-laptop-worker/client.mjs';
import { Backend, Worker } from '../tools/beacon-laptop-worker/worker.mjs';

const base=process.env.BEACON_SMOKE_URL??'http://127.0.0.1:3123';
const backend=new Backend(base,process.env.BEACON_PLANNER_WORKER_TOKEN);
let cookie='',worker;
async function call(path,body,expected=200,authenticated=true){
 const response=await fetch(`${base}${path}`,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(authenticated&&cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const set=response.headers.get('set-cookie');if(set&&authenticated)cookie=set.split(';')[0];
 const value=await response.json();assert.equal(response.status,expected,`Unexpected response for ${path}: ${response.status} ${value.error?.code??''}`);return value;
}
async function create(){return call('/api/trips',{journeyContract:'beacon-journey-v1',preferences:{maxBudget:10,walkingPreference:'minimize',transferPreference:'minimize'},temporary_context:{exhausted:true}},201);}
async function ready(id){
 for(let step=0;step<6;step++){
  await worker.step();
  const evidence=await call(`/api/trips/${id}/evidence`);
  if(evidence.planning?.phase==='ready')return evidence;
  if(['unavailable','needs_input'].includes(evidence.planning?.phase))throw Error(`PLANNING_${evidence.planning.messageCode}`);
 }
 throw Error('PLANNING_DID_NOT_FINISH');
}
async function approve(id){
 const journey=await call(`/api/trips/${id}/journey`),offer=journey.journey.selectedOffer;
 assert.ok(offer,'Simulated network offer required');
 await call(`/api/trips/${id}/confirm`,{planId:journey.journey.selectedPlanId,quoteId:offer.quoteId,journeyRevision:journey.journey.revision});
 await call(`/api/trips/${id}/verify`,{});
 return call(`/api/trips/${id}/request`,{});
}
try{
 const pairing=await backend.post('pairing',{});
 await call('/api/demo/planner/pair',{code:pairing.code});
 const trip=await create();
 await call(`/api/trips/${trip.id}/activity`,undefined,401,false);
 await call(`/api/trips/${trip.id}/planning`,{},401,false);
 await call(`/api/trips/${trip.id}/request`,{},409);
 const fixture=process.env.BEACON_SMOKE_FIXTURE_MODEL==='true';
 const planner=fixture?{model:'gpt-5.6-sol',close:async()=>{},run:async(role,input)=>role==='student-intent'?{objective:'get_home',priorities:['minimize_walking'],evidenceRequests:[{topic:'weather'},{topic:'lighting'},{topic:'waiting_places'}],clarification:null}:{snapshotId:input.snapshotId,selectedPlanId:input.selectedPlanId,sentences:input.facts.slice(0,3).map(f=>({text:f.text,factIds:[f.id]}))}}:await connectPlanner();
 worker=new Worker(backend,planner);
 await call(`/api/trips/${trip.id}/planning`,{},202);
 const first=await ready(trip.id);
 if(!fixture)assert.equal(first.planning.explanationSource,'llm_grounded','Real-model acceptance requires a validated grounded explanation, not only fallback');
 const activity=await call(`/api/trips/${trip.id}/activity`);
 // Context lookup is a bounded model choice; the fixture deliberately requests it.
 for(const op of ['planner.intent','provider.quote',...(fixture?['context.query']:[]),'decision.evaluate','planner.explain'])assert.ok(activity.events.some(e=>e.operation===op),`Missing real boundary ${op}`);
 const contextObserved=activity.events.some(e=>e.operation==='context.query');
 assert.ok(activity.events.some(e=>e.operation==='planner.intent'&&e.phase==='response'));
 const old=await call(`/api/trips/${trip.id}/journey`);
 assert.equal((await approve(trip.id)).state,'WAITING_FOR_PICKUP');
 const replacement=await call(`/api/demo/trips/${trip.id}/cancel-provider`,{});
 assert.equal(replacement.state,'SELECTED');
 await call(`/api/trips/${trip.id}/request`,{},409);
 await call(`/api/trips/${trip.id}/confirm`,{planId:old.journey.selectedPlanId,quoteId:old.journey.selectedOffer.quoteId,journeyRevision:old.journey.revision},409);
 const payment=await call(`/api/trips/${trip.id}/evidence`);
 assert.ok(payment.coordination.payments.some(p=>p.state==='voided'));
 // A new snapshot needs its own explanation; no stale result is reused.
 await call(`/api/trips/${trip.id}/planning`,{},202);await ready(trip.id);
 assert.equal((await approve(trip.id)).state,'WAITING_FOR_PICKUP');
 // Location-driven home arrival, not a manual check-in or a driver completion.
 const home={lat:37.221,lng:-80.420};
 const uncertain=await call(`/api/trips/${trip.id}/location`,{...home,accuracyMeters:100,recordedAt:new Date().toISOString()});
 assert.notEqual(uncertain.state,'ARRIVED');
 let arrived;
 for(let sample=0;sample<3;sample++){
  await new Promise(resolve=>setTimeout(resolve,sample===0?10:15010));
  arrived=await call(`/api/trips/${trip.id}/location`,{...home,accuracyMeters:10,recordedAt:new Date().toISOString()});
  if(sample<2)assert.notEqual(arrived.state,'ARRIVED');
 }
 assert.equal(arrived.state,'ARRIVED');assert.equal(arrived.sensitiveDataReleased,false);
 await worker.stop();
 const offline=await create();await call(`/api/trips/${offline.id}/planning`,{},202);
 await new Promise(resolve=>setTimeout(resolve,36000));
 assert.equal((await call(`/api/trips/${offline.id}/evidence`)).planning.worker,'offline');
 console.log(JSON.stringify({status:'passed',modelInference:fixture?'fixture_only':'codex_subscription',model:planner.model,explanationSource:first.planning.explanationSource,contextLookup:contextObserved?'observed':'not_requested',transport:'simulated',payment:'simulated',identity:'local_demo_or_verified_as_recorded',notifications:'no_contact_supplied',checks:['paired_owner','anonymous_denied','real_HTTP_quotes',...(contextObserved?['context_boundary']:[]),'decision','stale_consent_rejected','cancellation_reconciliation','fresh_confirmation','accurate_location_dwell_arrival','worker_disconnect']}));
}finally{
 await worker?.stop();
 if(cookie)await call('/api/demo/reset',{}).catch(()=>{});
}
