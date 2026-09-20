import test from 'node:test';
import assert from 'node:assert/strict';
import { StudentAgent, type Dependencies } from './student/service';
import { MemoryTripStore } from '../lib/trip-state/store';
import { LocalDemoDirectory } from '../integrations/ans/directory';
import { demoDescriptors } from './demo-provider';
import { normalizeQuote, type ProviderAgent, type ProviderTrip, type TripRequest } from './contract';
import type { NetworkOffer } from './provider-manifest';
import { planJourney, type JourneyDependencies } from '../lib/decision-client/journey-planner';
import type { JourneyRequest, JourneyResult, JourneyPlace, JourneyRide } from '../lib/decision-client/journey-types';
import { distanceMeters } from '../lib/decision-client/walking-router';
import { ActivityStore, emptyActivity } from '../lib/agent-activity/store';
import { MemoryJsonStore } from '../lib/planner/store';

const origin: JourneyPlace = { id:'public-origin', name:'Fixture campus origin', point:{lat:37.2288,lng:-80.4192} };
const home: JourneyPlace = { id:'public-home', name:'Fixture campus home', point:{lat:37.222,lng:-80.42} };
type Binding = Omit<JourneyRide,'offer'>;
function setup(mode: 'walk'|'bus'|'ride' = 'walk', binding = true) {
  let now=Date.parse('2026-09-19T21:00:00.000Z'), serial=0, notices=0;
  const store=new MemoryTripStore(), requests:JourneyRequest[]=[], bookings:TripRequest[]=[], statuses=new Map<string,ProviderTrip>(), outcomes:unknown[]=[];
  const descriptors=mode==='ride'?demoDescriptors.filter(p=>p.mode==='campus_ride'):[];
  const directory=new LocalDemoDirectory(descriptors,true);
  const iso=(seconds=0)=>new Date(now+seconds*1000).toISOString();
  const planner:JourneyDependencies={
    route:async(a,b,at)=>{const seconds=distanceMeters(a,b)>400&&mode!=='walk'?1800:60;return {routeId:`fixture:${a.lat}:${b.lat}`,from:a,to:b,geometry:{type:'LineString',coordinates:[[a.lng,a.lat],[b.lng,b.lat]]},distanceMeters:distanceMeters(a,b),durationSeconds:seconds,instructions:[{text:'Follow the fixture path.',distanceMeters:distanceMeters(a,b),durationSeconds:seconds}],provider:'fixture_only',capturedAt:at,validUntil:new Date(Date.parse(at)+300000).toISOString()};},
    evidence:()=>({blocked:false,validUntil:null,facts:[],unknowns:['LIGHTING_UNKNOWN']}),
    ...(mode==='bus'?{stops:[{...origin,id:'s1'},{...home,id:'s2'}],directTransit:async(q)=>({candidate:{planId:'bus',providerId:'bt',providerName:'Scheduled bus',mode:'transit',available:true,cost:0,waitMinutes:3,travelMinutes:5,walkingMinutes:0,totalMinutes:8,transfers:0,requiresProviderVerification:false},signals:{source:'scheduled',collectedAt:iso(),validUntil:iso(120)},source:{sourceSha256:'a'.repeat(64),capturedAt:iso(),serviceDate:'2026-09-19',tripId:'trip-1',routeId:'PHD',fromStopId:q.fromStopId,toStopId:q.toStopId,departureAt:iso(180),arrivalAt:iso(480),walkingSource:'mapped'},statementId:'fixture-statement',warnings:[]})} satisfies Partial<JourneyDependencies>:{}),
  };
  const deps:Dependencies={store,directory:{discover:()=>directory.discover(),verify:async p=>({...await directory.verify(p),validUntil:now+60000})},demo:true,clock:()=>now,
    provider:(descriptor):ProviderAgent=>({descriptor,quote:async()=>{
      const network:NetworkOffer={manifest:{profileVersion:'beacon-mobility-v2',providerId:descriptor.id,serviceId:descriptor.id,operatorName:'Fixture operator',operatorAnsId:null,endpoint:descriptor.baseUrl,mode:descriptor.mode,capabilities:descriptor.functions,serviceArea:{originZones:['Downtown Blacksburg'],destinationZones:['VT residential campus']},executionMode:'simulated',authorization:'beacon-hmac-v1',payment:'simulated-usd-v1'},offer:{profileVersion:'beacon-mobility-v2',quoteId:`quote-${++serial}`,providerId:descriptor.id,serviceId:descriptor.id,issuedAt:iso(),expiresAt:iso(120),available:true,price:{currency:'USD',totalMinor:200,kind:'fixed',feesIncluded:true},cancellation:{feeMinor:100},pickup:{instructions:'Fixture only.',accessVerified:false},waitMinutes:3,travelMinutes:5,walkingMinutes:0,simulated:true}};
      return {...normalizeQuote({provider_id:descriptor.id,available:true,cost:2,simulated:true,pickup_eta_minutes:3,travel_time_minutes:5,walking_minutes:0,expires_at:iso(120)},descriptor,now),planId:`${descriptor.id}:${serial}`,network};
    },requestTrip:async request=>{bookings.push(structuredClone(request));const response:ProviderTrip={id:request.tripId,status:'waiting',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'authorized'}};statuses.set(response.id,response);return structuredClone(response);},getStatus:async id=>structuredClone(statuses.get(id)!),cancelTrip:async id=>{const result:ProviderTrip={id,status:'cancelled',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:100,state:'captured'}};statuses.set(id,result);return result;}}),
    recommend:async plans=>({selectedPlanId:plans[0].planId,reasonCodes:['LEGACY'],explanation:'Legacy fixture',evaluatedAt:iso()}),
    notify:async()=>{notices++;return{id:'fixture-notice',simulated:true};},recordOutcome:async value=>{outcomes.push(value);},
  };
  Object.assign(deps,{getCompleteJourney:async(request:JourneyRequest)=>{requests.push(structuredClone(request));return planJourney(request,planner);},journeyRideBinding:async(network:NetworkOffer):Promise<Binding|null>=>binding?{pickup:origin,dropoff:home,pickupAt:new Date(Date.parse(network.offer.issuedAt)+network.offer.waitMinutes*60000).toISOString(),arrivalAt:new Date(Date.parse(network.offer.issuedAt)+(network.offer.waitMinutes+network.offer.travelMinutes)*60000).toISOString(),pickupPermitted:true}:null});
  const agent=new StudentAgent(deps);
  const start=async()=>{const trip=await agent.create('owner',{journeyContract:'beacon-journey-v1',origin:origin.point,preferences:{home:home.point,maxBudget:10,trustedContact:{name:'Fixture',telegramChatId:'123456',consent:true,shareLocation:false}}});await agent.act(trip.id,'owner','discover');await agent.act(trip.id,'owner','evaluate');return trip.id;};
  const view=(id:string)=>agent.journey(id,'owner');
  const confirm=async(id:string)=>{const v=await view(id);return agent.act(id,'owner','confirm',{journeyRevision:v.journey.revision,planId:v.trip.selectedPlan!.planId,quoteId:v.journey.selectedOffer?.quoteId});};
  const book=async(id:string)=>{await confirm(id);await agent.act(id,'owner','verify');await agent.act(id,'owner','request');};
  return {agent,deps,store,start,view,confirm,book,requests,bookings,statuses,outcomes,notices:()=>notices,advance:(ms:number)=>{now+=ms;},iso,planner};
}
const complete=(view:Awaited<ReturnType<StudentAgent['journey']>>)=>(view.journey as unknown as {complete:JourneyResult|null}).complete;

