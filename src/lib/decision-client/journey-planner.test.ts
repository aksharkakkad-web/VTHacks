import test from 'node:test';
import assert from 'node:assert/strict';
import { planJourney, type JourneyDependencies } from './journey-planner';
import type { JourneyRequest, JourneyRide, JourneyPlace, WaitingPlace } from './journey-types';
import { distanceMeters, type WalkingRouter } from './walking-router';
import type { FullTransitOption } from '../../integrations/databricks/full-transit-query';

export const at='2026-09-19T21:00:00.000Z';
export const origin:JourneyPlace={id:'origin',name:'Public demo origin',point:{lat:37.2288,lng:-80.4192}};
export const destination:JourneyPlace={id:'home',name:'Public demo destination',point:{lat:37.222,lng:-80.42}};
const when=(seconds:number)=>new Date(Date.parse(at)+seconds*1000).toISOString();
export const fixtureRouter:WalkingRouter=async(from,to)=>({routeId:`fixture:${from.lat}:${to.lat}`,from,to,geometry:{type:'LineString',coordinates:[[from.lng,from.lat],[to.lng,to.lat]]},distanceMeters:distanceMeters(from,to),durationSeconds:60,instructions:[{text:'Follow the fixture path.',distanceMeters:distanceMeters(from,to),durationSeconds:60}],provider:'fixture_only',capturedAt:at,validUntil:when(300)});
export const dependencies:JourneyDependencies={route:fixtureRouter,evidence:()=>({blocked:false,validUntil:null,facts:[],unknowns:['LIGHTING_UNKNOWN','CRIME_COVERAGE_UNKNOWN']})};
export const request:JourneyRequest={objectiveVersion:1,origin,destination,evaluatedAt:at,budgetMinor:1000};
export function ride(pickup=origin):JourneyRide{return {offer:{operatorId:'op',serviceId:'campus',quoteId:'quote',offerVersion:'1',displayName:'Demo ride',mode:'campus_ride',source:'simulated',available:true,issuedAt:at,expiresAt:when(120),admission:{serviceAreaMatch:true,authSupported:true,paymentSupported:true},price:{currency:'USD',kind:'fixed',totalMinor:200,includesAllFees:true},waitMinutes:5,travelMinutes:4,walkingMinutes:0,transfers:0},pickup,dropoff:destination,pickupAt:when(300),arrivalAt:when(540),pickupPermitted:true};}
function site():WaitingPlace{return {...origin,indoor:true,sheltered:true,accessAllowed:true,opensAt:when(-600),closesAt:when(180),capturedAt:at,validUntil:when(600),sourceUrl:'https://vt.edu/hours',sourceVersion:'a'.repeat(64)};}
const all=(r:Awaited<ReturnType<typeof planJourney>>)=>[r.selected,...r.alternatives].filter(x=>x!==null);

