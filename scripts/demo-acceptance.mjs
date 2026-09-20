import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DemoClient,receipt} from './demo-client.mjs';
import {connectPlanner} from '../tools/beacon-laptop-worker/client.mjs';
import {Worker} from '../tools/beacon-laptop-worker/worker.mjs';

const client=new DemoClient(process.env.BEACON_BACKEND_URL,process.env.BEACON_PLANNER_WORKER_TOKEN);
const fixture=process.env.BEACON_SMOKE_FIXTURE_MODEL==='true';
const planner=fixture?{model:'gpt-5.6-sol',close:async()=>{},run:async(role,input)=>role==='student-intent'?{objective:'get_home',priorities:['minimize_walking'],evidenceRequests:[{topic:'lighting'},{topic:'waiting_places'}],clarification:null}:{snapshotId:input.snapshotId,selectedPlanId:input.selectedPlanId,sentences:[...input.facts.filter(f=>f.id.startsWith('limitation_')),...input.facts.filter(f=>!f.id.startsWith('limitation_'))].slice(0,4).map(f=>({text:f.text,factIds:[f.id]}))}}:await connectPlanner();
const worker=new Worker(client.backend,planner),receipts=[];
const plan=id=>client.plan(id,()=>worker.step());
function record(name,view){receipts.push({name,...receipt(view)});console.log(JSON.stringify({check:name,...receipt(view)}));}
function complete(view){const result=view.journey.complete;assert.equal(result.status,'RECOMMENDED');assert.equal(result.demoScenario.synthetic,true);assert.ok(result.alternatives.length<=3);if(process.env.BEACON_DEMO_EXPECT_DATABRICKS==='true')assert.equal(result.execution.engine,'databricks','Native Databricks must actually execute');return result;}
try{
  await client.pair();
  const trip=await client.create();let view=await plan(trip.id);
  assert.equal(complete(view).selected.kind,'walk');assert.ok(view.navigation?.googleMapsUrl);assert.equal(view.journey.nextStep.showMap,true);
  assert.ok(complete(view).alternatives.some(j=>j.kind==='bus'),'Demo timetable must produce a direct-bus alternative');
  const baselineWalkingSeconds=complete(view).selected.walkingSeconds;
  if(!fixture)assert.equal(view.planning.explanationSource,'llm_grounded');
  record('baseline_walk',view);
  const baselineRevision=view.journey.revision;
  await client.scenario(trip.id,'lighting_outage');view=await plan(trip.id);
  assert.equal(complete(view).selected.kind,'ride');assert.equal(view.navigation,null);assert.ok(view.journey.revision>baselineRevision);
  record('lighting_changes_recommendation',view);
  assert.equal((await client.approve(trip.id)).state,'WAITING_FOR_PICKUP');
  view=await client.journey(trip.id);assert.equal(view.ride.stage,'assigned');assert.ok(view.ride.vehicle.licensePlate);
  const firstProvider=view.trip.selectedPlan.providerId;
  await client.advance(trip.id,'approaching');view=await client.journey(trip.id);assert.equal(view.ride.pickupEtaSeconds,90);
  await client.advance(trip.id,'cancelled');view=await plan(trip.id);
  assert.equal(complete(view).selected.kind,'ride');assert.notEqual(view.trip.selectedPlan.providerId,firstProvider);
  await client.call(`/api/trips/${trip.id}/request`,{},409);
  record('cancellation_replans_within_budget',view);
  await client.approve(trip.id);
  for(const stage of ['approaching','arrived','in_trip','completed']){await client.advance(trip.id,stage);view=await client.journey(trip.id);assert.equal(view.ride.stage,stage);}
  assert.notEqual(view.trip.state,'ARRIVED');record('ride_complete_requires_location',view);
  for(let i=0;i<3;i++){if(i)await new Promise(resolve=>setTimeout(resolve,15010));await client.call(`/api/trips/${trip.id}/location`,{lat:37.221,lng:-80.420,accuracyMeters:5,recordedAt:new Date().toISOString()});}
  view=await client.journey(trip.id);assert.equal(view.trip.state,'ARRIVED');assert.equal(view.journey.complete,null);record('location_arrival_clears_private_journey',view);
  const budget=await client.create({budget:0,minimize:true});view=await plan(budget.id);assert.equal(complete(view).selected.costMinor,0);assert.equal(complete(view).selected.kind,'ride');assert.ok(complete(view).selected.walkingSeconds<baselineWalkingSeconds);record('zero_budget_and_less_walking',view);
  await client.approve(budget.id);await client.call(`/api/demo/trips/${budget.id}/expire-deadline`,{});view=await client.journey(budget.id);assert.equal(view.notification.state,'simulated');record('overdue_contact_alert',view);
  const output={status:'passed',checkedAt:new Date().toISOString(),model:fixture?'fixture':planner.model,modelInference:fixture?'fixture_only':'codex_subscription',data:'synthetic_demo_scenario',rides:'simulated',notifications:'simulated',receipts};
  await writeFile(join(process.env.BEACON_STATE_DIR,'demo-acceptance.json'),JSON.stringify(output,null,2),{mode:0o600});
  console.log(JSON.stringify({status:'passed',checks:receipts.map(r=>r.name),receipt:join(process.env.BEACON_STATE_DIR,'demo-acceptance.json')}));
}finally{await worker.stop();await client.call('/api/demo/reset',{}).catch(()=>{});}
