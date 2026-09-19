import { qualifiedTable, type SqlParameter } from "./statement";
import type { PreparedDecision } from "../../lib/decision-client/decision";

/** Values travel as named JSON parameters. Only validated deployment-owned table identifiers are interpolated. */
export function buildEvaluationSql(routeContextTable?: string): string {
  const manifest = routeContextTable ? qualifiedTable(`${routeContextTable.split(".").slice(0, -1).join(".")}.source_manifest`) : "";
  const context = routeContextTable ? `SELECT rc.* FROM ${qualifiedTable(routeContextTable)} rc CROSS JOIN context_input ci
    WHERE rc.updated_at <= CAST(ci.ctx.evaluatedAt AS TIMESTAMP)
      AND rc.updated_at >= CAST(ci.ctx.evaluatedAt AS TIMESTAMP) - INTERVAL 24 HOURS
      AND (rc.valid_from IS NULL OR rc.valid_from <= CAST(ci.ctx.evaluatedAt AS TIMESTAMP))
      AND rc.valid_until > CAST(ci.ctx.evaluatedAt AS TIMESTAMP)
      AND (rc.context_version NOT LIKE 'nws-%' OR startswith(rc.context_version, concat(
        'nws-', (SELECT substring(sha256, 1, 12) FROM ${manifest} WHERE source_id = 'nws-hourly' LIMIT 1),
        '-', (SELECT substring(sha256, 1, 12) FROM ${manifest} WHERE source_id = 'nws-alerts' LIMIT 1), '-')))
    QUALIFY row_number() OVER (PARTITION BY rc.corridor_id ORDER BY rc.updated_at DESC, rc.context_version DESC) = 1` : `SELECT CAST(NULL AS STRING) corridor_id, CAST(NULL AS STRING) context_version,
    CAST(NULL AS STRING) weather, CAST(NULL AS STRING) lighting,
    CAST(NULL AS BOOLEAN) walking_path_closed, CAST(NULL AS BOOLEAN) active_official_alert,
    CAST(NULL AS BIGINT) historical_report_count, CAST(NULL AS INT) history_lookback_days,
    CAST(NULL AS STRING) source_url WHERE FALSE`;
  return `-- Beacon deterministic SQL evaluator. Scores are weighted minutes, never safety probabilities.
WITH context_input AS (
  SELECT from_json(:context_json, 'STRUCT<evaluatedAt:STRING,walkingWeight:INT,transferWeight:INT,policyVersion:STRING,priority:STRING>') ctx
), campus AS (
  ${context}
), candidates AS (
  SELECT explode(from_json(:candidates_json,
    'ARRAY<STRUCT<planId:STRING,mode:STRING,costCents:BIGINT,waitSeconds:BIGINT,travelSeconds:BIGINT,walkingSeconds:BIGINT,totalSeconds:BIGINT,transfers:INT,reliabilityBasisPoints:INT,baseRejections:ARRAY<STRING>,corridorId:STRING,weather:STRING,lighting:STRING,walkingPathClosed:BOOLEAN,activeOfficialAlert:BOOLEAN>>')) p
), enriched AS (
  SELECT p.*, ctx,
    CASE WHEN r.weather IN ('clear','rain','severe') THEN r.weather ELSE p.weather END actual_weather,
    CASE WHEN r.lighting IN ('verified_lit','verified_unlit') THEN r.lighting ELSE p.lighting END actual_lighting,
    coalesce(r.walking_path_closed, FALSE) OR coalesce(p.walkingPathClosed, FALSE) actual_closed,
    CASE WHEN r.corridor_id IS NULL THEN NULL ELSE to_json(named_struct(
      'corridorId', r.corridor_id, 'contextVersion', r.context_version,
      'weather', r.weather, 'lighting', r.lighting,
      'walkingPathClosed', r.walking_path_closed, 'activeOfficialAlert', r.active_official_alert,
      'historicalReportCount', r.historical_report_count, 'historyLookbackDays', r.history_lookback_days,
      'sourceUrl', r.source_url)) END route_context_json
  FROM candidates CROSS JOIN context_input
  LEFT JOIN campus r ON p.corridorId = r.corridor_id
), scored AS (
  SELECT *, CAST(
    100 * (waitSeconds + travelSeconds)
    + 100 * ctx.walkingWeight * walkingSeconds * CASE WHEN ctx.policyVersion = 'beacon-v2' AND actual_weather = 'rain' THEN 1.5 ELSE 1 END
    + 120 * costCents + 6000 * ctx.transferWeight * transfers
    + CASE WHEN mode = 'walk' THEN 0 ELSE 12 * (10000 - reliabilityBasisPoints) END
    + CASE WHEN ctx.policyVersion = 'beacon-v2' AND actual_lighting = 'verified_unlit' THEN 300 * walkingSeconds ELSE 0 END
    AS BIGINT) score_units,
    concat(baseRejections,
      CASE WHEN actual_closed AND walkingSeconds > 0 THEN array('WALKING_PATH_CLOSED') ELSE CAST(array() AS ARRAY<STRING>) END,
      CASE WHEN actual_weather = 'severe' AND mode = 'walk' THEN array('SEVERE_WEATHER') ELSE CAST(array() AS ARRAY<STRING>) END) rejections
  FROM enriched
)
SELECT planId AS plan_id, score_units, to_json(rejections) AS rejections_json, route_context_json
FROM scored
ORDER BY CASE WHEN size(rejections) = 0 THEN 0 ELSE 1 END,
  CASE WHEN ctx.priority = 'lowest_cost' THEN costCents ELSE 0 END,
  score_units, walkingSeconds, costCents, totalSeconds, planId
LIMIT 16`;
}

export function evaluationParameters(prepared: PreparedDecision): SqlParameter[] {
  return [
    { name: "candidates_json", value: JSON.stringify(prepared.plans.map((plan) => ({
      planId: plan.planId, mode: plan.mode, costCents: plan.costCents, waitSeconds: plan.waitSeconds,
      travelSeconds: plan.travelSeconds, walkingSeconds: plan.walkingSeconds, totalSeconds: plan.totalSeconds,
      transfers: plan.transfers, reliabilityBasisPoints: plan.reliabilityBasisPoints,
      baseRejections: plan.baseRejections, corridorId: plan.facts?.corridorId ?? null,
      weather: plan.facts?.weather ?? "unknown", lighting: plan.facts?.lighting ?? "unknown",
      walkingPathClosed: plan.facts?.walkingPathClosed ?? false,
      activeOfficialAlert: plan.facts?.activeOfficialAlert ?? false,
    }))), type: "STRING" },
    { name: "context_json", value: JSON.stringify({ evaluatedAt: prepared.context.evaluatedAt, walkingWeight: prepared.walkingWeight, transferWeight: prepared.transferWeight, policyVersion: prepared.context.policyVersion, priority: prepared.context.priority ?? "balanced" }), type: "STRING" },
  ];
}
