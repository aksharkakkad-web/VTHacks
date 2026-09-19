import "server-only";
import type { CandidatePlan } from "../../types/provider";
import type { DecisionContext, PlanSignals } from "./decision";
import { runDecision } from "../../integrations/databricks/evaluate";
import { loadScheduledTransit } from "../../integrations/databricks/transit-query";
import type { TransitRequest } from "./transit";
import { runIntelligence, loadRouteEvidence, walkingOption } from "../../integrations/databricks/intelligence";
import { applyPublicRouteEvidence } from "../campus-evidence/routing";
import { datasets, loadDataset, routeConditions } from "../campus-evidence/catalog";
import { buildSafetyEvidence, type SafetyEvidenceInput } from "./safety-evidence";
import { collectPublicTripOptions, isPublicCorridor, readPublicRoute, type PublicCorridor, type WalkingAlternative } from "./trip-options";

/** Mahin's server/API integration point. Never import this module into a Client Component. */
export function evaluateTrip(candidates: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals> = {}) {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  const workspace = host && token && warehouseId ? {
    host, token, warehouseId,
    routeContextTable: process.env.DATABRICKS_ROUTE_CONTEXT_TABLE,
    auditTable: process.env.DATABRICKS_AUDIT_TABLE,
  } : undefined;
  return runDecision(candidates, context, applyPublicRouteEvidence(candidates, signals, context.evaluatedAt ? Date.parse(context.evaluatedAt) : Date.now()), { workspace });
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

/** Additive, source-backed briefing. Existing evaluateTrip stays fast and contract-compatible. */
export async function evaluateTripIntelligence(candidates:CandidatePlan[],context:DecisionContext,signals:Record<string,PlanSignals>={},options:{corridorId?:string;enableAi?:boolean;walkingAlternative?:WalkingAlternative}={}) {
  const host=process.env.DATABRICKS_HOST,token=process.env.DATABRICKS_TOKEN,warehouseId=process.env.DATABRICKS_WAREHOUSE_ID;
  const workspace=host&&token&&warehouseId?{host,token,warehouseId,routeContextTable:process.env.DATABRICKS_ROUTE_CONTEXT_TABLE,auditTable:process.env.DATABRICKS_AUDIT_TABLE,routeEvidenceTable:process.env.DATABRICKS_ROUTE_EVIDENCE_TABLE}:undefined;
  const loaded=options.walkingAlternative;
  const result=await runIntelligence(candidates,context,applyPublicRouteEvidence(candidates,signals,context.evaluatedAt?Date.parse(context.evaluatedAt):Date.now()),{...options,workspace,enableAi:options.enableAi??process.env.DATABRICKS_ENABLE_AI==="true",...(loaded?{loadedRoute:{evidence:loaded.route,source:loaded.source,statementId:loaded.statementId}}:{})});
  return {...result,...(options.corridorId?{safetyEvidence:getSafetyEvidence(options.corridorId,result.decision.evaluatedAt,result.route?.source_version)}:{})};
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
  return buildSafetyEvidence({corridorId,evaluatedAt,expectedRouteVersion,routeConditions:conditions,campusDatasets});
}

export function getPublicTripOptions(corridorId:PublicCorridor,demo:boolean,evaluatedAt:string) {
  return collectPublicTripOptions(corridorId,demo,evaluatedAt,{walking:getMappedWalkingOption,transit:getScheduledTransitOption});
}
