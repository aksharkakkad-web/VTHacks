import type { CandidatePlan } from "../../types/provider";
import { evaluateCandidates, prepareDecision, scorePlan, type DecisionContext, type DecisionResult, type PlanSignals } from "../../lib/decision-client/decision";
import { DatabricksError, executeStatement, qualifiedTable, type DatabricksConfig, type StatementResult } from "./statement";
import { buildEvaluationSql, evaluationParameters } from "./sql";

export type DecisionWorkspace = DatabricksConfig & { routeContextTable?: string; auditTable?: string };
type Options = { workspace?: DecisionWorkspace; fetch?: typeof fetch; timeoutMs?: number; pollIntervalMs?: number };
const invalid = (): never => { throw new DatabricksError("UNTRUSTED_DECISION_RESULT"); };
const obj = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();

function mergeRouteContext(raw: string | null, existing: PlanSignals | undefined): PlanSignals | undefined {
  if (raw === null) return existing;
  const row = obj(JSON.parse(raw));
  if (!existing?.corridorId || row.corridorId !== existing.corridorId || typeof row.contextVersion !== "string" || row.contextVersion.length > 128) return invalid();
  const result = { ...existing, contextVersion: row.contextVersion };
  if (row.weather !== null && row.weather !== undefined) {
    if (!["clear", "rain", "severe", "unknown"].includes(String(row.weather))) return invalid();
    if (row.weather !== "unknown") result.weather = row.weather as PlanSignals["weather"];
  }
  if (row.lighting !== null && row.lighting !== undefined) {
    if (!["verified_lit", "verified_unlit", "unknown"].includes(String(row.lighting))) return invalid();
    if (row.lighting !== "unknown") result.lighting = row.lighting as PlanSignals["lighting"];
  }
  for (const key of ["walkingPathClosed", "activeOfficialAlert"] as const) {
    if (row[key] !== undefined && row[key] !== null && typeof row[key] !== "boolean") return invalid();
    if(existing[key]===true || row[key]===true) result[key]=true;
    else if(row[key]===false) result[key]=false;
  }
  if (row.historicalReportCount !== null && row.historicalReportCount !== undefined) {
    if (!Number.isSafeInteger(row.historicalReportCount) || Number(row.historicalReportCount) < 0 || !Number.isSafeInteger(row.historyLookbackDays) || Number(row.historyLookbackDays) <= 0 || typeof row.sourceUrl !== "string" || row.sourceUrl.length > 1000 || !/^https:\/\//.test(row.sourceUrl)) return invalid();
    result.historicalReports = { count: Number(row.historicalReportCount), lookbackDays: Number(row.historyLookbackDays), sourceUrl: row.sourceUrl };
  }
  return result;
}

/** Verify every result row against the same integer policy before allowing it to influence a trip. */
export function validateEvaluationResult(response: StatementResult, candidates: CandidatePlan[], context: DecisionContext, signals: Record<string, PlanSignals>): DecisionResult {
  if (JSON.stringify(response.columns) !== JSON.stringify(["plan_id", "score_units", "rejections_json", "route_context_json"])) return invalid();
  const prepared = prepareDecision(candidates, context, signals);
  if (response.rows.length !== prepared.plans.length) return invalid();
  const expectedIds = new Set(prepared.plans.map((p) => p.planId));
  const merged = { ...signals };
  for (const [id, , , route] of response.rows) {
    if (!id || !expectedIds.delete(id)) return invalid();
    const evidence = mergeRouteContext(route, signals[id]);
    if (evidence) merged[id] = evidence;
  }
  const result = evaluateCandidates(candidates, prepared.context, merged);
  const enriched = prepareDecision(candidates, prepared.context, merged);
  for (const [id, score, rejected] of response.rows) {
    const plan = enriched.plans.find((p) => p.planId === id)!;
    if (score === null || !/^\d+$/.test(score) || !Number.isSafeInteger(Number(score)) || Number(score) !== scorePlan(plan, enriched).scoreUnits || rejected === null) return invalid();
    const reasons: unknown = JSON.parse(rejected);
    if (!Array.isArray(reasons) || reasons.some((x) => typeof x !== "string") || JSON.stringify(reasons) !== JSON.stringify(result.rejected[id!] ?? [])) return invalid();
  }
  if (result.status === "RECOMMENDED" && response.rows[0]?.[0] !== result.recommendation.selectedPlanId) return invalid();
  return { ...result, engine: "databricks", statementId: response.statementId };
}

/** Deliberate allowlist: no user text, provider display names, GPS, contacts, or credentials enter the audit. */
export function sanitizedDecision(result: DecisionResult) {
  return {
    status: result.status, policyVersion: result.policyVersion, engine: result.engine,
    selectedPlanId: result.status === "RECOMMENDED" ? result.recommendation.selectedPlanId : null,
    ranked: result.ranked.map((p) => ({ planId: p.planId, scoreUnits: p.scoreUnits, cost: p.cost, walkingMinutes: p.walkingMinutes, source: p.source, contextVersion: p.evidence?.contextVersion ?? null })),
    rejected: result.rejected,
  };
}

async function persistAudit(result: DecisionResult, workspace: DecisionWorkspace, options: Options): Promise<void> {
  if (!workspace.auditTable) { result.warnings.push("AUDIT_NOT_CONFIGURED"); return; }
  try {
    await executeStatement(workspace, {
      statement: `MERGE INTO ${qualifiedTable(workspace.auditTable)} t USING (SELECT :evaluation_id evaluation_id, CAST(:objective_version AS BIGINT) objective_version, CAST(:evaluated_at AS TIMESTAMP) evaluated_at, :policy_version policy_version, :engine engine, :result_json result_json, :statement_id statement_id) s ON t.evaluation_id = s.evaluation_id WHEN NOT MATCHED THEN INSERT *`,
      parameters: Object.entries({ evaluation_id: result.evaluationId, objective_version: String(result.objectiveVersion), evaluated_at: result.evaluatedAt, policy_version: result.policyVersion, engine: result.engine, result_json: JSON.stringify(sanitizedDecision(result)), statement_id: result.statementId ?? "" }).map(([name, value]) => ({ name, value, type: "STRING" })),
      // Measured Free Edition MERGE latency exceeds 2 s; retain a bounded, awaited audit.
      timeoutMs: 8000,
    }, { fetch: options.fetch, pollIntervalMs: options.pollIntervalMs });
    result.auditPersisted = true;
  } catch { result.warnings.push("AUDIT_WRITE_FAILED"); }
}

/** Callable from server code or local demo runners; env/credentials are supplied only by the server wrapper. */
export async function runDecision(candidates: CandidatePlan[], input: DecisionContext, signals: Record<string, PlanSignals> = {}, options: Options = {}): Promise<DecisionResult> {
  const started = Date.now();
  const prepared = prepareDecision(candidates, input, signals);
  const local = evaluateCandidates(candidates, prepared.context, signals);
  if (local.status === "EMERGENCY" || !prepared.plans.length) return { ...local, engine: "boundary" };
  const fallback = (reason: string): DecisionResult => {
    const updated = evaluateCandidates(candidates, { ...prepared.context, evaluatedAt: new Date(Date.parse(prepared.context.evaluatedAt) + Date.now() - started).toISOString() }, signals);
    updated.engine = "local_fallback";
    updated.fallbackReason = reason;
    updated.warnings.push("Advanced campus context temporarily unavailable; local policy used.");
    if (updated.status === "RECOMMENDED") updated.recommendation.reasonCodes.push("FALLBACK_USED");
    return updated;
  };
  if (!options.workspace) return fallback("WORKSPACE_NOT_CONFIGURED");
  const expiredDuringEvaluation = () => {
    const beganAt = Date.parse(prepared.context.evaluatedAt);
    const completedAt = beganAt + Date.now() - started;
    return prepared.plans.some((p) => {
      const expiry = Math.min(p.facts?.validUntil ? Date.parse(p.facts.validUntil) : Infinity, p.facts?.source === "live" && p.facts.collectedAt ? Date.parse(p.facts.collectedAt) + 120000 : Infinity);
      return expiry > beganAt && expiry <= completedAt;
    });
  };
  let result: DecisionResult;
  try {
    const response = await executeStatement(options.workspace, { statement: buildEvaluationSql(options.workspace.routeContextTable), parameters: evaluationParameters(prepared), timeoutMs: options.timeoutMs ?? 10000 }, { fetch: options.fetch, pollIntervalMs: options.pollIntervalMs });
    result = validateEvaluationResult(response, candidates, prepared.context, signals);
    // A slow query must not resurrect an expired offer. Mahin must also recheck before booking.
    if (expiredDuringEvaluation()) return fallback("QUOTE_EXPIRED_DURING_EVALUATION");
    if (!options.workspace.routeContextTable) result.warnings.push("CAMPUS_CONTEXT_NOT_CONFIGURED");
  } catch (error) {
    return fallback(error instanceof DatabricksError ? error.code : "UNTRUSTED_DECISION_RESULT");
  }
  await persistAudit(result, options.workspace, options);
  if (expiredDuringEvaluation()) return fallback("QUOTE_EXPIRED_DURING_EVALUATION");
  return result;
}
