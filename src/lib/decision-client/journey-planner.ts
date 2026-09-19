import { createHash } from 'node:crypto';
import { prepareNetworkOffers } from './network-offers';
import { rankJourneys, type JourneyRankOptions } from '../../integrations/databricks/journey-rank';
import type { FullTransitOption, FullTransitRequest } from '../../integrations/databricks/full-transit-query';
import { validateWalkingRoute, withinWalkingDemoArea, WalkingRoutingError, type Point, type WalkingRoute, type WalkingRouter } from './walking-router';
import type { PathEvidence } from './path-evidence';
import type { JourneyRequest, JourneyPlace, WaitingPlace, JourneyLeg, Journey, JourneyResult, JourneyRide } from './journey-types';

export type JourneyDependencies = {
  route: WalkingRouter; evidence: (route: WalkingRoute, at: string) => PathEvidence;
  stops?: JourneyPlace[]; transitSourceSha256?: string;
  directTransit?: (request: FullTransitRequest) => Promise<FullTransitOption | null>;
  rankOptions?: JourneyRankOptions;
};
const instant = (v: string) => {
  const n = typeof v === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
  if (!Number.isFinite(n)) throw new Error('INVALID_TIME'); return n;
};
const iso = (n: number) => new Date(n).toISOString();
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,40);
const same = (a: Point,b: Point) => a.lat === b.lat && a.lng === b.lng;
const meters = (a: Point,b: Point) => Math.hypot((a.lat-b.lat)*111320, (a.lng-b.lng)*88700);
const money = (v: number) => Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
function place(p: JourneyPlace): JourneyPlace {
  if (!p || !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120 ||
      !p.point || !withinWalkingDemoArea(p.point)) throw new Error('UNSUPPORTED_DEMO_AREA_OR_PLACE');
  return { id:p.id, name:p.name, point:{lat:p.point.lat,lng:p.point.lng} };
}
function validWaiting(s: WaitingPlace, at: number): boolean {
  try {
    place(s);
    return [s.indoor,s.sheltered,s.accessAllowed].every(v => v === null || typeof v === 'boolean') && s.accessAllowed !== false &&
      instant(s.capturedAt) <= at && at - instant(s.capturedAt) < 86400000 && instant(s.validUntil) > at &&
      instant(s.opensAt) <= at && at < instant(s.closesAt) && /^https:\/\//.test(s.sourceUrl) && !!s.sourceVersion;
  } catch { return false; }
}

