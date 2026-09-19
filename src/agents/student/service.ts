import type { ProviderOutcome } from "../../lib/decision-client/provider-outcomes";
import { randomUUID } from "node:crypto";
import type { CandidatePlan } from "../../types/provider";
import type { Recommendation } from "../../types/recommendation";
import type { ProviderAgent, ProviderDescriptor, ProviderTrip } from "../contract";
import { object, point } from "../contract";
import type { AgentDirectory, VerifiedIdentity } from "../../integrations/ans/directory";
import { authorize } from "../../lib/authorization/policy";
import { owns, requireState, transition, TripError, type TripRecord, type TripContext, type Contact } from "../../lib/trip-state/model";
import type { TripStore } from "../../lib/trip-state/store";
import { syncJourney } from '../../lib/journey/snapshot';
import { assessArrival, arrivalPolicy } from '../../lib/journey/arrival';
import { observeProvider, parseProviderDetails } from '../../lib/journey/provider-status';
import { collectCandidates } from "../discovery";
import { acceptCancellationResult, acceptNetworkResult, beginNetworkAttempt, confirmNetwork, coordinationView, networkAttempt, remainingBudgetMinor, requireNetworkConsent, selectedOffer, uncertainPayment } from "./coordination";
import { parseTripInput } from "./input";
import type { DecisionHandoff, TripDecisionEvidence } from "./databricks";
import { isCurrentWeather, withinCampusForecast, type WeatherEvidence } from "../../lib/campus-evidence/evidence";
import { matchesPublicCorridor, type PublicCorridor, type PublicTripOptions } from "../../lib/decision-client/trip-options";
import { digest } from "../../lib/planner/validation";
import type { Fact, Intent } from "../../lib/planner/contracts";
import type { PlanningSelection, PlanningSnapshot } from "../../lib/planner/orchestrator";
import type { ContextRequest, ContextResponse } from "../context/contract";
import type { ActivityStore } from "../../lib/agent-activity/store";
import { evaluateCompleteJourney, journeyOrigin, type JourneyCoordinatorDependencies } from './journey-coordinator';
import { distanceMeters } from '../../lib/decision-client/walking-router';

