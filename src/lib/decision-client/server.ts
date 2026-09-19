import "server-only";
import type { CandidatePlan } from "../../types/provider";
import type { DecisionContext, PlanSignals } from "./decision";
import { runDecision } from "../../integrations/databricks/evaluate";
import { loadScheduledTransit } from "../../integrations/databricks/transit-query";
import type { TransitRequest } from "./transit";
import { runIntelligence, loadRouteEvidence, walkingOption } from "../../integrations/databricks/intelligence";
import { applyPublicRouteEvidence } from "../campus-evidence/routing";

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
export function evaluateTripIntelligence(candidates:CandidatePlan[],context:DecisionContext,signals:Record<string,PlanSignals>={},options:{corridorId?:string;enableAi?:boolean}={}) {
  const host=process.env.DATABRICKS_HOST,token=process.env.DATABRICKS_TOKEN,warehouseId=process.env.DATABRICKS_WAREHOUSE_ID;
  const workspace=host&&token&&warehouseId?{host,token,warehouseId,routeContextTable:process.env.DATABRICKS_ROUTE_CONTEXT_TABLE,auditTable:process.env.DATABRICKS_AUDIT_TABLE,routeEvidenceTable:process.env.DATABRICKS_ROUTE_EVIDENCE_TABLE}:undefined;
  return runIntelligence(candidates,context,applyPublicRouteEvidence(candidates,signals,context.evaluatedAt?Date.parse(context.evaluatedAt):Date.now()),{...options,workspace,enableAi:options.enableAi??process.env.DATABRICKS_ENABLE_AI==="true"});
}

export async function getMappedWalkingOption(corridorId:string,evaluatedAt=new Date().toISOString()) {
  const host=process.env.DATABRICKS_HOST,token=process.env.DATABRICKS_TOKEN,warehouseId=process.env.DATABRICKS_WAREHOUSE_ID,routeEvidenceTable=process.env.DATABRICKS_ROUTE_EVIDENCE_TABLE;
  if(!host||!token||!warehouseId||!routeEvidenceTable) return null;
  const loaded=await loadRouteEvidence({host,token,warehouseId,routeEvidenceTable},corridorId);
  if(!loaded) return null;
  const option=walkingOption(loaded.evidence,evaluatedAt);
  return option?{...option,signals:applyPublicRouteEvidence([option.candidate],{[option.candidate.planId]:option.signals},Date.parse(evaluatedAt))[option.candidate.planId],route:loaded.evidence,statementId:loaded.statementId}:null;
}
