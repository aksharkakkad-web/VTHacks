/** Explicitly synthetic campus demo conditions. Never replace public/operational evidence with these values. */
import { createHash } from 'node:crypto';
import type { JourneyPlace, WaitingPlace } from './journey-types';
import type { FullTransitOption, FullTransitRequest } from '../../integrations/databricks/full-transit-query';
import { distanceMeters, withinWalkingDemoArea, WalkingRoutingError, type Point, type WalkingRoute } from './walking-router';

export type DemoScenarioVariant = 'baseline' | 'lighting_outage' | 'incident_pressure' | 'rain';
export type ScenarioSurface = 'walking_path' | 'waiting_point' | 'pickup_point' | 'dropoff_point';
export type ScenarioCondition = {
  source: 'synthetic_demo'; scenarioVersion: 'beacon-demo-scenario-v1'; variant: DemoScenarioVariant;
  surface: ScenarioSurface; lightingCoveragePercent: number; historicalIncidentIndex: number;
  rain: boolean; limitation: 'Illustrative synthetic values; not observed crime, working lights, weather or navigation.';
};
export type ScenarioExposure = { lightingExposureSeconds: number; incidentPressureSeconds: number; rainWalkingSeconds: number };
export type DemoTransitOption = Omit<FullTransitOption,'statementId'> & {statementId:null;synthetic:true};
export const DEMO_SCENARIO_VERSION = 'beacon-demo-scenario-v1' as const;
export const DEMO_SCENARIO_LIMITATION = 'Illustrative synthetic values; not observed crime, working lights, weather or navigation.' as const;
export const scenarioEnabled = (env: Record<string,string|undefined>) => env.DEMO_MODE==='true' && env.BEACON_DEMO_SCENARIO==='true';
const labels:Record<DemoScenarioVariant,string>={baseline:'Baseline campus conditions',lighting_outage:'Illustrative lighting outage',incident_pressure:'Illustrative incident pressure',rain:'Illustrative rain'};
const summaries:Record<DemoScenarioVariant,string>={
  baseline:'Synthetic baseline: demo walking paths have 98% illustrative lighting coverage, historical incident index 1/100, and no rain.',
  lighting_outage:'Synthetic lighting outage: demo walking paths have 15% illustrative lighting coverage; this is not a report of actual lamp status.',
  incident_pressure:'Synthetic incident pressure: demo walking paths have a 70/100 illustrative incident index; this is not an actual crime count or risk probability.',
  rain:'Synthetic rain: demo walking paths have illustrative rain; this is not an observed or forecast weather report.',
};

export function scenarioCondition(variant: DemoScenarioVariant, surface: ScenarioSurface): ScenarioCondition {
  const walking = surface === 'walking_path';
  return { source:'synthetic_demo',scenarioVersion:DEMO_SCENARIO_VERSION,variant,surface,
    lightingCoveragePercent: variant === 'lighting_outage' ? 15 : 98,
    historicalIncidentIndex: variant === 'incident_pressure' ? 70 : 1,
    rain: variant === 'rain' && walking, limitation:DEMO_SCENARIO_LIMITATION };
}

/** A dated, scenario-only current-location shelter; never claims campus admission or general pickup rights. */
export function createDemoScenario(variant: DemoScenarioVariant, at: string, origin: JourneyPlace) {
  const now = Date.parse(at);
  if (!Number.isFinite(now) || !withinWalkingDemoArea(origin.point)) throw new Error('INVALID_DEMO_SCENARIO');
  const currentWaitingPlace: WaitingPlace = { ...origin, indoor:variant==='incident_pressure'?false:true,
    sheltered:variant==='incident_pressure'?false:true,accessAllowed:true,
    opensAt:new Date(now-3600000).toISOString(),closesAt:new Date(now+3600000).toISOString(),
    capturedAt:new Date(now).toISOString(),validUntil:new Date(now+3600000).toISOString(),
    sourceUrl:'https://beacon-demo.invalid/synthetic-scenario',sourceVersion:DEMO_SCENARIO_VERSION };
  const nearbyLongitude=origin.point.lng+0.00033<=-80.395?origin.point.lng+0.00033:origin.point.lng-0.00033;
  const waitingPlaces:WaitingPlace[]=variant==='incident_pressure' ? [{...currentWaitingPlace,id:'demo-indoor-wait',
    name:'Simulated nearby indoor waiting place',point:{lat:origin.point.lat,lng:nearbyLongitude},indoor:true,sheltered:true}] : [];
  return { currentWaitingPlace,waitingPlaces, metadata:{id:`beacon-demo-${variant}`,label:labels[variant],synthetic:true as const,
    source:'synthetic_demo' as const,variant,scenarioVersion:DEMO_SCENARIO_VERSION,summary:summaries[variant],
    limitation:DEMO_SCENARIO_LIMITATION,routeSource:'beacon_synthetic_demo' as 'beacon_synthetic_demo'|'google_routes'} };
}