/** Pure server orchestration of tools and deterministic facts; never books or advances trip state. */
export async function planJourney(input: JourneyRequest, deps: JourneyDependencies): Promise<JourneyResult> {
  const started = Date.now(), at = instant(input.evaluatedAt);
  const origin = place(input.origin), destination = place(input.destination);
  if (!Number.isSafeInteger(input.objectiveVersion) || input.objectiveVersion < 0 || !money(input.budgetMinor) ||
      !money(input.committedMinor ?? 0) || input.remainingBudgetMinor !== undefined && !money(input.remainingBudgetMinor) ||
      input.maxWalkingMinutes !== undefined && (!Number.isFinite(input.maxWalkingMinutes) || input.maxWalkingMinutes < 0 || input.maxWalkingMinutes > 120) ||
      [input.cannotWalk,input.minimizeWalking,input.tired].some(v => v !== undefined && typeof v !== 'boolean') ||
      (input.rides?.length ?? 0) > 8 || (input.waitingPlaces?.length ?? 0) > 3) throw new Error('INVALID_JOURNEY_REQUEST');
  const committed = input.committedMinor ?? 0;
  const remaining = Math.min(Math.max(0,input.budgetMinor-committed),input.remainingBudgetMinor ?? Infinity);
  const maxWalk = input.cannotWalk ? 0 : (input.maxWalkingMinutes ?? 120)*60;
  const warnings = ['DIRECT_BUSES_ONLY_NO_TRANSFER_SEARCH','PROVIDER_BOOKING_AND_LIVE_PROGRESSION_REQUIRE_COORDINATOR'];
  const rejected: JourneyResult['rejected'] = [], journeys: Journey[] = [];
  const offerKeys = (input.rides??[]).map(r=>JSON.stringify([r.offer.operatorId,r.offer.serviceId,r.offer.quoteId,r.offer.offerVersion]));
  if(new Set(offerKeys).size!==offerKeys.length) throw new Error('DUPLICATE_QUOTE_BINDING');
  const current = input.currentWaitingPlace && same(input.currentWaitingPlace.point,origin.point) && validWaiting(input.currentWaitingPlace,at) ? input.currentWaitingPlace : undefined;
  const waitingChoices: (WaitingPlace|undefined)[]=[current];
  for(const s of input.waitingPlaces??[]) if(!same(s.point,origin.point) && validWaiting(s,at) && s.accessAllowed===true && (s.indoor===true||s.sheltered===true) && !(current?.indoor===true||current?.sheltered===true)) waitingChoices.push(s);
  const reject = (id: string, reason: string) => { rejected.push({candidateId:id,reasons:[reason]}); };
  const cache = new Map<string,Promise<WalkingRoute | null>>();
  async function route(a: JourneyPlace,b: JourneyPlace): Promise<WalkingRoute | null> {
    if (same(a.point,b.point)) return null;
    if (maxWalk === 0) throw new Error('WALKING_NOT_ALLOWED');
    const key = JSON.stringify([a.point,b.point]);
    if (!cache.has(key)) cache.set(key,deps.route(a.point,b.point,input.evaluatedAt).then(r => {
      return validateWalkingRoute(r,a.point,b.point,input.evaluatedAt);
    }));
    return cache.get(key)!;
  }
  function walkLeg(a: JourneyPlace,b: JourneyPlace,r: WalkingRoute | null,t: number): JourneyLeg[] {
    if (!r) return [];
    const evidence = intervalEvidence(r,t,t+r.durationSeconds*1000);
    if (evidence.blocked) throw new Error('KNOWN_PATH_CLOSURE_OR_ALERT');
    return [{id:'',kind:'walk',from:a,to:b,startsAt:iso(t),endsAt:iso(t+r.durationSeconds*1000),
      instruction:r.instructions[0]?.text || `Walk to ${b.name}.`,route:r,evidence,source:r.provider,indoor:false,sheltered:false}];
  }
  function intervalEvidence(r: WalkingRoute,t: number,end: number): PathEvidence {
    const base=deps.evidence(r,input.evaluatedAt);
    let cursor=t;
    for(let i=0;i<64;i++) {
      const evidence=deps.evidence(r,iso(cursor));
      if(evidence.blocked) throw new Error('KNOWN_CLOSURE_OR_ALERT_DURING_LEG');
      const next=evidence.validUntil?instant(evidence.validUntil):Infinity;
      if(next>=end || next<=cursor) break;
      cursor=next;
      if(i===63) throw new Error('TOO_MANY_EVIDENCE_BOUNDARIES');
    }
    if(deps.evidence(r,iso(Math.max(t,end-1))).blocked) throw new Error('KNOWN_CLOSURE_OR_ALERT_DURING_LEG');
    return base;
  }
  function pointEvidence(p: JourneyPlace,t=at,end=t): PathEvidence {
    // Degenerate geometry represents a place for spatial evidence; never a navigation route.
    return intervalEvidence({routeId:`place:${hash(p.point)}`,from:p.point,to:p.point,geometry:{type:'LineString',coordinates:[[p.point.lng,p.point.lat],[p.point.lng,p.point.lat]]},
      durationSeconds:0,distanceMeters:0,instructions:[],provider:'place_evidence',capturedAt:iso(at),validUntil:iso(at+300000)},t,end);
  }
  function waitLeg(p: JourneyPlace,t: number,end: number,s?: WaitingPlace): JourneyLeg[] {
    if (end <= t) return [];
    const evidence = pointEvidence(p,t,end);
    if (evidence.blocked) throw new Error('KNOWN_WAITING_PLACE_CLOSURE_OR_ALERT');
    const supported = s && validWaiting(s,t) && instant(s.closesAt) >= end && instant(s.validUntil) >= end;
    const access = supported && s.accessAllowed === true;
    return [{id:'',kind:'wait',from:p,to:p,startsAt:iso(t),endsAt:iso(end),route:null,evidence,
      instruction:supported && !access ? `Wait near ${p.name}; check access before entering. Leave at ${iso(end)}.` : `Wait at ${p.name} until ${iso(end)}.`,
      source:supported ? 'published_hours' : 'waiting_conditions_unknown', indoor:access ? s.indoor : null,sheltered:access ? s.sheltered : null,
      ...(supported ? {waitingSource:{sourceUrl:s.sourceUrl,sourceVersion:s.sourceVersion,capturedAt:s.capturedAt,validUntil:s.validUntil,accessAllowed:s.accessAllowed}} : {})}];
  }
  function finish(kind: Journey['kind'],legs: JourneyLeg[],cost: number,deadline: number,ride: JourneyRide | null,binding: Journey['offerBinding'],facts: string[],leave: string|null) {
    if (!legs.length) throw new Error('ALREADY_AT_DESTINATION');
    if (cost > remaining) throw new Error('BUDGET_EXCEEDED');
    let walking=0,waiting=0,outdoor=0,unknown=0,previous=at,previousPoint=origin.point;
    const unknowns = new Set<string>();
    for (const [i,l] of legs.entries()) {
      l.id=`leg-${i+1}`;
      if (instant(l.startsAt)!==previous || !same(l.from.point,previousPoint) || instant(l.endsAt)<instant(l.startsAt)) throw new Error('INCONSISTENT_JOURNEY_LEGS');
      previous=instant(l.endsAt); previousPoint=l.to.point;
      const seconds=(instant(l.endsAt)-instant(l.startsAt))/1000;
      if (l.kind==='walk') { walking+=seconds;deadline=Math.min(deadline,instant(l.route!.validUntil)); }
      if (l.kind==='wait') {waiting+=seconds;if(l.indoor===false && l.sheltered===false) outdoor+=seconds;else if(l.indoor!==true && l.sheltered!==true) unknown+=seconds;}
      if(l.evidence?.validUntil) deadline=Math.min(deadline,instant(l.evidence.validUntil));
      l.evidence?.unknowns.forEach(x=>unknowns.add(x));
      if(l.kind==='wait' && l.indoor===null) unknowns.add('WAITING_ACCESS_AND_SHELTER_UNKNOWN');
    }
    if (!same(previousPoint,destination.point)) throw new Error('DISCONNECTED_DESTINATION');
    if (walking>maxWalk) throw new Error('WALKING_LIMIT_EXCEEDED');
    if (deadline<=at) throw new Error('JOURNEY_EXPIRED');
    const journeyId=`journey:${hash([input.objectiveVersion,legs,binding])}`;
    const first=legs[0];
    const j:Journey={journeyId,kind,legs,departureAt:iso(at),arrivalAt:iso(previous),validUntil:iso(deadline),leaveWaitingAt:leave,
      costMinor:cost,walkingSeconds:walking,waitingSeconds:waiting,outdoorWaitingSeconds:outdoor,unknownWaitingSeconds:unknown,durationSeconds:(previous-at)/1000,scoreUnits:0,
      offerBinding:binding,offerLocationBinding:ride?{pickup:place(ride.pickup),dropoff:place(ride.dropoff),pickupAt:ride.pickupAt,arrivalAt:ride.arrivalAt}:null,
      nextStep:{legId:first.id,instruction:first.instruction,showMap:first.kind==='walk',routeId:first.route?.routeId??null},explanationFacts:facts,unknowns:[...unknowns]};
    if (!journeys.some(x=>x.journeyId===journeyId)) journeys.push(j);
  }
  const failure = (e: unknown) => e instanceof WalkingRoutingError ? `ROUTING_${e.code.toUpperCase()}` : e instanceof Error && /^[A-Z_]{3,80}$/.test(e.message) ? e.message : 'DEPENDENCY_UNAVAILABLE_OR_INVALID';
  try { const r=await route(origin,destination);finish('walk',walkLeg(origin,destination,r,at),0,at+300000,null,null,['WALK_HOME_WITH_ROUTER_GEOMETRY'],null); }
  catch(e) { reject('walk-home',failure(e)); }
  for (const ride of input.rides??[]) {
    const candidateId=`ride:${hash(ride.offer && [ride.offer.operatorId,ride.offer.serviceId,ride.offer.quoteId,ride.offer.offerVersion])}`;
    try {
      const pickup=place(ride.pickup),dropoff=place(ride.dropoff),pickupAt=instant(ride.pickupAt),arrivalAt=instant(ride.arrivalAt);
      if (!['campus_ride','independent_ride'].includes(ride.offer.mode) || !['live','simulated'].includes(ride.offer.source) || ride.pickupPermitted!==true) throw new Error('PICKUP_NOT_PROVIDER_CONFIRMED');
      if (pickupAt<=at || arrivalAt<=pickupAt || Math.abs(pickupAt-instant(ride.offer.issuedAt)-ride.offer.waitMinutes*60000)>1000 || Math.abs((arrivalAt-pickupAt)/60000-ride.offer.travelMinutes)>1/60) throw new Error('INVALID_PROVIDER_TIMING');
      const admitted=prepareNetworkOffers([ride.offer],{maxBudget:remaining/100,evaluatedAt:input.evaluatedAt},{excludedServices:input.excludedServices});
      const c=admitted.candidates[0];
      if(!c) { const reasons=Object.values(admitted.rejectedOffers).flat(); rejected.push({candidateId,reasons});continue; }
      const binding=admitted.bindings[c.planId];
      const lastRoute=await route(dropoff,destination);
      if(pointEvidence(pickup,pickupAt).blocked || pointEvidence(dropoff,arrivalAt).blocked) throw new Error('KNOWN_PICKUP_OR_DROPOFF_CLOSURE');
      for(const s of waitingChoices) {
        try {
          const site=s?place(s):origin;
          const toWait=await route(origin,site),toPickup=await route(site,pickup);
          const reaches=at+(toWait?.durationSeconds??0)*1000;
          const latestLeave=pickupAt-(toPickup?.durationSeconds??0)*1000-30000;
          if(reaches>latestLeave) throw new Error('PICKUP_UNREACHABLE');
          const leave=s?Math.min(latestLeave,instant(s.closesAt)-1000,instant(s.validUntil)-1000):latestLeave;
          if(leave<reaches || s && !validWaiting(s,reaches)) throw new Error('WAITING_PLACE_CLOSED');
          if(toWait && (leave-reaches<120000 || (toWait.durationSeconds+(toPickup?.durationSeconds??0))>(maxWalk))) throw new Error('WAITING_DETOUR_NOT_JUSTIFIED');
          const pickupArrival=leave+(toPickup?.durationSeconds??0)*1000;
          const legs=[...walkLeg(origin,site,toWait,at),...waitLeg(site,reaches,leave,s),...walkLeg(site,pickup,toPickup,leave),...waitLeg(pickup,pickupArrival,pickupAt),
            {id:'',kind:'ride' as const,from:pickup,to:dropoff,startsAt:iso(pickupAt),endsAt:iso(arrivalAt),instruction:`Take ${ride.offer.displayName} to ${dropoff.name}.`,route:null,evidence:null,source:ride.offer.source,locationEvidence:{pickup:pointEvidence(pickup,pickupAt),dropoff:pointEvidence(dropoff,arrivalAt)},indoor:null,sheltered:null},...walkLeg(dropoff,destination,lastRoute,arrivalAt)];
          finish('ride',legs,binding.maximumCostMinor,Math.min(instant(binding.expiresAt),latestLeave),ride,binding,[toWait?'MOVE_FOR_CONFIRMED_SHELTER':'PREFER_CURRENT_LOCATION', 'RECHECK_QUOTE_CONSENT_AND_AUTH_BEFORE_BOOKING'],iso(leave));
        }catch(e){reject(`${candidateId}:wait:${s?.id??'current'}`,failure(e));}
      }
    }catch(e){reject(candidateId,failure(e));}
  }
  if(deps.directTransit && deps.stops?.length) {
    const nearest=(p:JourneyPlace)=>deps.stops!.filter(s=>withinWalkingDemoArea(s.point)).sort((a,b)=>meters(p.point,a.point)-meters(p.point,b.point)).slice(0,2);
    for(const rawFrom of nearest(origin)) for(const rawTo of nearest(destination)) {
      if(rawFrom.id===rawTo.id) continue;
      const id=`bus:${rawFrom.id}:${rawTo.id}`;
      try {
        const from=place(rawFrom),to=place(rawTo),egress=await route(to,destination);
        for(const s of waitingChoices) {
          try {
            const site=s?place(s):origin,toWait=await route(origin,site),access=await route(site,from);
            const accessSeconds=(toWait?.durationSeconds??0)+(access?.durationSeconds??0);
            if(accessSeconds+(egress?.durationSeconds??0)>maxWalk) throw new Error('WALKING_LIMIT_EXCEEDED');
            const bus=await deps.directTransit({fromStopId:from.id,toStopId:to.id,evaluatedAt:iso(at),accessWalkingMinutes:accessSeconds/60,egressWalkingMinutes:(egress?.durationSeconds??0)/60,maxWaitMinutes:45,walkingSource:'mapped'});
            if(!bus) throw new Error('NO_REACHABLE_DIRECT_BUS');
            if(deps.transitSourceSha256 && bus.source.sourceSha256!==deps.transitSourceSha256) throw new Error('TRANSIT_STOP_SOURCE_MISMATCH');
            const departure=instant(bus.source.departureAt),arrival=instant(bus.source.arrivalAt),reaches=at+(toWait?.durationSeconds??0)*1000;
            if(bus.source.fromStopId!==from.id || bus.source.toStopId!==to.id || bus.source.walkingSource!=='mapped' || bus.candidate.transfers!==0 || bus.candidate.cost!==0 || bus.signals.source!=='scheduled' || departure<=at+accessSeconds*1000+60000 || arrival<=departure || instant(bus.source.capturedAt)>at || at-instant(bus.source.capturedAt)>7*86400000) throw new Error('INVALID_OR_MISSED_BUS');
            if(pointEvidence(to,arrival).blocked) throw new Error('KNOWN_BUS_STOP_CLOSURE');
            const latestLeave=departure-(access?.durationSeconds??0)*1000-60000;
            const leave=s?Math.min(latestLeave,instant(s.closesAt)-1000,instant(s.validUntil)-1000):latestLeave;
            if(leave<reaches || s&&!validWaiting(s,reaches)) throw new Error('WAITING_PLACE_CLOSED');
            if(toWait&&leave-reaches<120000) throw new Error('WAITING_DETOUR_NOT_JUSTIFIED');
            const stopArrival=leave+(access?.durationSeconds??0)*1000;
            finish('bus',[...walkLeg(origin,site,toWait,at),...waitLeg(site,reaches,leave,s),...walkLeg(site,from,access,leave),...waitLeg(from,stopArrival,departure),{id:'',kind:'bus',from,to,startsAt:iso(departure),endsAt:iso(arrival),instruction:`Board ${bus.candidate.providerName} for ${to.name}.`,route:null,evidence:null,source:'scheduled',transitSource:{...bus.source,sourceUrl:'https://www.bt4uclassic.org/gtfs/google_transit.zip',statementId:bus.statementId},locationEvidence:{pickup:pointEvidence(from,departure),dropoff:pointEvidence(to,arrival)},indoor:null,sheltered:null},...walkLeg(to,destination,egress,arrival)],0,
              Math.min(departure-accessSeconds*1000-60000,instant(bus.signals.validUntil!)),null,null,[`SCHEDULED_TRIP:${bus.source.tripId}`,`TRANSIT_CAPTURE:${bus.source.capturedAt}`,'VEHICLE_GEOMETRY_UNKNOWN',toWait?'MOVE_FOR_CONFIRMED_SHELTER':'PREFER_CURRENT_LOCATION'],iso(leave));
          }catch(e){reject(`${id}:wait:${s?.id??'current'}`,failure(e));}
        }
      }catch(e){reject(id,failure(e));}
    }
  } else warnings.push('TRANSIT_NOT_CONFIGURED');
  const {journeys:ranked,execution}=await rankJourneys(journeys,!!(input.minimizeWalking||input.tired),input.objectiveVersion,input.evaluatedAt,deps.rankOptions);
  const completedAt=at+Date.now()-started;
  const feasible=ranked.filter(j=>{if(instant(j.validUntil)<=completedAt){reject(j.journeyId,'EXPIRED_DURING_PLANNING');return false;}return true;});
  if(execution.auditPersisted && ranked[0]?.journeyId!==feasible[0]?.journeyId) { execution.auditStatus='PERSISTED_SUPERSEDED_SELECTION';warnings.push('AUDIT_PRECEDES_FINAL_EXPIRY_FILTER'); }
  return {journeyVersion:'beacon-journey-v1',policyVersion:'beacon-journey-rank-v1',objectiveVersion:input.objectiveVersion,evaluatedAt:iso(completedAt),
    status:feasible.length?'RECOMMENDED':'NO_FEASIBLE_JOURNEY',selected:feasible[0]??null,alternatives:feasible.slice(1,4),remainingBudgetMinor:remaining,committedMinor:committed,rejected,warnings,execution};
}