test('scenario changes are owner scoped, revision bound, and require fresh consent',async()=>{
  const s=setup('ride');s.deps.demoScenarioEnabled=true;
  const id=await s.start(),before=await s.view(id);
  await assert.rejects(s.agent.act(id,'other','scenario',{variant:'rain',journeyRevision:before.journey.revision}),{code:'TRIP_NOT_FOUND'});
  await assert.rejects(s.agent.act(id,'owner','scenario',{variant:'rain',journeyRevision:0}),{code:'JOURNEY_CHANGED'});
  await s.agent.act(id,'owner','scenario',{variant:'lighting_outage',journeyRevision:before.journey.revision});
  assert.equal(s.requests.at(-1)?.demoScenarioVariant,'lighting_outage');
  assert.equal(s.requests.at(-1)?.objectiveVersion,1);
  assert.notEqual((await s.view(id)).journey.revision,before.journey.revision);
  await assert.rejects(s.agent.act(id,'owner','request'),{code:'CONFIRMATION_REQUIRED'});
  s.deps.demoScenarioEnabled=false;
  await assert.rejects(s.agent.act(id,'owner','scenario',{variant:'rain',journeyRevision:(await s.view(id)).journey.revision}),{code:'DEMO_DISABLED'});
});

test('operator ride progress reaches the journey response and completion is not home arrival',async()=>{
  const s=setup('ride');const id=await s.start();await s.book(id);
  let calls=0;
  s.deps.advanceDemoRide=async(_provider,bookingId,stage)=>{
    calls++;return{id:bookingId,status:stage==='in_trip'||stage==='completed'?stage:'waiting',
      details:{stage:stage as 'approaching'|'arrived'|'in_trip'|'completed',driver:{displayName:'Demo driver'},vehicle:{make:'Demo',model:'Shuttle',color:'Maroon',licensePlate:'DEMO-01'},updatedAt:s.iso()},
      payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:stage==='completed'?200:0,state:stage==='completed'?'captured':'authorized'}};
  };
  await assert.rejects(s.agent.act(id,'other','advance-ride',{stage:'approaching'}),{code:'TRIP_NOT_FOUND'});
  for(const stage of ['approaching','arrived','in_trip','completed']){s.advance(1000);await s.agent.act(id,'owner','advance-ride',{stage});assert.equal((await s.view(id)).ride?.stage,stage);}
  assert.equal(calls,4);assert.equal((await s.view(id)).trip.state,'NAVIGATING');
  assert.equal((await s.view(id)).ride?.vehicle?.licensePlate,'DEMO-01');
  assert.equal((await s.view(id)).coordination.remainingBudgetMinor,800);
});

