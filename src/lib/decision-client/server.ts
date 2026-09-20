import "server-only";
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CandidatePlan } from "../../types/provider";
import type { DecisionContext, PlanSignals } from "./decision";
import { runDecision } from "../../integrations/databricks/evaluate";
import { loadScheduledTransit } from "../../integrations/databricks/transit-query";
import { loadFullTransit, type FullTransitRequest } from "../../integrations/databricks/full-transit-query";
import type { TransitRequest } from "./transit";
import { runIntelligence, loadRouteEvidence, walkingOption } from "../../integrations/databricks/intelligence";
import { applyPublicRouteEvidence } from "../campus-evidence/routing";
import { datasets, loadDataset, routeConditions, campusWeather } from "../campus-evidence/catalog";
import { isCurrentWeather } from '../campus-evidence/evidence';
import { buildSafetyEvidence, type SafetyEvidenceInput } from "./safety-evidence";
import { collectPublicTripOptions, isPublicCorridor, readPublicRoute, type PublicCorridor, type WalkingAlternative } from "./trip-options";
import { evaluateNetworkOffers, type NetworkOffer, type NetworkRecovery, type NetworkAdmission, type PublicNetworkOption } from './network-offers';
import { loadPocContext } from './poc-context';

/** Internal server adapter; preserves exact network-offer binding for Mahin, never books. */
export async function evaluateProviderNetwork(offers: readonly NetworkOffer[], context: DecisionContext, recovery: NetworkRecovery = {}, options: { corridorId?: PublicCorridor; allowEstimatedStopWalks?: boolean; publicOptions?: readonly PublicNetworkOption[] } = {}) {
  const started = Date.now();
  const at = context.evaluatedAt ?? new Date().toISOString();
  const publicTrip = options.corridorId ? await getPublicTripOptions(options.corridorId, options.allowEstimatedStopWalks ?? true, at) : undefined;
  const publicOptions = [...(options.publicOptions ?? []), ...(publicTrip?.candidates.map(candidate => ({ candidate, signals: publicTrip.signals[candidate.planId] })) ?? [])];
  const evaluate: Parameters<typeof evaluateNetworkOffers>[3] = (plans, current, signals, admission) => {
    const now = Date.parse(current.evaluatedAt!);
    const weather = options.corridorId ? campusWeather(now) : undefined;
    if (isCurrentWeather(weather, now)) {
      for (const plan of plans) {
        const facts = signals[plan.planId];
        signals[plan.planId] = { ...facts, weather: weather.condition,
          ...(weather.activeOfficialAlert ? { activeOfficialAlert: true } : {}),
          validUntil: new Date(Math.min(Date.parse(facts.validUntil!), Date.parse(weather.validUntil))).toISOString() };
      }
    }
    return evaluateTrip(plans, current, signals, admission);
  };
  const result = await evaluateNetworkOffers(offers, { ...context, evaluatedAt: new Date(Date.parse(at) + Date.now() - started).toISOString() }, recovery, evaluate, publicOptions);
  return { ...result, publicContext: loadPocContext(result.decision.evaluatedAt),
    ...(publicTrip ? { publicTrip: { walkingAlternative: publicTrip.walkingAlternative, transit: publicTrip.transit, warnings: publicTrip.warnings } } : {}),
    ...(options.corridorId ? { safetyEvidence: getSafetyEvidence(options.corridorId, result.decision.evaluatedAt, publicTrip?.walkingAlternative?.route.source_version) } : {}) };
}

/** Mahin's server/API integration point. Never import this module into a Client Component. */
export function evaluateTrip(candidates: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals> = {}, admission?: NetworkAdmission) {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  const workspace = host && token && warehouseId ? {
    host, token, warehouseId,
    routeContextTable: process.env.DATABRICKS_ROUTE_CONTEXT_TABLE,
    auditTable: process.env.DATABRICKS_AUDIT_TABLE,
  } : undefined;
  return runDecision(candidates, context, applyPublicRouteEvidence(candidates, signals, context.evaluatedAt ? Date.parse(context.evaluatedAt) : Date.now()), { workspace, admission });
}

