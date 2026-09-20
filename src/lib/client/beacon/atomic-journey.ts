import type { StudentAgent } from '../../../agents/student/service';
import type { navigationHandoff } from '../../journey/navigation';
import type { PlanningView } from '../../planner/contracts';
import type { DemoStage, DemoViewModel, SavedProfile, TripContext } from '../../../components/safecircle/types';
import type { TripState } from '../../../types/trip';
import type { MobilityReadModel } from './read-models';
import type { CampusRouteSelection } from './campus-locations';

export type AtomicJourney = Awaited<ReturnType<StudentAgent['journey']>> & { navigation: ReturnType<typeof navigationHandoff>; planning: PlanningView | null };
const states: TripState[] = ['IDLE','OBJECTIVE_RECEIVED','DISCOVERING','COLLECTING_QUOTES','EVALUATING','SELECTED','VERIFYING_PROVIDER','COORDINATING','NAVIGATING','WAITING_FOR_PICKUP','IN_TRIP','PROVIDER_FAILED','REPLANNING','OVERDUE','ARRIVED','FAILED'];
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('INVALID_JOURNEY'); return v as Record<string, unknown>; }
function text(v: unknown): asserts v is string { if (typeof v !== 'string' || v.length > 10000) throw Error('INVALID_JOURNEY'); }
function number(v: unknown): asserts v is number { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw Error('INVALID_JOURNEY'); }
function bool(v: unknown): asserts v is boolean { if (typeof v !== 'boolean') throw Error('INVALID_JOURNEY'); }
function time(v: unknown) { text(v); if (!Number.isFinite(Date.parse(v))) throw Error('INVALID_JOURNEY'); }
function oneOf(v: unknown, values: readonly string[]) { if(typeof v!=='string'||!values.includes(v))throw Error('INVALID_JOURNEY'); }
function array(v: unknown): unknown[] { if (!Array.isArray(v) || v.length > 20000) throw Error('INVALID_JOURNEY'); return v; }
function point(v: unknown) { const p=object(v); if(typeof p.lat!=='number'||typeof p.lng!=='number'||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)throw Error('INVALID_JOURNEY'); }
function geometry(v: unknown) { const g=object(v); if(g.type!=='LineString')throw Error('INVALID_JOURNEY'); const a=array(g.coordinates); if(a.length<2)throw Error('INVALID_JOURNEY'); for(const c of a){if(!Array.isArray(c)||c.length!==2)throw Error('INVALID_JOURNEY');point({lng:c[0],lat:c[1]});} }
function candidate(v:unknown) { const p=object(v); for(const k of ['planId','providerName'])text(p[k]); if(p.providerId!==null)text(p.providerId); if(!['walk','transit','campus_ride','independent_ride'].includes(String(p.mode)))throw Error('INVALID_JOURNEY'); for(const k of ['cost','waitMinutes','travelMinutes','walkingMinutes','totalMinutes'])number(p[k]);for(const k of ['transfers','reliability','historicalExposure','weatherPenalty'])if(p[k]!==undefined)number(p[k]); bool(p.available);bool(p.requiresProviderVerification); }
/** Reject malformed values before any route, consent, price, or status reaches the UI. */
export function parseAtomicJourney(value:unknown):AtomicJourney {
 const v=object(value),t=object(v.trip),j=object(v.journey),c=object(v.coordination); text(t.id);if(!states.includes(t.state as TripState))throw Error('INVALID_JOURNEY');array(t.candidates).forEach(candidate);if(t.selectedPlan)candidate(t.selectedPlan);
 for(const k of ['providerVerified','sensitiveDataReleased','alertSent'])if(t[k]!==undefined)bool(t[k]);
 for(const k of ['expectedArrivalAt','alertDeadlineAt'])if(t[k]!==undefined)time(t[k]);
 if(t.statusMessage!==undefined)text(t.statusMessage);
 if(t.recommendation){const r=object(t.recommendation);text(r.selectedPlanId);text(r.explanation);array(r.reasonCodes).forEach(text);time(r.evaluatedAt);}
 if(j.schemaVersion!=='beacon-journey-v1'||!Number.isSafeInteger(j.revision)||Number(j.revision)<0)throw Error('INVALID_JOURNEY');time(j.createdAt);text(j.binding);bool(v.selectionCurrent);
 for(const leg of array(j.legs)){const l=object(leg);text(l.id);if(!['walk','wait','ride','transit'].includes(String(l.kind)))throw Error('INVALID_JOURNEY');array(l.directions).forEach(text);if(l.durationSeconds!==null)number(l.durationSeconds);if(l.geometry!==null)geometry(l.geometry);}
 if(j.nextStep!==null){const n=object(j.nextStep);text(n.legId);text(n.instruction);bool(n.showMap);if(n.routeId!==null)text(n.routeId);if(!array(j.legs).some(l=>object(l).id===n.legId))throw Error('INVALID_JOURNEY');}
 for(const k of ['pickup','waiting']){const p=object(j[k]);if(p.point!==null)point(p.point);}array(j.limitations).forEach(text);number(j.remainingBudgetMinor);
 if(!['none','check_booking','refresh_quotes','payment_declined','confirm'].includes(String(c.requiredAction)))throw Error('INVALID_JOURNEY');number(c.remainingBudgetMinor);if(c.currency!=='USD'||c.paymentMode!=='simulated')throw Error('INVALID_JOURNEY');
 if(c.selectedOffer){const o=object(c.selectedOffer);for(const k of ['planId','quoteId','serviceId','pickupInstructions'])text(o[k]);number(o.totalMinor);number(o.cancellationFeeMinor);time(o.expiresAt);bool(o.simulated);bool(o.pickupAccessVerified);}
 if(c.operator){const o=object(c.operator);text(o.name);oneOf(o.verification,['ans_verified','local_demo','not_verified']);if(o.ansId!==null&&o.ansId!==undefined)text(o.ansId);}
 for(const p of array(c.payments)){const a=object(p);if(!['authorized','voided','captured','refunded','unknown'].includes(String(a.state)))throw Error('INVALID_JOURNEY');number(a.amountMinor);number(a.retainedMinor);if(Number(a.retainedMinor)>Number(a.amountMinor))throw Error('INVALID_JOURNEY');}
 if(v.ride!==null){const r=object(v.ride);if(!['searching','assigned','approaching','arrived','in_trip','completed','cancelled','unknown'].includes(String(r.stage)))throw Error('INVALID_JOURNEY');bool(r.simulated);if(r.pickupEtaSeconds!==null)number(r.pickupEtaSeconds);if(r.providerUpdatedAt!==null)time(r.providerUpdatedAt);time(r.receivedAt);if(r.meetingInstructions!==null)text(r.meetingInstructions);if(r.driver!==null){const d=object(r.driver);if(d.displayName!==null)text(d.displayName);}if(r.vehicle!==null)for(const x of Object.values(object(r.vehicle)))if(x!==null)text(x);}
 if(j.complete!==null){const complete=object(j.complete);number(complete.objectiveVersion);if(complete.selected!==null){const s=object(complete.selected);time(s.validUntil);for(const leg of array(s.legs)){const l=object(leg);text(l.id);for(const k of ['from','to']){const p=object(l[k]);text(p.name);point(p.point);}if(l.route!==null){const r=object(l.route);text(r.routeId);text(r.provider);geometry(r.geometry);number(r.distanceMeters);number(r.durationSeconds);}}}if(complete.demoScenario!==undefined){const d=object(complete.demoScenario);if(d.synthetic!==true||d.source!=='synthetic_demo')throw Error('INVALID_JOURNEY');text(d.label);text(d.summary);text(d.limitation);}}
 if(v.navigation!==null){const n=object(v.navigation);text(n.destination);for(const key of ['googleMapsUrl','appleMapsUrl']){text(n[key]);const u=new URL(n[key]);if(u.protocol!=='https:'||!(key==='googleMapsUrl'?u.hostname==='www.google.com':u.hostname==='maps.apple.com'))throw Error('INVALID_JOURNEY');}}
 const arrival=object(v.arrival);text(arrival.status);
 if(v.planning!==null){const p=object(v.planning);oneOf(p.phase,['understanding','gathering','evaluating','explaining','ready','needs_input','unavailable']);oneOf(p.worker,['online','offline','auth_required','rate_limited','not_required']);text(p.messageCode);if(p.explanation!==undefined)text(p.explanation);}
 if(v.notification!==null)oneOf(object(v.notification).state,['sending','sent','simulated','failed','uncertain']);
 if(v.cancellation!==null&&v.cancellation!==undefined){const c=object(v.cancellation);if(!['pending','resolved'].includes(String(c.status)))throw Error('INVALID_JOURNEY');time(c.requestedAt);if(c.resolvedAt!==undefined)time(c.resolvedAt);if(c.attemptId!==undefined)text(c.attemptId);}
 return value as AtomicJourney;
}
export function stageForJourney(s:AtomicJourney):DemoStage {
 if(s.cancellation)return s.cancellation.status==='pending'?'cancelling':'cancelled';
 const replacement=(s.journey.complete?.objectiveVersion??0)>0;
 const suffix=replacement?'replacement':'initial';
 if(s.coordination.requiredAction==='check_booking')return 'booking-unknown';
 if(s.coordination.requiredAction==='refresh_quotes')return 'offer-changed';
 if(s.coordination.requiredAction==='payment_declined')return 'payment-declined';
 if(s.coordination.payments.some(p=>p.state==='unknown'))return 'payment-unknown';
 if(['IDLE','OBJECTIVE_RECEIVED','DISCOVERING','COLLECTING_QUOTES','EVALUATING'].includes(s.trip.state)) {
  if(s.planning?.phase==='needs_input')return 'context-fallback';
  if(s.planning?.phase==='unavailable'&&s.planning.messageCode!=='PLANNER_NOT_STARTED')return 'slow-request';
 }
 const map:Record<TripState,DemoStage>={IDLE:'home',OBJECTIVE_RECEIVED:'discovering',DISCOVERING:replacement?'replanning-discovery':'discovering',COLLECTING_QUOTES:'collecting-quotes',EVALUATING:replacement?'replanning-evaluation':'evaluating',SELECTED:replacement?'replacement-selected':'recommendation',VERIFYING_PROVIDER:`verifying-${suffix}`,COORDINATING:`coordinating-${suffix}`,NAVIGATING:`in-trip-${suffix}`,WAITING_FOR_PICKUP:s.ride?.stage==='approaching'||s.ride?.stage==='arrived'?`arriving-${suffix}`:`waiting-${suffix}`,IN_TRIP:`in-trip-${suffix}`,PROVIDER_FAILED:'provider-cancelled',REPLANNING:'replanning-discovery',OVERDUE:'overdue',ARRIVED:'arrival',FAILED:'no-options'};
 return map[s.trip.state];
}
export function confirmationPayload(s:AtomicJourney){if(!s.selectionCurrent||s.coordination.requiredAction!=='confirm'||!s.trip.selectedPlan)throw Error('OFFER_NOT_CONFIRMABLE');return {planId:s.trip.selectedPlan.planId,journeyRevision:s.journey.revision,...(s.coordination.selectedOffer?{quoteId:s.coordination.selectedOffer.quoteId}:{})};}
export function createPayload(profile:SavedProfile,context:TripContext={},route?:CampusRouteSelection){return {journeyContract:'beacon-journey-v1' as const,demoScenarioVariant:'baseline' as const,...(route?{origin:{...route.from.point}}:{}),preferences:{...(route?{home:{...route.to.point}}:{}),maxBudget:profile.maxBudget,walkingPreference:profile.walkingPreference==='minimal'?'minimize':'normal',transferPreference:profile.avoidTransfers?'minimize':'normal',...(profile.telegramContact?{trustedContact:{name:profile.telegramContact.name,telegramChatId:profile.telegramContact.chatId,consent:profile.telegramContact.consent,shareLocation:profile.telegramContact.shareLocation}}:{})},temporary_context:{...(context.maxBudget!==undefined?{max_budget:context.maxBudget}:{}),...(context.walkingPreference?{minimize_walking:context.walkingPreference==='minimal'}:{}),has_been_drinking:context.note==='drinking',exhausted:context.note==='tired'}};}
export function normalizeJourney(snapshot:AtomicJourney,profile:SavedProfile,context:TripContext={},route?:CampusRouteSelection) {
 const {journey,coordination,ride}=snapshot,stage=stageForJourney(snapshot),replacement=(journey.complete?.objectiveVersion??0)>0;
 const displayPlan = (plan: AtomicJourney['trip']['candidates'][number]) => ({...plan,...Object.fromEntries((['waitMinutes','travelMinutes','walkingMinutes','totalMinutes'] as const).map(key=>[key,Math.max(plan[key]>0?1:0,Math.round(plan[key]))]))});
 const trip = {...snapshot.trip,candidates:snapshot.trip.candidates.map(displayPlan),selectedPlan:snapshot.trip.selectedPlan?displayPlan(snapshot.trip.selectedPlan):undefined};
 if(trip.recommendation&&trip.selectedPlan)trip.recommendation={...trip.recommendation,explanation:snapshot.planning?.phase==='ready'&&snapshot.planning.explanation?snapshot.planning.explanation:`${trip.selectedPlan.providerName}: about ${trip.selectedPlan.totalMinutes} minutes, including ${trip.selectedPlan.walkingMinutes} minutes walking. Review the current offer before confirming.`};
 const step=journey.nextStep,leg=journey.legs.find(l=>l.id===step?.legId),full=journey.complete?.selected?.legs.find(l=>l.id===leg?.id);
 let mobility:MobilityReadModel|undefined;
 // A provider can complete its ride before home arrival is established. Keep its
 // reported status visible even when the backend has no remaining active leg.
 if(!leg&&ride&&['NAVIGATING','WAITING_FOR_PICKUP','IN_TRIP','OVERDUE'].includes(trip.state))mobility={leg:{id:'reported-provider-status',kind:'ride',purpose:'home',status:'active'}};
 if(leg&&['NAVIGATING','WAITING_FOR_PICKUP','IN_TRIP','OVERDUE'].includes(trip.state)){
  const walk=leg.kind==='walk'&&step?.showMap===true;
  mobility={leg:{id:leg.id,instruction:step?.instruction,kind:walk?'walk':leg.kind==='wait'?'wait':'ride',purpose:trip.selectedPlan?.mode==='transit'&&leg.position!=='dropoff'?'transit-stop':leg.position==='pickup'?'pickup':'home',status:'active'}};
  if(walk)mobility.walkingRoute={routeId:step?.routeId??leg.id,status:leg.geometry?'available':'unavailable',source:full?.route?.provider==='google_routes'?'google-routes':journey.complete?.demoScenario?'fixture':'unknown',...(leg.geometry?{geometry:{format:'coordinates',points:leg.geometry.coordinates.map(([lng,lat])=>({lat,lng}))}}:{}),durationSeconds:leg.durationSeconds??undefined,distanceMeters:full?.route?.distanceMeters,steps:leg.directions.map(instruction=>({instruction})),originLabel:route?.from.name??full?.from.name,destinationLabel:route?.to.name??full?.to.name,updatedAt:journey.createdAt};
 }
 if(mobility&&mobility.leg.kind!=='walk'&&ride)mobility.ride={providerSource:ride.simulated?'simulated-rideshare':'connected-provider',stage:({searching:'waiting',assigned:'driver-assigned',approaching:'approaching',arrived:'arrived',in_trip:'riding',completed:'completed',cancelled:'cancelled',unknown:'unknown'} as const)[ride.stage],pickupEtaSeconds:ride.pickupEtaSeconds??undefined,meetingInstructions:ride.meetingInstructions??coordination.selectedOffer?.pickupInstructions,pickupLocation:full?.from.name,driver:ride.driver?.displayName?{firstName:ride.driver.displayName}:undefined,vehicle:ride.vehicle?{make:ride.vehicle.make??undefined,model:ride.vehicle.model??undefined,color:ride.vehicle.color??undefined,plate:ride.vehicle.licensePlate??undefined}:undefined,updatedAt:ride.providerUpdatedAt??undefined};
 const lastPayment=coordination.payments.at(-1),paid=!!coordination.selectedOffer;
 if(mobility?.ride)mobility.ride.stale=!ride?.providerUpdatedAt||Date.now()-Date.parse(ride.providerUpdatedAt)>120000;
 const model:DemoViewModel={stage,trip,profile,constraints:{maxBudget:context.maxBudget??profile.maxBudget,walkingPreference:context.walkingPreference??profile.walkingPreference,avoidTransfers:profile.avoidTransfers},selectedPlan:trip.selectedPlan,recommendation:trip.recommendation,paymentStatus:lastPayment?.state==='unknown'?'unknown':lastPayment?.state==='voided'||lastPayment?.state==='refunded'?'voided':lastPayment?'approved':paid?'not-started':'not-required',bookingStatus:coordination.requiredAction==='check_booking'?'unknown':ride?.stage==='cancelled'?'cancelled':ride?'accepted':paid?'not-started':'not-required',cancellationFee:(coordination.selectedOffer?.cancellationFeeMinor??0)/100,offerExpiresAt:coordination.selectedOffer?Date.parse(coordination.selectedOffer.expiresAt):journey.complete?.selected?Date.parse(journey.complete.selected.validUntil):undefined,providerVerified:trip.providerVerified===true,providerAuthorized:trip.sensitiveDataReleased===true,sensitiveDataReleased:trip.sensitiveDataReleased===true,isReplacement:replacement,isActiveTrip:!['IDLE','ARRIVED','FAILED'].includes(trip.state),isRouteVisible:mobility?.leg.kind==='walk',isStale:false,lastTripUpdateAt:Date.parse(journey.createdAt),progressStep:trip.state==='ARRIVED'?'arrived':trip.state==='IN_TRIP'||trip.state==='NAVIGATING'?'in-trip':ride?.stage==='approaching'||ride?.stage==='arrived'?'arriving':trip.state==='WAITING_FOR_PICKUP'?'waiting':'none',timeline:[],paused:false};
 model.attemptId=snapshot.cancellation?.attemptId;
 if(coordination.requiredAction==='payment_declined')model.paymentStatus='declined';
 if(ride?.stage==='unknown')model.bookingStatus='unknown';
 model.cancellationRequested=snapshot.cancellation?.status==='pending';
 const previousPayment=replacement?coordination.payments.at(ride&&ride.stage!=='cancelled'?-2:-1):undefined;
 model.backendDetails={quoteId:coordination.selectedOffer?.quoteId,operatorName:coordination.operator?.name,operatorVerification:coordination.operator?.verification,cancellationFee:(coordination.selectedOffer?.cancellationFeeMinor??0)/100,remainingBudget:coordination.remainingBudgetMinor/100,previousOfferCost:previousPayment?previousPayment.amountMinor/100:undefined,previousRetainedFee:previousPayment?previousPayment.retainedMinor/100:undefined,notificationState:snapshot.notification?.state,simulated:coordination.selectedOffer?.simulated??Boolean(journey.complete?.demoScenario)};
 model.backendDetails.destinationName=journey.complete?.selected?.legs.at(-1)?.to.name;
 model.backendDetails.payments=coordination.payments.map(payment=>({state:payment.state,amount:payment.amountMinor/100,retained:payment.retainedMinor/100}));
 model.backendDetails.expectedArrivalAt=trip.expectedArrivalAt;
 model.backendDetails.pickupInstructions=ride?.meetingInstructions??coordination.selectedOffer?.pickupInstructions;
 return {model,mobility,snapshot,revision:journey.revision,canConfirm:snapshot.selectionCurrent&&coordination.requiredAction==='confirm'&&!snapshot.cancellation,canResumeConsent:snapshot.selectionCurrent&&!snapshot.cancellation&&coordination.requiredAction==='none'&&['SELECTED','VERIFYING_PROVIDER'].includes(trip.state),nextStep:step,offer:coordination.selectedOffer,operator:coordination.operator,payments:coordination.payments,notification:snapshot.notification,arrival:snapshot.arrival,cancellation:snapshot.cancellation,navigation:snapshot.navigation,source:journey.complete?.demoScenario?'synthetic-demo':'backend',remainingBudgetMinor:coordination.remainingBudgetMinor};
}
export function backendErrorStage(code:string):DemoStage {if(['AUTH_REQUIRED','PAIRING_REQUIRED','PAIR_CODE_INVALID','TRIP_NOT_FOUND'].includes(code))return 'session-error';if(['JOURNEY_CHANGED','SELECTION_CHANGED','QUOTE_EXPIRED','STALE_SNAPSHOT','BUDGET_EXCEEDED','CONFIRMATION_REQUIRED'].includes(code))return 'offer-changed';if(['BOOKING_UNCERTAIN','SETTLEMENT_UNCERTAIN'].includes(code))return 'booking-unknown';if(code.includes('VERIFICATION')||code==='PROVIDER_NOT_AUTHORIZED')return 'verification-failed';if(code.includes('LOCATION'))return 'location-error';return 'slow-request';}
