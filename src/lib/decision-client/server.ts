import "server-only";
import type { CandidatePlan } from "../../types/provider";
import type { DecisionContext, PlanSignals } from "./decision";
import { runDecision } from "../../integrations/databricks/evaluate";
import { loadScheduledTransit } from "../../integrations/databricks/transit-query";
import type { TransitRequest } from "./transit";

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
  return runDecision(candidates, context, signals, { workspace });
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