test('earlier provider ETA advances indoor wait into the pickup walk and accepts fresh location',async()=>{
  const s=setup('ride'),bind=s.deps.journeyRideBinding!;
  const pickup={...origin,point:{lat:origin.point.lat-0.0005,lng:origin.point.lng}};
  s.deps.journeyRideBinding=async network=>({...await bind(network)!,pickup} as Binding);
  const id=await s.start();await s.book(id);s.advance(1000);
  const booking=s.bookings[0].tripId;
  s.statuses.set(booking,{id:booking,status:'waiting',details:{stage:'approaching',pickupEtaSeconds:30,updatedAt:s.iso()},payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'authorized'}});
  await s.agent.monitor();assert.equal((await s.view(id)).journey.nextStep?.showMap,true);
  await s.agent.act(id,'owner','location',{...pickup.point,accuracyMeters:5,recordedAt:s.iso()});
  assert.equal((await s.view(id)).journey.nextStep?.showMap,false);
});

test('complete journey preserves disclosed drinking context as walking preference, not inability',async()=>{
  const s=setup();
  const trip=await s.agent.create('owner',{journeyContract:'beacon-journey-v1',origin:origin.point,preferences:{home:home.point,maxBudget:10,walkingPreference:'normal'},temporary_context:{has_been_drinking:true}});
  await s.agent.act(trip.id,'owner','discover');await s.agent.act(trip.id,'owner','evaluate');
  assert.equal(s.requests[0].minimizeWalking,true);
  assert.notEqual(s.requests[0].cannotWalk,true);
});