test('walking-only keeps exact evaluated geometry and one map instruction',async()=>{
 const r=await planJourney(request,dependencies);assert.equal(r.status,'RECOMMENDED');assert.equal(r.selected?.kind,'walk');assert.deepEqual(r.selected?.legs[0].route?.geometry.coordinates,[[-80.4192,37.2288],[-80.42,37.222]]);assert.equal(r.selected?.nextStep.showMap,true);assert.equal(r.selected?.walkingSeconds,60);assert.ok(r.selected?.unknowns.includes('CRIME_COVERAGE_UNKNOWN'));assert.equal(r.execution.engine,'local_fallback');
});
test('cannot walk is hard and zero budget excludes paid rides',async()=>{
 assert.equal((await planJourney({...request,cannotWalk:true},dependencies)).status,'NO_FEASIBLE_JOURNEY');
 const r=await planJourney({...request,cannotWalk:true,rides:[ride()]},dependencies);assert.equal(r.selected?.kind,'ride');assert.equal(r.selected?.walkingSeconds,0);assert.equal(r.selected?.nextStep.showMap,false);
 assert.equal((await planJourney({...request,cannotWalk:true,budgetMinor:0,rides:[ride()]},dependencies)).status,'NO_FEASIBLE_JOURNEY');
});
test('ride short pickup/final walks have continuous geometry/timing and exact offer binding',async()=>{
 const pickup={...origin,id:'pickup',point:{lat:37.2287,lng:-80.4192}},r=ride(pickup);r.dropoff={...destination,id:'dropoff',point:{lat:37.2221,lng:-80.42}};
 const out=await planJourney({...request,rides:[r]},dependencies),j=all(out).find(x=>x.kind==='ride')!;
 assert.equal(j.walkingSeconds,120);assert.equal(j.offerBinding?.quoteId,'quote');assert.deepEqual(j.offerLocationBinding?.pickup,pickup);
 for(let i=1;i<j.legs.length;i++){assert.equal(j.legs[i].startsAt,j.legs[i-1].endsAt);assert.deepEqual(j.legs[i].from.point,j.legs[i-1].to.point);}
 assert.equal(j.legs.at(-1)?.endsAt,when(600));
});
test('indoor wait leaves before closing and preserves subsequent pickup wait',async()=>{
 const r=await planJourney({...request,cannotWalk:true,rides:[ride()],currentWaitingPlace:site()},dependencies);
 const j=r.selected!;assert.equal(j.leaveWaitingAt,when(179));assert.equal(j.legs[0].indoor,true);assert.equal(j.legs[0].endsAt,when(179));assert.equal(j.waitingSeconds,300);assert.equal(j.legs[1].indoor,null);
});
test('closed/access-denied sites cannot become asserted indoor waits',async()=>{
 for(const s of [{...site(),closesAt:when(-1)},{...site(),accessAllowed:false}]){
 const r=await planJourney({...request,cannotWalk:true,rides:[ride()],currentWaitingPlace:s},dependencies);assert.equal(r.selected?.legs[0].indoor,null);}
});
test('unknown access is conditional and does not command entry',async()=>{
 const r=await planJourney({...request,cannotWalk:true,rides:[ride()],currentWaitingPlace:{...site(),accessAllowed:null}},dependencies);
 assert.match(r.selected!.nextStep.instruction,/check access/);assert.equal(r.selected!.legs[0].indoor,null);
});
test('cancellation uses outstanding liabilities once and excludes exact failed service',async()=>{
 const r=await planJourney({...request,objectiveVersion:2,cannotWalk:true,committedMinor:900,remainingBudgetMinor:100,rides:[ride()]},dependencies);assert.equal(r.remainingBudgetMinor,100);assert.equal(r.status,'NO_FEASIBLE_JOURNEY');
 const good=ride();good.offer.serviceId='replacement';good.offer.price.totalMinor=100;
 const fresh=await planJourney({...request,objectiveVersion:3,cannotWalk:true,committedMinor:900,rides:[ride(),good],excludedServices:[{operatorId:'op',serviceId:'campus'}]},dependencies);assert.equal(fresh.selected?.offerBinding?.serviceId,'replacement');assert.equal(fresh.objectiveVersion,3);
});
test('expired offer and unknown pickup permission rejected, no fixture fallback for routing failure',async()=>{
 const old=ride();old.offer.expiresAt=at;
 const unknown=ride();unknown.pickupPermitted=null;
 for(const r of [old,unknown]) assert.equal((await planJourney({...request,cannotWalk:true,rides:[r]},dependencies)).status,'NO_FEASIBLE_JOURNEY');
 const noRoute=await planJourney(request,{...dependencies,route:async()=>{throw new Error('ROUTING_NOT_CONFIGURED');}});assert.equal(noRoute.status,'NO_FEASIBLE_JOURNEY');assert.equal(noRoute.rejected[0].reasons[0],'ROUTING_NOT_CONFIGURED');
});
test('closures reject paths and pickup locations; disconnected routing is rejected',async()=>{
 assert.equal((await planJourney(request,{...dependencies,evidence:()=>({blocked:true,validUntil:null,facts:[],unknowns:[]})})).status,'NO_FEASIBLE_JOURNEY');
 assert.equal((await planJourney({...request,cannotWalk:true,rides:[ride()]},{...dependencies,evidence:()=>({blocked:true,validUntil:null,facts:[],unknowns:[]})})).status,'NO_FEASIBLE_JOURNEY');
 assert.equal((await planJourney(request,{...dependencies,route:async(a,b,t)=>({...await fixtureRouter(a,b,t),to:origin.point})})).status,'NO_FEASIBLE_JOURNEY');
});
test('at most three distinct alternatives, no private extra quote fields',async()=>{
 const rides=Array.from({length:6},(_,i)=>{const r=ride();r.offer.quoteId=`q${i}`;Object.assign(r.offer,{bookingGrant:'SECRET',contact:'PRIVATE'});return r;});
 const r=await planJourney({...request,rides},dependencies);assert.equal(r.alternatives.length,3);assert.equal(new Set(all(r).map(j=>j.journeyId)).size,4);assert.doesNotMatch(JSON.stringify(r),/SECRET|PRIVATE|bookingGrant/);
});
const busOption=(from:string,to:string,depart=300):FullTransitOption=>({candidate:{planId:'bus-1',providerId:'bt',providerName:'BT scheduled',mode:'transit',available:true,cost:0,waitMinutes:4,travelMinutes:5,walkingMinutes:2,totalMinutes:11,transfers:0,requiresProviderVerification:false},signals:{source:'scheduled',collectedAt:at,validUntil:when(depart-120)},source:{sourceSha256:'a'.repeat(64),capturedAt:at,serviceDate:'2026-09-19',tripId:'trip-1',routeId:'PHD',fromStopId:from,toStopId:to,departureAt:when(depart),arrivalAt:when(depart+300),walkingSource:'mapped'},statementId:'test',warnings:[]});
test('direct bus uses actual access time and rejects missed departures',async()=>{
 const stops=[{id:'s1',name:'Origin stop',point:{lat:37.2287,lng:-80.4192}},{id:'s2',name:'Home stop',point:{lat:37.2221,lng:-80.42}}];
 const good=await planJourney(request,{...dependencies,stops,directTransit:async q=>{assert.equal(q.accessWalkingMinutes,1);return busOption(q.fromStopId,q.toStopId);}});
 const j=all(good).find(j=>j.kind==='bus');assert.ok(j);assert.equal(j.walkingSeconds,120);assert.equal(j.legs.find(l=>l.kind==='bus')?.route,null);
 const missed=await planJourney(request,{...dependencies,stops,directTransit:async q=>busOption(q.fromStopId,q.toStopId,100)});assert.ok(!all(missed).some(j=>j.kind==='bus'));
});
test('planning time cannot resurrect offers that expire during tool execution',async()=>{
 const r=ride();r.offer.expiresAt=when(0.01);
 const out=await planJourney({...request,rides:[r]},{...dependencies,route:async(a,b,t)=>{await new Promise(r=>setTimeout(r,30));return fixtureRouter(a,b,t);}});
 assert.ok(!all(out).some(j=>j.kind==='ride'));
});