/** No configuration/no catchable departure returns null; transport/data errors reject for caller handling. */
export function getScheduledTransitOption(request: TransitRequest) {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  const transitTable = process.env.DATABRICKS_TRANSIT_TABLE;
  if (!host || !token || !warehouseId || !transitTable) return Promise.resolve(null);
  return loadScheduledTransit({ host, token, warehouseId, transitTable }, request);
}

/** Public stop IDs and caller-supplied access/egress estimates; scheduled, never live. */
export function getFullTransitOption(request: FullTransitRequest) {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  const configuredTable = process.env.DATABRICKS_TRANSIT_TABLE;
  if (!host || !token || !warehouseId || !configuredTable) return Promise.resolve(null);
  const transitSchema = configuredTable.split('.').slice(0, -1).join('.');
  return loadFullTransit({ host, token, warehouseId, transitSchema }, request);
}

/** Additive, source-backed briefing. Existing evaluateTrip stays fast and contract-compatible. */
export async function evaluateTripIntelligence(candidates:CandidatePlan[],context:DecisionContext,signals:Record<string,PlanSignals>={},options:{corridorId?:string;enableAi?:boolean;walkingAlternative?:WalkingAlternative}={}) {
  const host=process.env.DATABRICKS_HOST,token=process.env.DATABRICKS_TOKEN,warehouseId=process.env.DATABRICKS_WAREHOUSE_ID;
  const workspace=host&&token&&warehouseId?{host,token,warehouseId,routeContextTable:process.env.DATABRICKS_ROUTE_CONTEXT_TABLE,auditTable:process.env.DATABRICKS_AUDIT_TABLE,routeEvidenceTable:process.env.DATABRICKS_ROUTE_EVIDENCE_TABLE}:undefined;
  const loaded=options.walkingAlternative;
  const result=await runIntelligence(candidates,context,applyPublicRouteEvidence(candidates,signals,context.evaluatedAt?Date.parse(context.evaluatedAt):Date.now()),{...options,workspace,enableAi:options.enableAi??process.env.DATABRICKS_ENABLE_AI==="true",...(loaded?{loadedRoute:{evidence:loaded.route,source:loaded.source,statementId:loaded.statementId}}:{})});
  return {...result,publicContext:loadPocContext(result.decision.evaluatedAt),...(options.corridorId?{safetyEvidence:getSafetyEvidence(options.corridorId,result.decision.evaluatedAt,result.route?.source_version)}:{})};
}

export async function getMappedWalkingOption(corridorId:string,evaluatedAt=new Date().toISOString()) {
  const host=process.env.DATABRICKS_HOST,token=process.env.DATABRICKS_TOKEN,warehouseId=process.env.DATABRICKS_WAREHOUSE_ID,routeEvidenceTable=process.env.DATABRICKS_ROUTE_EVIDENCE_TABLE;
  if(!isPublicCorridor(corridorId)) return null;
  let localRoute;
  try { localRoute=readPublicRoute(corridorId); } catch { return null; }
  // Closure matching uses the deployed public map version. A cloud/local mismatch
  // must not let an older path bypass the exact-version closure checks.
  if(!localRoute) return null;
  let loaded:WalkingAlternative|undefined;
  if(host&&token&&warehouseId&&routeEvidenceTable) {
    try {
      const remote=await loadRouteEvidence({host,token,warehouseId,routeEvidenceTable},corridorId);
      if(remote?.evidence.source_version===localRoute.source_version && walkingOption(remote.evidence,evaluatedAt)) loaded={route:remote.evidence,statementId:remote.statementId,source:"databricks"};
    } catch { /* A dated, validated map snapshot can still support an explicit fallback. */ }
  }
  if(!loaded) loaded={route:localRoute,source:"local_snapshot"};
  const option=walkingOption(loaded.route,evaluatedAt);
  return option?{...option,...loaded,signals:applyPublicRouteEvidence([option.candidate],{[option.candidate.planId]:option.signals},Date.parse(evaluatedAt))[option.candidate.planId]}:null;
}