test('complete walking journey becomes the atomic selection with exact route evidence',async()=>{
  const s=setup(),id=await s.start(),v=await s.view(id);
  assert.equal(s.requests.length,1);assert.equal(v.trip.selectedPlan?.mode,'walk');
  assert.equal(complete(v)?.selected?.kind,'walk');assert.equal(v.journey.legs[0].geometry?.coordinates[0][0],origin.point.lng);
  assert.deepEqual(complete(v)?.selected?.unknowns,['LIGHTING_UNKNOWN']);
  await s.book(id);assert.equal((await s.view(id)).trip.state,'NAVIGATING');assert.equal(s.bookings.length,0);
  await assert.rejects(s.agent.journey(id,'other'),{code:'TRIP_NOT_FOUND'});
});
test('native direct bus is selected, retains timetable evidence, and never invokes booking',async()=>{
  const s=setup('bus'),id=await s.start(),v=await s.view(id);
  assert.equal(v.trip.selectedPlan?.mode,'transit');assert.equal(complete(v)?.selected?.kind,'bus');
  assert.equal(complete(v)?.selected?.legs.find(l=>l.kind==='bus')?.transitSource?.statementId,'fixture-statement');
  await s.book(id);assert.equal(s.bookings.length,0);assert.equal((await s.view(id)).trip.state,'NAVIGATING');
});
test('ride binding is explicit, quote consent is exact, and repeated requests do not rebook',async()=>{
  const s=setup('ride'),id=await s.start(),v=await s.view(id);
  assert.equal(complete(v)?.selected?.kind,'ride');assert.equal(s.requests[0].rides?.[0].pickupPermitted,true);
  assert.equal(v.journey.pickup.accessVerified,false,'explicit simulated pickup permission does not assert indoor access');
  await assert.rejects(s.agent.act(id,'owner','confirm',{journeyRevision:v.journey.revision-1}),{code:'JOURNEY_CHANGED'});
  await s.book(id);await s.agent.act(id,'owner','request');assert.equal(s.bookings.length,1);
  assert.deepEqual(s.bookings[0].pickup,origin.point);assert.deepEqual(s.bookings[0].destination,home.point);
});
test('missing binding cannot manufacture a ride from accessVerified false or coordinates',async()=>{
  const s=setup('ride',false),id=await s.start();
  assert.equal(s.requests[0].rides?.length,0);assert.equal(complete(await s.view(id))?.selected?.kind,'walk');
});
test('expired complete selection and changed journey revision cannot authorize booking',async()=>{
  const s=setup(),id=await s.start(),before=await s.view(id);s.advance(121000);
  assert.equal((await s.view(id)).journey.nextStep,null,'expired unstarted instructions cannot be presented as the next action');
  await assert.rejects(s.confirm(id),{code:'QUOTE_EXPIRED'});assert.equal((await s.view(id)).selectionCurrent,false);
  await s.agent.act(id,'owner','discover');await s.agent.act(id,'owner','evaluate');
  await assert.rejects(s.agent.act(id,'owner','confirm',{journeyRevision:before.journey.revision}),{code:'JOURNEY_CHANGED'});
});
test('cancellation replans from updated location, counts settled fees once and requires new consent',async()=>{
  const s=setup('ride'),id=await s.start();await s.book(id);s.advance(1000);
  const moved={lat:37.2285,lng:-80.4193};await s.agent.act(id,'owner','location',{...moved,recordedAt:s.iso(),accuracyMeters:5});
  await s.agent.act(id,'owner','cancel-provider');const request=s.requests.at(-1)!;
  assert.equal(request.objectiveVersion,1);assert.deepEqual(request.origin.point,moved);assert.equal(request.committedMinor,100);assert.equal(request.budgetMinor,1000);assert.equal(request.remainingBudgetMinor,900);
  assert.equal(complete(await s.view(id))?.remainingBudgetMinor,900);assert.equal(s.bookings.length,1);
  await assert.rejects(s.agent.act(id,'owner','request'),{code:'CONFIRMATION_REQUIRED'});
});
test('provider completion flushes its outcome, keeps home arrival distinct and checks deadline once',async()=>{
  const s=setup('ride'),id=await s.start();await s.book(id);
  s.statuses.set(s.bookings[0].tripId,{id:s.bookings[0].tripId,status:'completed',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:200,state:'captured'}});
  await s.agent.monitor();assert.equal(s.outcomes.length,1);assert.equal((await s.view(id)).trip.state,'NAVIGATING');
  s.advance(1000000);await s.agent.monitor();await s.agent.monitor();assert.equal(s.notices(),1);assert.equal((await s.view(id)).trip.state,'OVERDUE');
  await s.agent.act(id,'owner','arrive');assert.equal((await s.view(id)).trip.state,'ARRIVED');assert.equal((await s.store.read(id)).private,undefined);
  assert.equal(complete(await s.view(id)),null,'arrival clears precise journey routes and endpoints');
});