export type Action = "discover" | "evaluate" | "confirm" | "verify" | "request" | "location" | "arrive" | "cancel-provider" | "expire-deadline" | "replan";
export type Dependencies = JourneyCoordinatorDependencies & {
  store: TripStore; directory: AgentDirectory; demo: boolean; clock?: () => number; graceMinutes?: number;
  provider: (descriptor: ProviderDescriptor, identity?: VerifiedIdentity) => ProviderAgent;
  recommend: (plans: CandidatePlan[], context: TripContext, handoff: DecisionHandoff) => Promise<Recommendation>;
  notify: (contact: Contact, message: string, key: string) => Promise<{ id: string; simulated: boolean }>;
  recordOutcome?: (outcome: ProviderOutcome) => Promise<unknown>;
  campusWeather?: (now: number) => WeatherEvidence;
  publicTripOptions?: (corridorId: PublicCorridor, demo: boolean, evaluatedAt: string) => Promise<PublicTripOptions>;
  contextReader?: (request: ContextRequest) => Promise<ContextResponse>;
  activity?: ActivityStore;
};
const activeStates = ["NAVIGATING", "WAITING_FOR_PICKUP", "IN_TRIP", "OVERDUE"] as const;
export class StudentAgent {
  private readonly now: () => number;
  constructor(private readonly deps: Dependencies) { this.now = deps.clock ?? Date.now; }
  async create(owner: string, input: unknown) {
    const record: TripRecord = { trip: { id: randomUUID(), state: "OBJECTIVE_RECEIVED", candidates: [], providerVerified: false, sensitiveDataReleased: false, alertSent: false, statusMessage: "Finding a way home" }, owner, ...parseTripInput(input, this.deps.demo, this.now()), providers: [], excluded: [], confirmed: false, quoteDeadline: 0, replanCount: 0, events: [] };
    transition(record, "OBJECTIVE_RECEIVED", "OBJECTIVE_RECEIVED", "Trip objective received", this.now());
    syncJourney(record,this.now());
    await this.deps.store.create(record); return record.trip;
  }
  async read(id: string, owner: string) { const record = await this.deps.store.read(id); owns(record, owner); return record.trip; }
  private planningFacts(r:TripRecord,plan:CandidatePlan):Fact[]{
    const display={walk:"Walking",transit:"Scheduled transit",campus_ride:"Campus ride",independent_ride:"Independent ride"}[plan.mode]??"Transportation provider";
    const simulated=(r.simulatedPlanIds??[]).includes(plan.planId),lightingUnknown=!r.planSignals?.[plan.planId]||r.planSignals[plan.planId].lighting==="unknown";
    return[
      {id:"selected_plan",text:`${display} is the selected plan.`},
      {id:"quoted_total",text:`The quoted total is $${plan.cost.toFixed(2)}.`},
      {id:"trip_burden",text:`The plan includes ${plan.walkingMinutes} minutes of walking and ${plan.waitMinutes} minutes of waiting.`},
      ...(simulated&&lightingUnknown?[{id:"limitation_transport_and_lighting",text:"Transportation is simulated, and current route lighting is unknown."}]:simulated?[{id:"limitation_simulated_transport",text:"Transportation is simulated."}]:lightingUnknown?[{id:"limitation_lighting_unknown",text:"Current route lighting is unknown."}]:[]),
    ];
  }
  async journey(id:string,owner:string){
    const r=await this.deps.store.read(id);owns(r,owner);
    const selectionCurrent=!!r.trip.selectedPlan&&!['FAILED','ARRIVED','COLLECTING_QUOTES'].includes(r.trip.state)&&this.selectedDeadline(r)>this.now();
    const journey=structuredClone(r.journey??syncJourney(r,this.now()));
    if(!selectionCurrent&&!r.booking&&!r.pendingBooking&&['SELECTED','VERIFYING_PROVIDER','OVERDUE'].includes(r.trip.state))journey.nextStep=null;
    return {journey,trip:structuredClone(r.trip),coordination:coordinationView(r,this.now()),ride:r.rideObservation??null,
      arrival:{status:r.arrivalStatus??'NOT_DETECTED',policy:arrivalPolicy},notification:r.notification?{state:r.notification.state}:null,
      selectionCurrent};
  }
  private planningSnapshotFor(r: TripRecord): PlanningSnapshot {
    const selected = r.trip.selectedPlan;
    const binding = selected ? {
      selectedPlan: selected,
      recommendation: r.trip.recommendation ?? null,
      offer: r.networkOffers?.[selected.planId] ?? null,
      quoteDeadline: r.quoteDeadline,
      quoteExpiration: r.quoteExpirations?.[selected.planId] ?? null,
      signal: r.planSignals?.[selected.planId] ?? null,
      journey: r.completeJourney ?? null,
      networkConsentTerms: r.networkConsent ? { planId: r.networkConsent.planId, quoteId: r.networkConsent.quoteId, termsHash: r.networkConsent.termsHash } : null,
    } : null;
    const liabilities = (r.networkAttempts ?? []).map(a => ({ providerId:a.providerId,quoteId:a.quoteId,amountMinor:a.amountMinor,cancellationFeeMinor:a.cancellationFeeMinor,payment:a.payment,outcome:a.outcome??null })).sort((a,b)=>`${a.providerId}:${a.quoteId}`.localeCompare(`${b.providerId}:${b.quoteId}`));
    const snapshotId = digest({
      objective:{maxBudgetMinor:Math.round(r.context.maxBudget*100),minimizeWalking:r.context.minimizeWalking,minimizeTransfers:r.context.minimizeTransfers,cannotWalk:r.context.cannotWalk??false,maxWalkingMinutes:r.context.maxWalkingMinutes??null,hasBeenDrinking:r.context.hasBeenDrinking??false,exhausted:r.context.exhausted??false},
      state:r.trip.state,replanCount:r.replanCount,excluded:[...r.excluded].sort(),privateRevision:r.private?digest({origin:r.private.origin,home:r.private.home,lastKnown:r.trip.lastKnownLocation??null}):null,
      candidates:r.trip.candidates,binding,liabilities,remainingBudgetMinor:remainingBudgetMinor(r),corridorId:r.corridorId??null,optionEvidence:r.optionEvidence??null,decisionEvidence:r.decisionEvidence??null,
    });
    const preferences:string[]=[];
    if(r.context.minimizeWalking)preferences.push("minimize_walking");
    if(r.context.minimizeTransfers)preferences.push("minimize_transfers");
    return {snapshotId,terminal:["ARRIVED","FAILED"].includes(r.trip.state),input:{objective:"get_home",constraints:{maxBudgetMinor:Math.round(r.context.maxBudget*100),remainingBudgetMinor:remainingBudgetMinor(r)},preferences,context:{originZone:r.originZone,destinationZone:r.destinationZone}},...(selected?{selectedPlanId:selected.planId,expiresAt:this.selectedDeadline(r),facts:this.planningFacts(r,selected)}:{})};
  }
  async planningSnapshot(id:string,owner:string){const r=await this.deps.store.read(id);owns(r,owner);return this.planningSnapshotFor(r);}
  async planningEvaluate(id:string,owner:string,expectedSnapshotId:string,_intent:Intent):Promise<PlanningSelection>{
    const before=await this.deps.store.read(id);owns(before,owner);if(this.planningSnapshotFor(before).snapshotId!==expectedSnapshotId)throw new TripError("STALE_SNAPSHOT","Trip changed while planning");
    const topics=[...new Set(_intent.evidenceRequests.map(r=>r.topic))];
    const contextFacts:Fact[]=[];
    const corridor=before.corridorId??(before.originZone==="Downtown Blacksburg"?"downtown-pritchard":undefined);
    if(topics.length&&this.deps.contextReader&&corridor){
      try{
        const request:ContextRequest={version:"beacon-context-v1",requestId:randomUUID(),corridorId:corridor,topics,evaluatedAt:new Date(this.now()).toISOString()};
        const context=this.deps.activity?await this.deps.activity.call(id,{sender:"student",recipient:"safety-research",operation:"context.query",execution:"live",safeData:{}},()=>this.deps.contextReader!(request),result=>({safeData:{evidenceCount:result.evidence.length,gapCount:result.gaps.length,leadCount:result.leads.length,lookupMode:result.lookupMode},execution:"live",evidenceIds:result.evidence.map(e=>e.id)})):await this.deps.contextReader(request);
        for(const evidence of context.evidence.slice(0,4))contextFacts.push({id:evidence.id,text:evidence.statement});
        if(context.gaps.includes("CURRENT_LIGHTING_UNKNOWN"))contextFacts.push({id:"context_lighting_unknown",text:"Current route lighting is unknown."});
      }catch{/* Context is optional; mandatory local validation still runs. */}
    }
    const current=await this.deps.store.read(id);owns(current,owner);if(this.planningSnapshotFor(current).snapshotId!==expectedSnapshotId)throw new TripError("STALE_SNAPSHOT","Trip changed while gathering context");
    if(current.trip.state==="SELECTED"&&this.selectedDeadline(current)<=this.now())await this.deps.store.update(id,async r=>{owns(r,owner);if(this.planningSnapshotFor(r).snapshotId!==expectedSnapshotId)throw new TripError("STALE_SNAPSHOT","Trip changed while refreshing quotes");delete r.trip.selectedPlan;delete r.trip.recommendation;delete r.identity;delete r.networkConsent;r.confirmed=false;r.trip.providerVerified=false;this.log(r,"COLLECTING_QUOTES","QUOTE_REFRESH_REQUIRED","Refreshing expired quotes for planning");});
    const ready=await this.deps.store.read(id);owns(ready,owner);
    if(ready.trip.state==="OBJECTIVE_RECEIVED"||ready.trip.state==="COLLECTING_QUOTES")await this.act(id,owner,"discover");
    await this.act(id,owner,"evaluate");
    const after=await this.deps.store.read(id);owns(after,owner);const snapshot=this.planningSnapshotFor(after),plan=after.trip.selectedPlan;
    if(!plan||!snapshot.expiresAt||snapshot.expiresAt<=this.now())throw new TripError("QUOTE_EXPIRED","Refresh the recommendation before presenting it");
    const facts=this.planningFacts(after,plan);
    return{snapshotId:snapshot.snapshotId,selectedPlanId:plan.planId,expiresAt:snapshot.expiresAt,facts:[...facts,...contextFacts].slice(0,12)};
  }
  async events(id: string, owner: string) { const record = await this.deps.store.read(id); owns(record, owner); return record.events; }
  async evidence(id: string, owner: string) {
    const r = await this.deps.store.read(id); owns(r, owner);
    const current = isCurrentWeather(r.weatherEvidence, this.now());
    return { coordination: coordinationView(r, this.now()), weather: current ? r.weatherEvidence! : { status: "unknown", condition: "unknown" },
      appliedToPlanIds: current ? r.weatherPlanIds ?? [] : [], catalog: "/api/demo/campus-data",
      ...(r.corridorId ? { corridorId: r.corridorId } : {}),
      ...(r.optionEvidence ? { options: r.optionEvidence } : {}),
      ...(r.decisionEvidence ? { intelligence: r.decisionEvidence, selectionCurrent: !!r.trip.selectedPlan && !["FAILED", "ARRIVED", "COLLECTING_QUOTES"].includes(r.trip.state) && this.selectedDeadline(r) > this.now(), evidenceEvaluatedAt: r.decisionEvidence.decision.evaluatedAt } : {}),
      limitations: ["Area forecast, not observed conditions on each path.", "No current foot-traffic measurement, verified route lighting or crime-risk score is available."] };
  }
  async providerEvent(id: string, providerId: string, bookingId: string, event: string, details?:unknown) {
    return this.deps.store.update(id, async (r) => {
      if (r.booking?.providerId !== providerId || r.booking.id !== bookingId) throw new TripError("STALE_PROVIDER_EVENT", "Event does not belong to the active booking");
      requireState(r, [...activeStates]);
      const supported=['provider.searching','provider.assigned','provider.approaching','provider.arrived','provider.in_trip','provider.completed','provider.cancelled','provider.declined'];
      if(!supported.includes(event))throw new TripError('INVALID_EVENT','Unsupported provider event',400);
      const parsed=parseProviderDetails({...object(details??{}),stage:event==='provider.declined'?'cancelled':event.slice('provider.'.length)});
      if(parsed.updatedAt&&r.rideObservation?.providerUpdatedAt&&Date.parse(parsed.updatedAt)<=Date.parse(r.rideObservation.providerUpdatedAt))return r.trip;
      if(parsed.updatedAt&&Date.parse(parsed.updatedAt)>this.now()+30000)throw new TripError('INVALID_EVENT_TIME','Provider update time is in the future',400);
      r.rideObservation=observeProvider({status:event.slice('provider.'.length),details:parsed},'provider_event',this.now(),(r.simulatedPlanIds??[]).includes(r.trip.selectedPlan?.planId??''),r.rideObservation);
      if(r.rideObservation.stage!==parsed.stage)return r.trip;
      if (event === "provider.cancelled" || event === "provider.declined") await this.recover(r, true);
      else if (event === "provider.in_trip") this.log(r, r.trip.state==='OVERDUE'?'OVERDUE':"IN_TRIP", "PROVIDER_IN_TRIP", "Trip in progress");
      else if (event === "provider.completed") this.providerCompleted(r);
      else this.log(r,r.trip.state==='OVERDUE'?'OVERDUE':'WAITING_FOR_PICKUP','PROVIDER_STAGE_UPDATED','Provider pickup status updated');
      this.advanceJourney(r);await this.checkDeadline(r);await this.flushOutcomes(r);
      return r.trip;
    });
  }
  async reset(owner: string) {
    if (!this.deps.demo) throw new TripError("DEMO_DISABLED", "Demo controls are disabled", 404);
    for (const id of await this.deps.store.list()) {
      await this.deps.store.update(id, async (r) => {
        if (r.owner !== owner) return;
        if (r.private) await this.arrive(r);
        this.log(r, "FAILED", "DEMO_RESET", "Demo trip reset");
      });
    }
  }
  async act(id: string, owner: string, action: Action, input: unknown = {}) {
    return this.deps.store.update(id, async (record) => {
      owns(record, owner);
      if (action === "discover") { requireState(record, ["OBJECTIVE_RECEIVED", "COLLECTING_QUOTES"]); await this.discover(record); }
      if (action === "evaluate") { requireState(record, ["COLLECTING_QUOTES", "SELECTED"]); if (record.confirmed) throw new TripError("ALREADY_CONFIRMED", "Plan is already confirmed"); await this.evaluate(record); }
      if (action === "confirm") {
        requireState(record, record.networkAttempts?.length && !record.booking && !record.pendingBooking && !record.confirmed ? ["SELECTED", "OVERDUE"] : ["SELECTED"]);
        if (this.selectedDeadline(record) <= this.now()) this.expireSelection(record);
        const displayed = object(input);
        const journey=syncJourney(record,this.now());
        if((record.journeyContract||displayed.journeyRevision!==undefined)&&displayed.journeyRevision!==journey.revision)throw new TripError('JOURNEY_CHANGED','Review the current journey before confirming');
        if (displayed.planId !== undefined && displayed.planId !== record.trip.selectedPlan?.planId) throw new TripError("SELECTION_CHANGED", "The selected plan changed; review it before confirming");
        confirmNetwork(record, input);
        record.journeyConfirmedRevision=journey.revision;
        record.confirmed = true; this.log(record, "SELECTED", "USER_CONFIRMED", "Plan confirmed");
        await this.deps.activity?.emit(record.trip.id,{sender:"student",recipient:"code",operation:"student.confirm",phase:"info",execution:"live",safeData:{confirmed:true}});
      }
      if (action === "verify") { requireState(record, ["SELECTED"]); await this.verify(record); }
      if (action === "request") {
        if (record.pendingBooking) { await this.reconcileBooking(record); await this.checkDeadline(record); return structuredClone(record.trip); }
        if (record.booking && (activeStates as readonly string[]).includes(record.trip.state)) return record.trip;
        requireState(record, ["SELECTED", "VERIFYING_PROVIDER"]); await this.coordinate(record);
      }
      if (action === "location") await this.location(record, input);
      if(action==='replan'){
        const body=object(input);if(body.journeyRevision!==record.journey?.revision)throw new TripError('JOURNEY_CHANGED','Review the current journey before replanning');
        if(!['route_changed','pickup_changed','conditions_changed'].includes(String(body.reason)))throw new TripError('INVALID_REPLAN_REASON','Specify a supported condition change',400);
        if(record.pendingBooking)throw new TripError('BOOKING_UNCERTAIN','Reconcile the existing booking before replanning');
        if(record.booking){await this.recover(record);}
        else {requireState(record,['SELECTED','NAVIGATING','OVERDUE','COLLECTING_QUOTES']);record.confirmed=false;delete record.networkConsent;delete record.identity;delete record.journeyConfirmedRevision;record.replanCount++;await this.discover(record);await this.evaluate(record);}
      }
      if (action === "arrive") { if (!record.pendingBooking && !record.pendingReplacement && !(record.private && record.networkAttempts?.length && record.trip.selectedPlan)) requireState(record, [...activeStates, "ARRIVED"]); if (record.trip.state !== "ARRIVED") await this.arrive(record); }
      if (action === "cancel-provider") { if (!this.deps.demo) throw new TripError("DEMO_DISABLED", "Demo controls are disabled", 404); requireState(record, ["WAITING_FOR_PICKUP", "IN_TRIP"]); await this.recover(record); }
      if (action === "expire-deadline") { if (!this.deps.demo) throw new TripError("DEMO_DISABLED", "Demo controls are disabled", 404); requireState(record, [...activeStates]); record.trip.alertDeadlineAt = new Date(this.now() - 1).toISOString(); await this.checkDeadline(record); }
      await this.flushOutcomes(record);
      this.advanceJourney(record);syncJourney(record,this.now());
      return structuredClone(record.trip);
    });
  }
  private log(r: TripRecord, state: TripRecord["trip"]["state"], code: string, message: string) { transition(r, state, code, message, this.now());syncJourney(r,this.now()); }
  private observe(r:TripRecord,result:ProviderTrip){r.rideObservation=observeProvider(result,'provider_poll',this.now(),(r.simulatedPlanIds??[]).includes(r.trip.selectedPlan?.planId??''),r.rideObservation);}
  private advanceJourney(r:TripRecord){
    const journey=r.completeJourney?.selected;
    if(!journey||!['NAVIGATING','WAITING_FOR_PICKUP','IN_TRIP','OVERDUE'].includes(r.trip.state))return;
    let index=r.journeyLegIndex??0;
    const stage=r.rideObservation?.stage,rideIndex=journey.legs.findIndex(l=>l.kind==='ride');
    if(rideIndex>=0&&stage==='in_trip')index=Math.max(index,rideIndex);
    if(rideIndex>=0&&stage==='completed')index=Math.max(index,rideIndex+1);
    // Scheduled times never prove boarding or arrival; movement needs a provider
    // observation or a fresh accurate location near the evaluated leg endpoint.
    while(index<journey.legs.length){
      const leg=journey.legs[index],location=r.trip.lastKnownLocation;
      if(leg.kind==='wait'&&this.now()>=Date.parse(leg.endsAt)){index++;continue;}
      if((leg.kind==='walk'||leg.kind==='bus')&&location&&r.journeyLocationAccuracy!==undefined&&r.journeyLocationAccuracy<=30
        &&Date.parse(location.recordedAt)>=this.now()-30000&&Date.parse(location.recordedAt)>=Date.parse(leg.startsAt)
        &&distanceMeters(location,leg.to.point)+r.journeyLocationAccuracy<=30){index++;continue;}
      break;
    }
    r.journeyLegIndex=index;syncJourney(r,this.now());
  }
  private providerCompleted(r:TripRecord){
    if(r.trip.state==='NAVIGATING'&&r.rideObservation?.stage==='completed')return;
    this.log(r,r.trip.state==='OVERDUE'?'OVERDUE':'NAVIGATING','PROVIDER_RIDE_COMPLETED','Ride completed; confirm arrival home or continue location updates');
  }
  private providerNode(provider:ProviderDescriptor){return ["campus_ride","independent_ride","lyft-demo","transit"].includes(provider.id)?provider.id:"provider";}
  private selectedProvider(r: TripRecord) { const p = r.providers.find((p) => p.id === r.trip.selectedPlan?.providerId); if (!p) throw new TripError("PROVIDER_MISSING", "Selected provider is unavailable"); return p; }
  private planDeadline(r: TripRecord, planId: string) {
    const weatherLimit = r.weatherPlanIds?.includes(planId) && r.weatherEvidence?.validUntil ? Date.parse(r.weatherEvidence.validUntil) : Infinity;
    const signalLimit = r.planSignals?.[planId]?.validUntil;
    const offerLimit = r.networkOffers?.[planId]?.offer.expiresAt;
    return Math.min(offerLimit ? Date.parse(offerLimit) : Infinity, r.quoteDeadline, r.quoteExpirations?.[planId] ?? Infinity, weatherLimit, signalLimit ? Date.parse(signalLimit) : Infinity);
  }
  private selectedDeadline(r: TripRecord) { return this.planDeadline(r, r.trip.selectedPlan?.planId ?? ""); }
  private expireSelection(r: TripRecord): never {
    delete r.trip.selectedPlan; delete r.trip.recommendation; delete r.identity;
    delete r.completeJourney;delete r.completeJourneyOrigin;delete r.journeyConfirmedRevision;
    r.trip.providerVerified = false;
    // Cancellation recovery already has authorization within the saved objective.
    // An ordinary stale selection needs a fresh, explicit confirmation.
    if (!r.pendingReplacement || r.networkAttempts?.length) r.confirmed = false;
    delete r.networkConsent;
    this.log(r, "COLLECTING_QUOTES", "QUOTE_EXPIRED", "Quotes or weather context expired; refresh the recommendation");
    throw new TripError("QUOTE_EXPIRED", "Refresh the recommendation before confirming or booking");
  }
  private async discover(r: TripRecord) {
    delete r.completeJourney;delete r.completeJourneyOrigin;delete r.journeyLegIndex;
    this.log(r, "DISCOVERING", "DISCOVERY_STARTED", "Finding transportation providers");
    try { r.providers = this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"student",recipient:"ans",operation:"directory.discover",execution:"live",identity:"not_applicable",safeData:{}},()=>this.deps.directory.discover(),providers=>({safeData:{providerCount:providers.length},execution:"live"})) : await this.deps.directory.discover(); }
    catch {
      if(r.journeyContract==='beacon-journey-v1'&&this.deps.getCompleteJourney){r.providers=[];this.log(r,'DISCOVERING','DISCOVERY_UNAVAILABLE','Provider discovery unavailable; checking walking and public transit');}
      else {this.log(r, "FAILED", "DISCOVERY_FAILED", "Provider discovery is unavailable; no location was shared");throw new TripError("DISCOVERY_FAILED", "Provider discovery unavailable", 503);}
    }
    this.log(r, "COLLECTING_QUOTES", "COARSE_QUOTES", "Requesting quotes using approximate zones only");
    const result = await collectCandidates(r.providers.map((descriptor) => ({ descriptor, quote: async request => {
      const identity = descriptor.source === "ans" ? (this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"student",recipient:"ans",operation:"identity.verify",execution:"live",safeData:{}},()=>this.deps.directory.verify(descriptor),verified=>({safeData:{verified:true},execution:"live",identity:verified.source==="ans"?"ans_verified":"local_demo"})) : await this.deps.directory.verify(descriptor)) : undefined;
      const quote=()=>this.deps.provider(descriptor, identity).quote(request);
      return this.deps.activity ? this.deps.activity.call(r.trip.id,{sender:"student",recipient:this.providerNode(descriptor),operation:"provider.quote",execution:"live",identity:identity?.source==="ans"?"ans_verified":descriptor.source==="demo"?"local_demo":"not_verified",safeData:{}},quote,result=>({safeData:{available:result.available,costMinor:Math.round(result.cost*100),currency:"USD",waitMinutes:result.waitMinutes,walkingMinutes:result.walkingMinutes,simulated:result.quoteSource==="simulated"||result.network?.offer.simulated===true,quoteExpiresAt:new Date(result.quoteExpiresAt??this.now()+120000).toISOString()},execution:result.quoteSource==="simulated"||result.network?.offer.simulated===true?"simulated":"live"})) : quote();
    } })), { originZone: r.originZone, destinationZone: r.destinationZone, ...r.context, maxBudget: remainingBudgetMinor(r) / 100 }, new Set(r.excluded), 22, this.now());
    r.networkOffers = result.networkOffers;
    r.trip.candidates = result.candidates; r.quoteDeadline = this.now() + 120_000; r.quoteExpirations = result.quoteExpirations; r.simulatedPlanIds = result.simulatedPlanIds;
    delete r.decisionEvidence; delete r.optionEvidence; r.planSignals = {};
    if (r.corridorId) {
      // Remove the fixed walk for a named real route even when route data fails.
      r.trip.candidates = r.trip.candidates.filter(p => p.mode !== "walk");
      const latest = r.trip.lastKnownLocation;
      const origin = latest && Date.parse(latest.recordedAt) >= this.now() - 120_000 ? latest : r.private?.origin;
      if (origin && r.private && matchesPublicCorridor(r.corridorId, origin, r.private.home) && this.deps.publicTripOptions) {
        try {
          const { candidates, signals, ...evidence } = await this.deps.publicTripOptions(r.corridorId, this.deps.demo, new Date(this.now()).toISOString());
          const publicOptions = candidates.filter(p => !r.excluded.includes(p.providerId ?? ""));
          // Reserve capacity for mapped/timetable options without changing the provider search contract.
          const omitted = Math.max(0, r.trip.candidates.length + publicOptions.length - 16);
          r.trip.candidates = [...r.trip.candidates.slice(0, 16 - publicOptions.length), ...publicOptions];
          if (omitted) this.log(r, "COLLECTING_QUOTES", "PROVIDER_LIMIT", `${omitted} provider offer(s) omitted to include public route options within the 16-plan limit`);
          r.planSignals = signals; r.optionEvidence = evidence;
          for (const plan of publicOptions) if (signals[plan.planId]?.validUntil) r.quoteExpirations[plan.planId] = Date.parse(signals[plan.planId].validUntil!);
          this.log(r, "COLLECTING_QUOTES", "PUBLIC_OPTIONS_ADDED", "Checked mapped walking and scheduled transit for the selected public campus route");
        } catch { this.log(r, "COLLECTING_QUOTES", "PUBLIC_OPTIONS_UNAVAILABLE", "Public route options unavailable; provider offers remain separately labeled"); }
      } else this.log(r, "COLLECTING_QUOTES", "PUBLIC_ROUTE_NOT_APPLICABLE", "The saved public route does not apply to the current pickup; no mapped path was attached");
      r.simulatedPlanIds = r.simulatedPlanIds.filter(id => r.trip.candidates.some(p => p.planId === id));
    }
    if (result.omittedProviderCount) this.log(r, "COLLECTING_QUOTES", "PROVIDER_LIMIT", `${result.omittedProviderCount} additional providers omitted from this bounded search`);
    if (result.failures.length) this.log(r, "COLLECTING_QUOTES", "PROVIDER_UNAVAILABLE", `${result.failures.length} provider option(s) could not be used`);
  }
  private async evaluate(r: TripRecord) {
    const expired = (): never => this.expireSelection(r);
    if (r.quoteDeadline <= this.now()) expired();
    if((r.context.cannotWalk===true||r.context.maxWalkingMinutes!==undefined)&&!this.deps.getCompleteJourney)throw new TripError('JOURNEY_UNAVAILABLE','Hard walking constraints require complete journey planning',503);
    if(r.journeyContract==='beacon-journey-v1'&&this.deps.getCompleteJourney){
      this.log(r,'EVALUATING','EVALUATION_STARTED','Evaluating complete walking, transit and ride journeys');
      try{
        const evaluate=()=>evaluateCompleteJourney(r,this.deps,this.now());
        const {result,selected,candidates}=this.deps.activity
          ? await this.deps.activity.call(r.trip.id,{sender:'student',recipient:'databricks',operation:'decision.evaluate',safeData:{candidateCount:r.trip.candidates.length}},evaluate,
            value=>({safeData:{candidateCount:value.candidates.length,engine:value.result.execution.engine},execution:value.result.execution.engine==='databricks'?'live':'local_fallback'}))
          : await evaluate();
        if(!selected||!result.selected){delete r.trip.selectedPlan;delete r.trip.recommendation;this.log(r,'FAILED','NO_FEASIBLE_JOURNEY','No complete journey fits the available routes and approved constraints');throw new TripError('NO_FEASIBLE_JOURNEY','No complete journey is currently available',422);}
        r.quoteExpirations??={};r.quoteExpirations[selected.planId]=Math.min(r.quoteExpirations[selected.planId]??Infinity,Date.parse(result.selected.validUntil));
        if(this.planDeadline(r,selected.planId)<=this.now())expired();
        r.trip.candidates=candidates;r.trip.selectedPlan=selected;
        r.trip.recommendation={selectedPlanId:selected.planId,...(candidates[1]?{runnerUpPlanId:candidates[1].planId}:{}),reasonCodes:['COMPLETE_JOURNEY',result.execution.engine==='databricks'?'DATABRICKS_JOURNEY_RANKING':'LOCAL_JOURNEY_FALLBACK'],explanation:result.selected.explanationFacts.join(' '),evaluatedAt:result.evaluatedAt};
        r.trip.providerVerified=false;r.trip.sensitiveDataReleased=Boolean(r.cleanup?.length);delete r.identity;delete r.networkConsent;delete r.journeyConfirmedRevision;r.confirmed=false;
        this.log(r,'SELECTED','PLAN_SELECTED',`${selected.providerName} recommended; awaiting confirmation`);return;
      }catch(error){
        if(error instanceof TripError&&['QUOTE_EXPIRED','NO_FEASIBLE_JOURNEY'].includes(error.code))throw error;
        delete r.trip.selectedPlan;delete r.trip.recommendation;delete r.completeJourney;delete r.completeJourneyOrigin;
        this.log(r,'FAILED','EVALUATION_FAILED','Complete journey planning unavailable');
        if(error instanceof TripError)throw error;
        throw new TripError('EVALUATION_FAILED','Complete journey planning unavailable',503);
      }
    }
    delete r.weatherEvidence; r.weatherPlanIds = [];
    // Research reads a pre-imported campus forecast. Student coordinates stay local.
    const latest = r.trip.lastKnownLocation;
    const origin = latest && Date.parse(latest.recordedAt) >= this.now() - 120_000 ? latest : r.private?.origin;
    if (origin && r.private && withinCampusForecast(origin) && withinCampusForecast(r.private.home)) {
      try { r.weatherEvidence = this.deps.campusWeather?.(this.now()); } catch { /* Missing evidence stays unknown. */ }
      if (isCurrentWeather(r.weatherEvidence, this.now())) r.weatherPlanIds = [...(r.simulatedPlanIds ?? [])];
    }
    this.log(r, "EVALUATING", "EVALUATION_STARTED", "Evaluating transportation options");
    let recommendation: Recommendation;
    delete r.decisionEvidence;
    const decide=()=>this.deps.recommend(r.trip.candidates, { ...r.context, maxBudget: remainingBudgetMinor(r) / 100, currentTime: new Date(this.now()).toISOString() }, { quoteDeadline: r.quoteDeadline, quoteExpirations: r.quoteExpirations ?? {}, simulatedPlanIds: r.simulatedPlanIds ?? [], excludedProviderIds: [...r.excluded], weatherEvidence: r.weatherEvidence, planSignals: r.planSignals, corridorId: r.optionEvidence?.walkingAlternative ? r.corridorId : undefined, walkingAlternative: r.optionEvidence?.walkingAlternative, onEvidence: evidence => {
      r.decisionEvidence = evidence;
      // Managed weather and explanation latency can shorten evidence validity too.
      for (const plan of evidence.decision.ranked) if (plan.evidence?.validUntil) (r.planSignals ??= {})[plan.planId] = plan.evidence;
    } });
    try { recommendation = this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"student",recipient:"databricks",operation:"decision.evaluate",execution:"live",safeData:{candidateCount:r.trip.candidates.length}},decide,()=>{const engine=(r.decisionEvidence as TripDecisionEvidence|undefined)?.decision.engine??"local_fallback";return{safeData:{candidateCount:r.trip.candidates.length,engine},execution:engine==="databricks"?"live":"local_fallback"};}) : await decide(); }
    catch (error) { this.log(r, "FAILED", "EVALUATION_FAILED", "No recommendation is available"); if (error instanceof TripError) throw error; throw new TripError("EVALUATION_FAILED", "Recommendation unavailable", 503); }
    const plan = r.trip.candidates.find((p) => p.planId === recommendation.selectedPlanId && p.available && p.cost <= remainingBudgetMinor(r) / 100 && !r.excluded.includes(p.providerId ?? ""));
    if (!plan || !Array.isArray(recommendation.reasonCodes) || !recommendation.reasonCodes.every((c) => typeof c === "string") || typeof recommendation.explanation !== "string" || !Number.isFinite(Date.parse(recommendation.evaluatedAt))) { this.log(r, "FAILED", "INVALID_RECOMMENDATION", "No valid plan fits the approved constraints"); throw new TripError("INVALID_RECOMMENDATION", "Decision engine returned an invalid plan", 502); }
    if (this.planDeadline(r, plan.planId) <= this.now()) expired();
    r.trip.recommendation = recommendation; r.trip.selectedPlan = plan; r.trip.providerVerified = false; r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length); delete r.identity;
    await this.deps.activity?.emit(r.trip.id,{sender:"databricks",recipient:"code",operation:"plan.validate",phase:"info",execution:"live",safeData:{accepted:true,factCount:(r.decisionEvidence as TripDecisionEvidence|undefined)?.decision.ranked.length??0,remainingBudgetMinor:remainingBudgetMinor(r)}});
    this.log(r, "SELECTED", "PLAN_SELECTED", `${plan.providerName} recommended; awaiting confirmation`);
  }
  private async verify(r: TripRecord) {
    if (!r.confirmed) throw new TripError("CONFIRMATION_REQUIRED", "Confirm the plan before provider verification");
    const plan = r.trip.selectedPlan; if (!plan) throw new TripError("PLAN_REQUIRED", "Select a plan first");
    if (plan.mode === "walk" || plan.mode === "transit") return;
    this.log(r, "VERIFYING_PROVIDER", "VERIFY_STARTED", "Checking provider identity and permissions");
    try {
      const provider = this.selectedProvider(r); r.identity = this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"student",recipient:"ans",operation:"identity.verify",execution:"live",safeData:{}},()=>this.deps.directory.verify(provider),verified=>({safeData:{verified:true},execution:"live",identity:verified.source==="ans"?"ans_verified":"local_demo"})) : await this.deps.directory.verify(provider);
      if (!authorize(provider, r.identity, r.confirmed, this.deps.demo, this.now()).preciseLocation) throw new Error("Policy denied");
      await this.deps.activity?.emit(r.trip.id,{sender:"authorization",recipient:"student",operation:"booking.authorize",phase:"info",execution:"live",identity:r.identity.source==="ans"?"ans_verified":"local_demo",safeData:{authorized:true,amountMinor:Math.round(plan.cost*100),currency:"USD"}});
      r.trip.providerVerified = r.identity.source === "ans";
      this.log(r, "VERIFYING_PROVIDER", r.trip.providerVerified ? "ANS_VERIFIED" : "LOCAL_DEMO_TRUST", r.trip.providerVerified ? "Provider identity verified through ANS" : "Local demo provider pretrusted; live ANS not used");
    } catch { delete r.identity; r.trip.providerVerified = false; this.log(r, "SELECTED", "VERIFICATION_DENIED", "Provider verification failed; precise location withheld"); throw new TripError("VERIFICATION_DENIED", "Provider verification or authorization failed", 403); }
  }
  private async coordinate(r: TripRecord) {
    if (!r.confirmed || !r.private || !r.trip.selectedPlan) throw new TripError("CONFIRMATION_REQUIRED", "Confirm a plan before requesting a trip");
    if (this.selectedDeadline(r) <= this.now()) this.expireSelection(r);
    if(r.journeyContract&&r.journeyConfirmedRevision!==syncJourney(r,this.now()).revision)throw new TripError('JOURNEY_CHANGED','Confirm the current journey before booking');
    if(r.completeJourneyOrigin&&digest(journeyOrigin(r,this.now()))!==digest(r.completeJourneyOrigin))throw new TripError('JOURNEY_CHANGED','Location changed; replan before booking');
    const plan = r.trip.selectedPlan;
    requireNetworkConsent(r);
    if (plan.mode === "walk" || plan.mode === "transit") { delete r.pendingReplacement; this.startMonitoring(r); this.log(r, "NAVIGATING", "NAVIGATION_STARTED", "Navigation started; no precise data shared with a provider"); return; }
    const provider = this.selectedProvider(r);
    if (!authorize(provider, r.identity, r.confirmed, this.deps.demo, this.now()).preciseLocation) throw new TripError("VERIFICATION_REQUIRED", "A current verified and authorized provider is required", 403);
    this.log(r, "COORDINATING", "POLICY_ALLOWED", "Precise pickup and destination permitted for this provider");
    r.trip.sensitiveDataReleased = true;
    r.pendingBooking = { providerId: provider.id, requestId: selectedOffer(r) ? randomUUID() : `${r.trip.id}-${r.replanCount}` };
    beginNetworkAttempt(r, r.pendingBooking.requestId, this.now());
    delete r.pendingReplacement;
    this.startMonitoring(r);
    // A lost response does not mean the provider rejected or erased this request.
    await this.deps.store.checkpoint(r);
    try {
      const latest = r.trip.lastKnownLocation;
      const bound=r.completeJourney?.selected?.offerLocationBinding;
      const pickup = bound?.pickup.point ?? (latest && Date.parse(latest.recordedAt) >= this.now() - 120_000 ? { lat: latest.lat, lng: latest.lng } : r.private.origin);
      const network = selectedOffer(r);
      const book=()=>this.deps.provider(provider, r.identity).requestTrip({ tripId: r.pendingBooking!.requestId, pickup, destination: bound?.dropoff.point ?? r.private!.home, ...(network ? { network: { offer: network.offer, consentId: r.networkConsent!.id } } : {}) });
      const simulated=(network?.offer.simulated===true)||(r.simulatedPlanIds??[]).includes(plan.planId);
      const result = this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"student",recipient:this.providerNode(provider),operation:"provider.book",execution:simulated?"simulated":"live",identity:r.identity?.source==="ans"?"ans_verified":"local_demo",safeData:{}},book,value=>({safeData:{status:value.status==="in_trip"?"in_progress":value.status,simulated,amountMinor:network?.offer.price.totalMinor??Math.round(plan.cost*100),currency:"USD"},execution:simulated?"simulated":"live"})) : await book();
      acceptNetworkResult(r, result, this.now()); if(result)this.observe(r,result);
      if (result.status === "declined" && networkAttempt(r)) { this.paymentDeclined(r); return; }
      if (!["accepted", "waiting"].includes(result.status)) throw new Error("Provider rejected trip");
      r.booking = { providerId: provider.id, id: result.id, requestId: r.pendingBooking.requestId }; delete r.pendingBooking;
      this.log(r, "WAITING_FOR_PICKUP", "PROVIDER_ACCEPTED", `${plan.providerName} accepted your trip`);
    } catch {
      // A timeout may mean the provider accepted. Keep the idempotency key and require
      // status reconciliation rather than silently booking another provider.
      this.log(r, "FAILED", "BOOKING_UNCERTAIN", "Provider response unavailable; booking status needs checking");
      throw new TripError("BOOKING_UNCERTAIN", "Provider response unavailable; do not create a duplicate booking", 502);
    }
  }
  private paymentDeclined(r: TripRecord) {
    delete r.pendingBooking; delete r.booking; delete r.networkConsent; delete r.identity;
    r.confirmed = false; r.networkAction = "payment_declined"; r.trip.providerVerified = false;
    r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length);
    if (!r.replanCount) { delete r.trip.alertDeadlineAt; delete r.trip.expectedArrivalAt; }
    this.log(r, "SELECTED", "PAYMENT_DECLINED", "Demo payment declined; review the plan before trying again");
  }
  private startMonitoring(r: TripRecord) {
    const eta = r.completeJourney?.selected ? Date.parse(r.completeJourney.selected.arrivalAt) : this.now() + r.trip.selectedPlan!.totalMinutes * 60_000;
    r.trip.expectedArrivalAt = new Date(eta).toISOString();
    r.trip.alertDeadlineAt = new Date(eta + (this.deps.graceMinutes ?? 5) * 60_000).toISOString();
  }
  private async reconcileBooking(r: TripRecord) {
    const pending = r.pendingBooking;
    if (!pending || (pending.retryAt ?? 0) > this.now()) return;
    const provider = this.selectedProvider(r);
    let result;
    try {
      const client = this.deps.provider(provider, r.identity);
      if (!client.getRequestStatus) throw new Error("Provider cannot reconcile requests");
      result = await client.getRequestStatus(pending.requestId);
      if (!result) {
        // A missing lookup is not proof that a delayed original request cannot
        // arrive. Fence that request with a durable cancellation before replanning.
        if (!client.cancelRequest) throw new Error("Provider cannot cancel requests");
        const cancellation = await client.cancelRequest(pending.requestId);
        acceptCancellationResult(r, cancellation, this.now());
        if (networkAttempt(r) && cancellation) result = cancellation;
      } else acceptNetworkResult(r, result, this.now()); if(result)this.observe(r,result);
    } catch {
      pending.attempts = (pending.attempts ?? 0) + 1;
      pending.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(pending.attempts - 1, 3));
      if (pending.attempts === 1) this.log(r, r.trip.state, "BOOKING_CHECK_PENDING", "Booking status unavailable; checking again before any replacement");
      return;
    }
    delete r.pendingBooking;
    if (!result) { await this.replace(r, provider, "Previous request cancelled; finding a replacement"); return; }
    if (result.status === "declined" && networkAttempt(r, pending.requestId)) { this.paymentDeclined(r); return; }
    r.booking = { providerId: provider.id, id: result.id, requestId: pending.requestId };
    if (result.status === "completed") { this.providerCompleted(r); return; }
    if (result.status === "cancelled") { await this.recover(r, true, result); return; }
    if (r.trip.state !== "OVERDUE") this.log(r, result.status === "in_trip" ? "IN_TRIP" : "WAITING_FOR_PICKUP", "BOOKING_RECONCILED", "Provider booking confirmed; monitoring resumed");
  }
  private async recover(r: TripRecord, cancellationConfirmed = false, knownResult?: ProviderTrip) {
    if (!r.booking) throw new TripError("NO_BOOKING", "No provider booking to replace");
    const failed = this.selectedProvider(r);
    let declined=knownResult?.status==='declined';
    if (networkAttempt(r)) {
      if (!knownResult) { uncertainPayment(r); await this.deps.store.checkpoint(r); }
      const client = this.deps.provider(failed, r.identity);
      let result;
      const simulated=(r.simulatedPlanIds??[]).includes(r.trip.selectedPlan?.planId??"");
      try { result = knownResult ?? (this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"student",recipient:this.providerNode(failed),operation:cancellationConfirmed?"provider.status":"provider.cancel",execution:simulated?"simulated":"live",safeData:{}},()=>cancellationConfirmed?client.getStatus(r.booking!.id):client.cancelTrip(r.booking!.id),value=>{const status=value&&value.status==="in_trip"?"in_progress":value&&value.status||"cancelled";return{safeData:{status,simulated},execution:simulated?"simulated":"live"};}) : cancellationConfirmed ? await client.getStatus(r.booking.id) : await client.cancelTrip(r.booking.id)); }
      catch { throw new TripError("SETTLEMENT_UNCERTAIN", "Checking the previous booking and demo payment before another request", 502); }
      acceptNetworkResult(r, result, this.now()); if(result)this.observe(r,result);
      if (result?.status === "completed") { this.providerCompleted(r); return; }
      if (result?.status !== "cancelled" && result?.status !== "declined") { uncertainPayment(r); throw new TripError("SETTLEMENT_UNCERTAIN", "Previous booking cancellation is not confirmed", 502); }
      declined=result.status==='declined';
    } else if (cancellationConfirmed) this.queueCleanup(r);
    else if(this.deps.activity){const simulated=(r.simulatedPlanIds??[]).includes(r.trip.selectedPlan?.planId??"");await this.deps.activity.call(r.trip.id,{sender:"student",recipient:this.providerNode(failed),operation:"provider.cancel",execution:simulated?"simulated":"live",safeData:{}},()=>this.deps.provider(failed,r.identity).cancelTrip(r.booking!.id),value=>{const status=value&&value.status==="in_trip"?"in_progress":value&&value.status||"cancelled";return{safeData:{status,simulated},execution:simulated?"simulated":"live"};});}
    else await this.deps.provider(failed, r.identity).cancelTrip(r.booking.id);
    await this.replace(r, failed, declined ? "Your provider could not fulfill the ride; finding a replacement" : "Your provider cancelled; finding a replacement", declined ? 'PROVIDER_DECLINED' : 'PROVIDER_CANCELLED');
  }
  private async replace(r: TripRecord, failed: ProviderDescriptor, message: string, code = 'PROVIDER_CANCELLED') {
    const offer=selectedOffer(r)?.offer;if(offer)(r.excludedJourneyServices??=[]).push({operatorId:offer.providerId,serviceId:offer.serviceId});
    r.excluded.push(failed.id); delete r.booking; delete r.identity; delete r.rideObservation; delete r.arrivalEvidence; delete r.journeyConfirmedRevision;
    if (r.networkAttempts?.length) { r.confirmed = false; delete r.networkConsent; }
    r.trip.providerVerified = false; r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length); r.replanCount++;
    await this.deps.activity?.emit(r.trip.id,{sender:"monitor",recipient:"student",operation:"trip.replan",phase:"info",execution:"live",safeData:{replanCount:r.replanCount,remainingBudgetMinor:remainingBudgetMinor(r)}});
    r.pendingReplacement = { attempts: 0, retryAt: this.now() };
    this.log(r, "PROVIDER_FAILED", code, message);
    await this.deps.store.checkpoint(r);
    await this.flushCleanup(r);
    await this.resumeReplacement(r);
  }
  private async resumeReplacement(r: TripRecord) {
    if (!r.pendingReplacement || r.pendingReplacement.retryAt > this.now()) return;
    if (r.replanCount > 3) { delete r.pendingReplacement; this.log(r, "FAILED", "RECOVERY_LIMIT", "No replacement is available within your constraints"); return; }
    try {
      this.log(r, "REPLANNING", "REPLAN_STARTED", "Replanning within your approved budget and preferences");
      await this.discover(r); await this.evaluate(r);
      if (r.journeyContract || r.networkAttempts?.length || selectedOffer(r)) { r.confirmed = false; delete r.networkConsent; delete r.pendingReplacement; return; }
      await this.verify(r); await this.coordinate(r);
    } catch (error) {
      if (r.pendingReplacement) {
        r.pendingReplacement.attempts++;
        r.pendingReplacement.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(r.pendingReplacement.attempts - 1, 3));
      }
      throw error;
    }
  }
  private async location(r: TripRecord, input: unknown) {
    if (!r.pendingBooking && !r.pendingReplacement && !(r.private && r.networkAttempts?.length && r.trip.selectedPlan)) requireState(r, [...activeStates]); const raw = object(input); const location = point(raw);
    const recorded = Date.parse(String(raw.recordedAt ?? new Date(this.now()).toISOString()));
    if (!Number.isFinite(recorded) || recorded > this.now() + 30_000 || recorded < this.now() - 120_000 || (r.trip.lastKnownLocation && recorded <= Date.parse(r.trip.lastKnownLocation.recordedAt))) throw new TripError("INVALID_LOCATION_TIME", "Location timestamp is stale or out of order", 400);
    r.trip.lastKnownLocation = { ...location, recordedAt: new Date(recorded).toISOString() };
    r.journeyLocationAccuracy=typeof raw.accuracyMeters==='number'&&Number.isFinite(raw.accuracyMeters)&&raw.accuracyMeters>=0?raw.accuracyMeters:undefined;
    if(r.private){const arrival=assessArrival(r.arrivalEvidence,{...location,recordedAt:recorded,accuracyMeters:raw.accuracyMeters},r.private.home,this.now());r.arrivalEvidence=arrival.evidence;r.arrivalStatus=arrival.reason;if(arrival.arrived)await this.arrive(r);}
  }
  private async arrive(r: TripRecord) {
    this.queueCleanup(r);
    delete r.arrivalEvidence;delete r.rideObservation;r.arrivalStatus='ARRIVED';delete r.journeyConfirmedRevision;
    delete r.completeJourney;delete r.completeJourneyOrigin;delete r.journeyLegIndex;delete r.journeyLocationAccuracy;
    delete r.networkConsent; delete r.private; delete r.identity; delete r.booking; delete r.pendingBooking; delete r.pendingReplacement; delete r.trip.lastKnownLocation; delete r.trip.alertDeadlineAt;
    r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length); r.trip.providerVerified = false;
    this.log(r, "ARRIVED", "TRIP_COMPLETED", r.cleanup?.length ? "Home reached; provider cleanup pending" : "Home reached; location sharing ended");
    // Persist the minimal revocation task before calling an external service.
    // It contains identifiers and TLS evidence, never home/contact/location data.
    await this.deps.store.checkpoint(r);
    await this.flushCleanup(r);
    await this.flushOutcomes(r);
    await this.deps.activity?.clear(r.trip.id);
  }
  private queueCleanup(r: TripRecord) {
    if (!r.booking && !r.pendingBooking) return;
    const cleanup = r.cleanup ??= [];
    if (r.booking && !cleanup.some((job) => job.provider.id === r.booking!.providerId && job.bookingId === r.booking!.id)) cleanup.push({ provider: this.selectedProvider(r), identity: r.identity, bookingId: r.booking.id, attemptId: r.booking.requestId, attempts: 0, retryAt: this.now() });
    if (r.pendingBooking && !cleanup.some((job) => job.provider.id === r.pendingBooking!.providerId && job.requestId === r.pendingBooking!.requestId)) cleanup.push({ provider: this.selectedProvider(r), identity: r.identity, requestId: r.pendingBooking.requestId, attemptId: r.pendingBooking.requestId, attempts: 0, retryAt: this.now() });
  }
  private async flushCleanup(r: TripRecord) {
    if (!r.cleanup?.length) return;
    for (const job of [...(r.cleanup ?? [])]) {
      if (job.retryAt > this.now()) continue;
      try {
        const client = this.deps.provider(job.provider, job.identity);
        let result;
        if (job.requestId !== undefined) {
          if (!client.cancelRequest) throw new Error("Provider cannot cancel requests");
          result = await client.cancelRequest(job.requestId);
        } else result = await client.cancelTrip(job.bookingId);
        if (job.attemptId) acceptCancellationResult(r, result, this.now(), job.attemptId);
        r.cleanup = r.cleanup!.filter((pending) => pending !== job);
      } catch {
        job.attempts++; job.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(job.attempts - 1, 3));
        if (job.attempts === 1) this.log(r, r.trip.state, "ACCESS_REVOCATION_PENDING", "Provider cleanup pending; retry scheduled");
      }
    }
    if (!r.cleanup?.length && !r.booking && !r.pendingBooking) {
      delete r.cleanup; r.trip.sensitiveDataReleased = false;
      if (r.trip.state === "ARRIVED") r.trip.statusMessage = "Home reached; location sharing ended";
    }
  }
  private async flushOutcomes(r: TripRecord) {
    if (!this.deps.recordOutcome) return;
    for (const job of r.outcomeOutbox ?? []) {
      if (job.sent || job.retryAt > this.now()) continue;
      // Immutable payload + dedicated observation ID make ingestion retries idempotent.
      await this.deps.store.checkpoint(r);
      try { await this.deps.recordOutcome(job.payload); job.sent = true; }
      catch { job.attempts++; job.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(job.attempts - 1, 3)); }
    }
  }
  async monitor() {
    for (const id of await this.deps.store.list()) {
      await this.deps.store.update(id, async (r) => {
        await this.flushCleanup(r);
        await this.flushOutcomes(r);
        if (r.pendingBooking) {
          try { await this.reconcileBooking(r); } catch { /* A replacement outage must not disable the deadline. */ }
          if (r.pendingBooking) { await this.checkDeadline(r); return; }
        }
        if (r.pendingReplacement) {
          try { await this.resumeReplacement(r); } catch { /* Retry intent remains durable through an outage. */ }
        }
        if (!(activeStates as readonly string[]).includes(r.trip.state)) { await this.checkDeadline(r); await this.flushOutcomes(r); return; }
        if (r.booking) {
          try {
            const provider=this.selectedProvider(r),status=()=>this.deps.provider(provider,r.identity).getStatus(r.booking!.id);
            const simulated=(r.simulatedPlanIds??[]).includes(r.trip.selectedPlan?.planId??"");
            const result = this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"monitor",recipient:this.providerNode(provider),operation:"provider.status",execution:simulated?"simulated":"live",safeData:{}},status,value=>({safeData:{status:value.status==="in_trip"?"in_progress":value.status,simulated},execution:simulated?"simulated":"live"})) : await status();
            this.observe(r,result);
            const stage=r.rideObservation?.stage;
            const resultStage=result.status==='declined'?'cancelled':result.status;
            const ignored=['completed','cancelled'].includes(stage??'')&&resultStage!==stage
              || ['completed','cancelled','in_trip'].includes(resultStage)&&stage!==resultStage;
            if(!ignored){
              acceptNetworkResult(r, result, this.now());
              if (result.status === "cancelled" || result.status === "declined") await this.recover(r, true, result);
              else if (result.status === "completed") this.providerCompleted(r);
              else if (result.status === "in_trip" && r.trip.state !== "IN_TRIP" && r.trip.state !== "OVERDUE") this.log(r, "IN_TRIP", "PROVIDER_IN_TRIP", "Trip in progress");
            }
          } catch { /* Provider status outage must not disable the overdue deadline. */ }
        }
        await this.checkDeadline(r);
        await this.flushOutcomes(r);this.advanceJourney(r);syncJourney(r,this.now());
      }).catch(() => { /* A corrupt/unavailable record must not stop other monitors. */ });
    }
  }
  private async checkDeadline(r: TripRecord) {
    if (!r.trip.alertDeadlineAt || Date.parse(r.trip.alertDeadlineAt) > this.now() || r.trip.state === "ARRIVED") return;
    if (r.trip.state !== "OVERDUE") { r.lastStatusBeforeOverdue = r.trip.state; this.log(r, "OVERDUE", "TRIP_OVERDUE", "Trip is overdue; please check in"); }
    const contact = r.private?.contact;
    if (!contact?.consent || r.notification) return;
    const location = contact.shareLocation && r.trip.lastKnownLocation ? ` Last known location: ${r.trip.lastKnownLocation.lat}, ${r.trip.lastKnownLocation.lng} (${r.trip.lastKnownLocation.recordedAt}).` : "";
    r.notification = { state: "sending" };
    // Persist the outbox claim before the external send. An ambiguous/crashed send
    // is not automatically retried, since Telegram cannot promise exactly once.
    await this.deps.store.checkpoint(r);
    try {
      const send=()=>this.deps.notify(contact, `Beacon trip is overdue. Last trip status: ${r.lastStatusBeforeOverdue}. Please check in.${location}`, r.trip.id);
      const message = this.deps.activity ? await this.deps.activity.call(r.trip.id,{sender:"monitor",recipient:"telegram",operation:"notification.send",execution:this.deps.demo?"simulated":"live",safeData:{}},send,value=>({safeData:{delivered:!value.simulated,simulated:value.simulated},execution:value.simulated?"simulated":"live"})) : await send();
      r.notification = { state: message.simulated ? "simulated" : "sent", id: message.id }; r.trip.alertSent = !message.simulated;
      this.log(r, "OVERDUE", message.simulated ? "DEMO_ALERT" : "ALERT_SENT", message.simulated ? "Demo alert recorded; no Telegram message was sent" : "Trusted-contact alert accepted by Telegram");
    } catch { r.notification = { state: "uncertain" }; this.log(r, "OVERDUE", "ALERT_UNCERTAIN", "Telegram acceptance could not be confirmed; check your contact directly"); }
  }
}