/** Public snapshots only. Names, trip IDs and exact student coordinates are never accepted. */
export function getSafetyEvidence(corridorId:string,evaluatedAt=new Date().toISOString(),expectedRouteVersion?:string) {
  const campusDatasets:SafetyEvidenceInput["campusDatasets"]={};
  for(const name of datasets) { try { campusDatasets[name]=loadDataset(name); } catch { /* The builder reports missing signals. */ } }
  let conditions:unknown;
  try { conditions=routeConditions(corridorId,Date.parse(evaluatedAt)); } catch { /* Unknown geometry stays unsupported. */ }
  let historicalLighting: unknown;
  try { historicalLighting = JSON.parse(readFileSync(join(process.cwd(), 'data/campus/research/lighting-measured-2026.json'), 'utf8')); } catch { /* Evidence remains unavailable. */ }
  return buildSafetyEvidence({corridorId,evaluatedAt,expectedRouteVersion,routeConditions:conditions,campusDatasets,historicalLighting});
}

export function getPublicTripOptions(corridorId:PublicCorridor,demo:boolean,evaluatedAt:string) {
  return collectPublicTripOptions(corridorId,demo,evaluatedAt,{walking:getMappedWalkingOption,transit:getScheduledTransitOption});
}

/** Additive whole-journey handoff. Mahin retains consent, booking, progression and recovery execution. */
export async function getCompleteJourney(request: import('./journey-types').JourneyRequest) {
  const [{ planJourney }, { createWalkingRouter }, { assessPathEvidence }, { loadJourneyPlaces }, demo] = await Promise.all([
    import('./journey-planner'), import('./walking-router'), import('./path-evidence'), import('./journey-data'), import('./demo-scenario'),
  ]);
  const scenario=demo.scenarioEnabled(process.env);
  const rawVariant=request.demoScenarioVariant??process.env.BEACON_DEMO_SCENARIO_VARIANT??'baseline';
  if(scenario&&!['baseline','lighting_outage','incident_pressure','rain'].includes(rawVariant)) throw new Error('INVALID_DEMO_SCENARIO');
  const variant=scenario?rawVariant as import('./demo-scenario').DemoScenarioVariant:undefined;
  const places = scenario ? {stops:demo.demoScenarioStops(request.origin,request.destination),waitingPlaces:[],warnings:['SYNTHETIC_SCENARIO_PUBLIC_STOPS_NOT_REAL'] as string[],
    transitSourceSha256:demo.demoScenarioTransit({fromStopId:'demo-origin-stop',toStopId:'demo-home-stop',evaluatedAt:request.evaluatedAt,accessWalkingMinutes:0,egressWalkingMinutes:0,maxWaitMinutes:45,walkingSource:'estimated'})?.source.sourceSha256} : loadJourneyPlaces(request.evaluatedAt);
  const host = process.env.DATABRICKS_HOST, token = process.env.DATABRICKS_TOKEN, warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  const googleScenario=scenario&&process.env.BEACON_GOOGLE_ROUTES_ENABLED==='true';
  const result = await planJourney({ ...request, waitingPlaces: request.waitingPlaces ?? (scenario?undefined:places.waitingPlaces) }, {
    route: scenario&&!googleScenario?demo.demoScenarioRoute:createWalkingRouter(process.env), evidence: assessPathEvidence,
    stops: places.stops, transitSourceSha256: places.transitSourceSha256,
    directTransit: scenario ? async query=>demo.demoScenarioTransit(query) : getFullTransitOption,
    ...(variant?{demoScenarioVariant:variant}:{}),
    rankOptions: { workspace: host && token && warehouseId ? { host, token, warehouseId, auditTable: process.env.DATABRICKS_AUDIT_TABLE } : undefined,
      persistAudit: process.env.BEACON_JOURNEY_AUDIT_WRITES === 'true' },
  });
  if(result.demoScenario&&googleScenario) result.demoScenario.routeSource='google_routes';
  result.warnings.push(...places.warnings);
  return result;
}