test('provider callbacks and regressive polls cannot reverse an in-progress or completed ride',async()=>{
  const s=setup('ride'),id=await s.start();await s.book(id);const booking=s.bookings[0].tripId;
  await s.agent.providerEvent(id,'campus_ride',booking,'provider.in_trip',{updatedAt:s.iso(),driver:{displayName:'Fixture driver'}});
  s.advance(1000);await s.agent.providerEvent(id,'campus_ride',booking,'provider.assigned',{updatedAt:s.iso()});
  assert.equal((await s.view(id)).trip.state,'IN_TRIP');assert.equal((await s.view(id)).ride?.driver?.displayName,'Fixture driver');
  s.statuses.set(booking,{id:booking,status:'completed',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:200,state:'captured'}});
  await s.agent.monitor();s.advance(1000);
  await s.agent.providerEvent(id,'campus_ride',booking,'provider.cancelled',{updatedAt:s.iso()});
  s.statuses.set(booking,{id:booking,status:'cancelled',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'voided'}});
  await s.agent.monitor();const v=await s.view(id);
  assert.equal(v.trip.state,'NAVIGATING');assert.equal(v.ride?.stage,'completed');assert.equal(v.coordination.remainingBudgetMinor,800);assert.equal(s.requests.length,1);
});

test('a complete result that expires during evaluation cannot reach confirmation',async()=>{
  const s=setup();const evaluate=s.deps.getCompleteJourney!;
  s.deps.getCompleteJourney=async request=>{const result=await evaluate(request);s.advance(121000);return result;};
  await assert.rejects(s.start(),{code:'QUOTE_EXPIRED'});assert.equal(s.bookings.length,0);
});
test('changing bound pickup after confirmation invalidates the accepted revision',async()=>{
  const s=setup('ride'),id=await s.start();await s.confirm(id);await s.agent.act(id,'owner','verify');
  await s.store.update(id,async r=>{r.completeJourney!.selected!.offerLocationBinding!.pickup.point.lat+=0.001;});
  await assert.rejects(s.agent.act(id,'owner','request'),{code:'JOURNEY_CHANGED'});assert.equal(s.bookings.length,0);
});
test('cannot-walk remains a hard constraint and missing routing retains rejection evidence',async()=>{
  const s=setup(),id=await s.start();
  await s.store.update(id,async r=>{r.context.cannotWalk=true;});
  await assert.rejects(s.agent.act(id,'owner','evaluate'),{code:'NO_FEASIBLE_JOURNEY'});
  assert.equal(s.requests.at(-1)?.cannotWalk,true);assert.equal((await s.view(id)).trip.selectedPlan,undefined);
  assert.equal(complete(await s.view(id))?.status,'NO_FEASIBLE_JOURNEY');
});
test('a provider directory outage still permits a complete walking journey',async()=>{
  const s=setup();s.deps.directory.discover=async()=>{throw new Error('Directory unavailable');};
  const id=await s.start();assert.equal(complete(await s.view(id))?.selected?.kind,'walk');await s.book(id);assert.equal(s.bookings.length,0);
});
test('booking keeps evaluated pickup and dropoff, then completion reveals the final walking leg',async()=>{
  const s=setup('ride'),binding=s.deps.journeyRideBinding!;
  const pickup={...origin,id:'fixture-pickup',point:{lat:origin.point.lat-0.0001,lng:origin.point.lng}};
  const dropoff={...home,id:'fixture-dropoff',point:{lat:home.point.lat+0.0001,lng:home.point.lng}};
  s.deps.journeyRideBinding=async network=>({... (await binding(network))!,pickup,dropoff});
  const id=await s.start();s.advance(10000);await s.book(id);
  assert.deepEqual(s.bookings[0].pickup,pickup.point);assert.deepEqual(s.bookings[0].destination,dropoff.point);
  const selected=complete(await s.view(id))!.selected!;
  assert.equal((await s.view(id)).trip.expectedArrivalAt,selected.arrivalAt,'confirmation delay does not shift a fixed quoted arrival');
  s.statuses.set(s.bookings[0].tripId,{id:s.bookings[0].tripId,status:'completed',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:200,state:'captured'}});
  await s.agent.monitor();const v=await s.view(id);
  assert.equal(v.trip.state,'NAVIGATING');assert.equal(v.journey.nextStep?.legId,selected.legs.at(-1)!.id);
  assert.equal(v.journey.legs.at(-1)!.position,'dropoff');assert.equal(v.journey.nextStep?.showMap,true);
  assert.ok(v.journey.legs.filter(l=>l.kind==='ride').every(l=>l.geometry===null));
});
test('complete journey evaluation emits paired decision activity with actual fallback provenance',async()=>{
  const s=setup(),activity=new ActivityStore(()=>storage),storage=new MemoryJsonStore(emptyActivity());
  s.deps.activity=activity;const id=await s.start();
  const events=(await activity.read(id)).events.filter(e=>e.operation==='decision.evaluate');
  assert.deepEqual(events.map(e=>e.phase),['request','response']);assert.equal(events[0].requestId,events[1].requestId);
  assert.equal(events[0].execution,'not_called');assert.equal(events[1].execution,'local_fallback');
  assert.equal(events[1].safeData.engine,'local_fallback');assert.equal(events[1].recipient,'databricks');
  assert.doesNotMatch(JSON.stringify(events),/37\.2288|80\.4192|telegramChatId|pickupPermitted/);
});
test('complete journey evaluation records a sanitized rejection without claiming a live call',async()=>{
  const s=setup(),storage=new MemoryJsonStore(emptyActivity()),activity=new ActivityStore(()=>storage);
  s.deps.activity=activity;s.deps.getCompleteJourney=async()=>{throw new Error('private-planner-failure');};
  await assert.rejects(s.start(),{code:'EVALUATION_FAILED'});
  const events=(await activity.read((await s.store.list())[0])).events.filter(e=>e.operation==='decision.evaluate');
  assert.deepEqual(events.map(e=>e.phase),['request','rejected']);assert.equal(events[0].requestId,events[1].requestId);
  assert.equal(events[1].execution,'not_called');assert.doesNotMatch(JSON.stringify(events),/private-planner-failure/);
});
test('monitor recovers an accepted booking that terminates declined with a confirmed zero liability',async()=>{
  const s=setup('ride'),id=await s.start();await s.book(id);const booking=s.bookings[0].tripId;
  await s.agent.providerEvent(id,'campus_ride',booking,'provider.assigned');
  s.statuses.set(booking,{id:booking,status:'declined',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'voided'}});
  await s.agent.monitor();const r=await s.store.read(id),v=await s.view(id);
  assert.equal(r.booking,undefined);assert.equal(r.replanCount,1);assert.equal(r.networkAttempts?.[0].outcome,'declined');
  assert.equal(v.trip.state,'SELECTED');assert.equal(v.trip.selectedPlan?.mode,'walk');assert.equal(v.coordination.remainingBudgetMinor,1000);
  assert.equal(s.bookings.length,1);assert.ok(r.events.some(e=>e.code==='PROVIDER_DECLINED'));
  await assert.rejects(s.agent.act(id,'owner','request'),{code:'CONFIRMATION_REQUIRED'});
});
test('decline callback requires settled status readback before recovery and never releases an uncertain hold',async()=>{
  const s=setup('ride'),id=await s.start();await s.book(id);const booking=s.bookings[0].tripId;
  s.statuses.set(booking,{id:booking,status:'declined'});
  await assert.rejects(s.agent.providerEvent(id,'campus_ride',booking,'provider.declined'),{code:'SETTLEMENT_UNCERTAIN'});
  await s.agent.monitor();let r=await s.store.read(id);
  assert.ok(r.booking);assert.equal(r.replanCount,0);assert.equal((await s.view(id)).coordination.remainingBudgetMinor,800);
  assert.equal((await s.view(id)).ride?.stage,'cancelled');assert.equal((await s.view(id)).ride?.providerStatus,'declined');
  s.statuses.set(booking,{id:booking,status:'declined',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'voided'}});
  await s.agent.providerEvent(id,'campus_ride',booking,'provider.declined');r=await s.store.read(id);
  assert.equal(r.booking,undefined);assert.equal(r.replanCount,1);assert.equal((await s.view(id)).coordination.remainingBudgetMinor,1000);
});
test('a late declined poll or callback cannot reverse completed payment liability',async()=>{
  const s=setup('ride'),id=await s.start();await s.book(id);const booking=s.bookings[0].tripId;
  s.statuses.set(booking,{id:booking,status:'completed',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:200,state:'captured'}});
  await s.agent.monitor();await s.agent.providerEvent(id,'campus_ride',booking,'provider.declined');
  s.statuses.set(booking,{id:booking,status:'declined',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'voided'}});
  await s.agent.monitor();const r=await s.store.read(id),v=await s.view(id);
  assert.equal(v.ride?.stage,'completed');assert.equal(v.trip.state,'NAVIGATING');assert.equal(r.networkAttempts?.[0].outcome,'completed');
  assert.equal(v.coordination.remainingBudgetMinor,800);assert.equal(r.replanCount,0);
});