const workspace={host:'https://demo.cloud.databricks.com',token:'test-secret',warehouseId:'test-warehouse',auditTable:'workspace.beacon.decision_events'};
function sqlMock(options:{invalid?:boolean;failAudit?:boolean}={}) {
 const bodies:Record<string,unknown>[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));bodies.push(body);
  const ranking=body.parameters?.find((p:{name:string})=>p.name==='features');
  if(!ranking && options.failAudit) return new Response('',{status:503});
  const f: {id:string;duration:number;walking:number;walkingWeight:number;outdoor:number;unknownWait:number;cost:number;complexity:number}[]=ranking?JSON.parse(ranking.value):[];
  const rows=f.map(x=>[x.id,String(x.duration+x.walking*x.walkingWeight+x.outdoor*2+x.unknownWait+x.cost+x.complexity*60+(options.invalid?1:0))]);
  return Response.json({statement_id:'test-statement',status:{state:'SUCCEEDED'},manifest:{schema:{columns:ranking?[{name:'journey_id'},{name:'score_units'}]:[]},total_row_count:rows.length},result:{data_array:rows}});
 };return {fetcher,bodies};
}
test('native journey SQL is validated and read-only; locations and private fields never leave',async()=>{
 const mock=sqlMock();const out=await planJourney(request,{...dependencies,rankOptions:{workspace,fetch:mock.fetcher}});
 assert.equal(out.execution.engine,'databricks');assert.equal(out.execution.auditStatus,'DISABLED_READ_ONLY');assert.equal(mock.bodies.length,1);
 assert.doesNotMatch(JSON.stringify(mock.bodies),/37\.2288|80\.4192|Public demo|test-secret|geometry|pickup/);
});
test('invalid SQL result gives explicit local fallback with the same selected journey',async()=>{
 const mock=sqlMock({invalid:true});const out=await planJourney(request,{...dependencies,rankOptions:{workspace,fetch:mock.fetcher}});
 assert.equal(out.execution.engine,'local_fallback');assert.equal(out.execution.fallbackReason,'DATABRICKS_UNAVAILABLE_OR_INVALID_RESULT');assert.equal(out.selected?.kind,'walk');
});
test('audit requires opt-in, is sanitized, and write failure stays visible',async()=>{
 for(const failAudit of [false,true]){
  const mock=sqlMock({failAudit});const out=await planJourney(request,{...dependencies,rankOptions:{workspace,persistAudit:true,fetch:mock.fetcher}});
  assert.equal(mock.bodies.length,2);assert.equal(out.execution.auditPersisted,!failAudit);assert.equal(out.execution.auditStatus,failAudit?'WRITE_FAILED':'PERSISTED');
  assert.doesNotMatch(JSON.stringify(mock.bodies[1]),/37\.2288|Public demo|quote|geometry|contact/);
 }
});
test('an actual walking preference can choose a ride over the cheapest long walk',async()=>{
 const r=ride();r.offer.price.totalMinor=0;
 const router:WalkingRouter=async(a,b,t)=>({...await fixtureRouter(a,b,t),durationSeconds:600,instructions:[{text:'Follow fixture path.',distanceMeters:distanceMeters(a,b),durationSeconds:600}]});
 const out=await planJourney({...request,tired:true,rides:[r]},{...dependencies,route:router});assert.equal(out.selected?.kind,'ride');
});