/** No Google attribution: an illustrative straight-line path used only under the two explicit demo flags. */
export async function demoScenarioRoute(from: Point,to: Point,at: string): Promise<WalkingRoute> {
  const now = Date.parse(at);
  if (!withinWalkingDemoArea(from) || !withinWalkingDemoArea(to)) throw new WalkingRoutingError('unsupported_area','Synthetic demo endpoints are outside the supported campus box.');
  if (!Number.isFinite(now) || !/(?:Z|[+-]\d\d:\d\d)$/.test(at)) throw new WalkingRoutingError('invalid_request','Synthetic demo time needs a timezone.');
  const distance=distanceMeters(from,to),duration=Math.ceil(distance/1.35),segments=Math.max(1,Math.ceil(distance/500));
  const coordinates=Array.from({length:segments+1},(_,i)=>[from.lng+(to.lng-from.lng)*i/segments,from.lat+(to.lat-from.lat)*i/segments]);
  const routeId=`demo:${createHash('sha256').update(JSON.stringify([from,to])).digest('hex').slice(0,24)}`;
  return {routeId,from:{...from},to:{...to},geometry:{type:'LineString',coordinates},distanceMeters:distance,durationSeconds:duration,
    instructions:[{text:'Follow this simulated walk path for the demo; it is not navigation.',distanceMeters:distance,durationSeconds:duration}],
    provider:'beacon_synthetic_demo',capturedAt:new Date(now).toISOString(),validUntil:new Date(now+300000).toISOString(),
    warnings:['Simulated straight-line demo geometry; not a verified pedestrian route or Google directions.']};
}

/** Integer features consumed by the scenario-only rank policy; sheltered waiting is not outdoor exposure. */
export function scenarioExposure(legs: {kind:'walk'|'wait'|'ride'|'bus';durationSeconds:number;sheltered:boolean;evidence:ScenarioCondition}[]): ScenarioExposure {
  const total:ScenarioExposure={lightingExposureSeconds:0,incidentPressureSeconds:0,rainWalkingSeconds:0};
  for(const leg of legs) {
    if (!Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0) throw new Error('INVALID_DEMO_SCENARIO');
    const exposed=leg.kind==='walk'||leg.kind==='wait'&&!leg.sheltered;
    if (!exposed) continue;
    total.lightingExposureSeconds+=Math.ceil(leg.durationSeconds*(100-leg.evidence.lightingCoveragePercent)/100);
    total.incidentPressureSeconds+=Math.ceil(leg.durationSeconds*leg.evidence.historicalIncidentIndex/100);
    if(leg.kind==='walk'&&leg.evidence.rain) total.rainWalkingSeconds+=Math.ceil(leg.durationSeconds);
  }
  return total;
}

/** Scenario-only co-located stop references: no claim that these are official BT stop IDs. */
export function demoScenarioStops(origin:JourneyPlace,destination:JourneyPlace):JourneyPlace[] {
  if(!withinWalkingDemoArea(origin.point)||!withinWalkingDemoArea(destination.point)) throw new Error('INVALID_DEMO_SCENARIO');
  return [{id:'demo-origin-stop',name:'Simulated campus origin stop',point:{...origin.point}},
    {id:'demo-home-stop',name:'Simulated campus home stop',point:{...destination.point}}];
}

/** A bounded fixture timetable, never a GTFS record or fake Databricks statement. */
export function demoScenarioTransit(request:FullTransitRequest):DemoTransitOption|null {
  if(request.fromStopId!=='demo-origin-stop'||request.toStopId!=='demo-home-stop') return null;
  const at=Date.parse(request.evaluatedAt),access=Math.round(request.accessWalkingMinutes*60000);
  if(!Number.isFinite(at)||!Number.isFinite(access)||access<0||!Number.isFinite(request.maxWaitMinutes)||request.maxWaitMinutes<0) return null;
  const departure=at+900000,arrival=departure+840000;
  if(departure<=at+access+60000||departure-at-access>request.maxWaitMinutes*60000) return null;
  const hash=createHash('sha256').update('beacon-synthetic-direct-transit-v1').digest('hex');
  const departureAt=new Date(departure).toISOString(),arrivalAt=new Date(arrival).toISOString(),capturedAt=new Date(at).toISOString();
  return {candidate:{planId:`demo-bus:${hash.slice(0,12)}`,providerId:'beacon-demo-transit',providerName:'Simulated campus shuttle',mode:'transit',available:true,cost:0,
    waitMinutes:(departure-at-access)/60000,travelMinutes:14,walkingMinutes:request.accessWalkingMinutes+request.egressWalkingMinutes,
    totalMinutes:29+request.egressWalkingMinutes,transfers:0,requiresProviderVerification:false},
    signals:{source:'simulated',collectedAt:capturedAt,validUntil:new Date(departure-access-60000).toISOString(),dataVersion:DEMO_SCENARIO_VERSION,serviceAvailable:true,transfersKnown:true},
    source:{sourceSha256:hash,capturedAt,serviceDate:capturedAt.slice(0,10),tripId:'synthetic-demo-trip',routeId:'synthetic-demo-route',
      fromStopId:request.fromStopId,toStopId:request.toStopId,departureAt,arrivalAt,walkingSource:'estimated'},
    statementId:null,synthetic:true,warnings:['Simulated direct-bus timetable for demonstration; not an official Blacksburg Transit departure or live tracking.']};
}