test('closures beginning during a future leg reject that complete journey',async()=>{
 const r=ride();r.dropoff={...destination,id:'dropoff',point:{lat:37.2221,lng:-80.42}};
 const out=await planJourney({...request,rides:[r]},{...dependencies,evidence:(route,t)=>({blocked:route.from.lat===37.2221&&Date.parse(t)>=Date.parse(when(540)),validUntil:when(540),facts:[],unknowns:[]})});
 assert.ok(!all(out).some(j=>j.kind==='ride'));assert.ok(out.rejected.some(r=>r.reasons.includes('KNOWN_CLOSURE_OR_ALERT_DURING_LEG')));
});
test('bus waits at current shelter and leaves in time for boarding buffer',async()=>{
 const stops=[{id:'s1',name:'Origin stop',point:{lat:37.2287,lng:-80.4192}},{id:'s2',name:'Home stop',point:{lat:37.2221,lng:-80.42}}];
 const out=await planJourney({...request,currentWaitingPlace:site()},{...dependencies,stops,directTransit:async q=>busOption(q.fromStopId,q.toStopId)});
 const bus=all(out).find(j=>j.kind==='bus')!;assert.equal(bus.legs[0].kind,'wait');assert.equal(bus.legs[0].indoor,true);assert.equal(bus.leaveWaitingAt,when(179));
 assert.equal(bus.legs.find(l=>l.kind==='bus')?.startsAt,when(300));
});
test('conflicting duplicate quote identities cannot silently rebind pickup',async()=>{
 const a=ride(),b=ride({...origin,id:'other',point:{lat:37.2287,lng:-80.4192}});
 await assert.rejects(planJourney({...request,rides:[a,b]},dependencies),/DUPLICATE_QUOTE_BINDING/);
});
test('SQL must return the same complete ordering, not merely correct individual scores',async()=>{
 const mock=sqlMock();
 const fetcher:typeof fetch=async(u,i)=>{const response=await mock.fetcher(u,i);const body=await response.json();body.result.data_array.reverse();return Response.json(body);};
 const out=await planJourney({...request,rides:[ride()]},{...dependencies,rankOptions:{workspace,fetch:fetcher}});
 assert.equal(out.execution.engine,'local_fallback');
});
test('movement for confirmed shelter is generated, unknown access alone never causes relocation',async()=>{
 const waiting={...site(),id:'shelter',point:{lat:37.2287,lng:-80.4192},closesAt:when(600)};
 const out=await planJourney({...request,rides:[ride()],waitingPlaces:[waiting]},dependencies);
 assert.ok(all(out).some(j=>j.explanationFacts.includes('MOVE_FOR_CONFIRMED_SHELTER')));
 const unknown=await planJourney({...request,rides:[ride()],waitingPlaces:[{...waiting,accessAllowed:null}]},dependencies);
 assert.ok(!all(unknown).some(j=>j.explanationFacts.includes('MOVE_FOR_CONFIRMED_SHELTER')));
});
test('closure boundaries are checked from the future leg start even after earlier closures',async()=>{
 const r=ride();r.dropoff={...destination,id:'dropoff',point:{lat:37.2221,lng:-80.42}};
 const out=await planJourney({...request,rides:[r]},{...dependencies,evidence:(route,t)=>{
  const seconds=(Date.parse(t)-Date.parse(at))/1000;
  if(route.from.lat!==37.2221)return {blocked:false,validUntil:null,facts:[],unknowns:[]};
  return {blocked:seconds>=550&&seconds<560,validUntil:seconds<100?when(100):seconds<550?when(550):when(560),facts:[],unknowns:[]};
 }});assert.ok(!all(out).some(j=>j.kind==='ride'));
});
test('provider absolute pickup time cannot be changed without a corresponding quote',async()=>{
 const r=ride();r.pickupAt=when(400);r.arrivalAt=when(640);
 const out=await planJourney({...request,cannotWalk:true,rides:[r]},dependencies);assert.equal(out.status,'NO_FEASIBLE_JOURNEY');assert.ok(out.rejected.some(x=>x.reasons.includes('INVALID_PROVIDER_TIMING')));
});
test('audit explicitly reports when SQL or audit latency expires its recorded selection',async()=>{
 const r=ride();r.offer.expiresAt=when(0.08);r.offer.price.totalMinor=0;
 const mock=sqlMock();
 const fetcher:typeof fetch=async(u,i)=>{if(String(i?.body).includes('MERGE INTO'))await new Promise(r=>setTimeout(r,100));return mock.fetcher(u,i);};
 const router:WalkingRouter=async(a,b,t)=>({...await fixtureRouter(a,b,t),durationSeconds:600,instructions:[{text:'Fixture walk.',distanceMeters:distanceMeters(a,b),durationSeconds:600}]});
 const out=await planJourney({...request,tired:true,rides:[r]},{...dependencies,route:router,rankOptions:{workspace,persistAudit:true,fetch:fetcher}});
 assert.equal(out.selected?.kind,'walk');assert.equal(out.execution.auditPersisted,true);assert.equal(out.execution.auditStatus,'PERSISTED_SUPERSEDED_SELECTION');assert.ok(out.warnings.includes('AUDIT_PRECEDES_FINAL_EXPIRY_FILTER'));
});
test('local stop geometry and native departure must use the same feed source',async()=>{
 const stops=[{id:'s1',name:'Origin stop',point:{lat:37.2287,lng:-80.4192}},{id:'s2',name:'Home stop',point:{lat:37.2221,lng:-80.42}}];
 const out=await planJourney(request,{...dependencies,stops,transitSourceSha256:'b'.repeat(64),directTransit:async q=>busOption(q.fromStopId,q.toStopId)});
 assert.ok(!all(out).some(j=>j.kind==='bus'));assert.ok(out.rejected.some(r=>r.reasons.includes('TRANSIT_STOP_SOURCE_MISMATCH')));
});
