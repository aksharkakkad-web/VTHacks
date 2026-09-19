import assert from "node:assert/strict";
import test from "node:test";
import type { CandidatePlan } from "../../types/provider";
import { evaluateCandidates, prepareDecision, scorePlan, type PlanSignals } from "../../lib/decision-client/decision";
import { runDecision, sanitizedDecision, validateEvaluationResult } from "./evaluate";
import { buildEvaluationSql, evaluationParameters } from "./sql";
import { executeStatement, validateConfig, type StatementResult } from "./statement";

const plans: CandidatePlan[] = [
  { planId: "campus", providerId: "campus", providerName: "Campus Ride", mode: "campus_ride", available: true, cost: 0, waitMinutes: 8, travelMinutes: 11, walkingMinutes: 1, totalMinutes: 20, reliability: 0.98, requiresProviderVerification: true },
  { planId: "walk", providerId: null, providerName: "Walk", mode: "walk", available: true, cost: 0, waitMinutes: 0, travelMinutes: 0, walkingMinutes: 22, totalMinutes: 22, requiresProviderVerification: false },
];
const context = { maxBudget: 10, minimizeWalking: true, evaluatedAt: "2026-09-19T23:00:00.000Z", evaluationId: "test-evaluation", objectiveVersion: 3 };
const signals: Record<string, PlanSignals> = { campus: { source: "simulated", corridorId: "demo-campus" }, walk: { source: "simulated" } };
const workspace = { host: "https://dbc-test.cloud.databricks.com", token: "unit-test-secret", warehouseId: "abc123" };
const mockResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function calculated(facts = signals): StatementResult {
  const prepared = prepareDecision(plans, context, facts);
  const result = evaluateCandidates(plans, context, facts);
  return { statementId: "statement-test", columns: ["plan_id", "score_units", "rejections_json", "route_context_json"], rows: prepared.plans.map((p) => [p.planId, String(scorePlan(p, prepared).scoreUnits), JSON.stringify(result.rejected[p.planId] ?? []), null]) };
}
function succeeded(result = calculated()) {
  return { statement_id: result.statementId, status: { state: "SUCCEEDED" }, manifest: { format: "JSON_ARRAY", schema: { columns: result.columns.map((name, position) => ({ name, position })) }, total_chunk_count: 1, total_row_count: result.rows.length, truncated: false }, result: { data_array: result.rows } };
}
const fakeFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch => (async (url, init) => handler(String(url), init)) as typeof fetch;

test("missing workspace is explicit local fallback, not simulated live success", async () => {
  const result = await runDecision(plans, context, signals);
  assert.equal(result.engine, "local_fallback");
  assert.equal(result.fallbackReason, "WORKSPACE_NOT_CONFIGURED");
  assert.equal(result.auditPersisted, false);
  assert.equal(result.objectiveVersion, 3);
});

test("real-shaped statement result must validate every score and candidate", async () => {
  const result = await runDecision(plans, context, signals, { workspace, fetch: fakeFetch(() => mockResponse(succeeded())) });
  assert.equal(result.engine, "databricks");
  assert.equal(result.statementId, "statement-test");
  assert.equal(result.ranked[0].score, 23.4);
  assert.ok(result.warnings.includes("AUDIT_NOT_CONFIGURED"));
});

test("managed route context changes the score with traceable evidence", () => {
  const enriched = { ...signals, campus: { ...signals.campus, weather: "rain" as const } };
  const response = calculated(enriched);
  response.rows[0][3] = JSON.stringify({ corridorId: "demo-campus", contextVersion: "official-weather-v1", weather: "rain", lighting: "unknown", walkingPathClosed: false, activeOfficialAlert: false, historicalReportCount: 2, historyLookbackDays: 90, sourceUrl: "https://police.vt.edu" });
  const result = validateEvaluationResult(response, plans, context, signals);
  assert.equal(result.ranked[0].score, 25.4);
  assert.equal(result.ranked[0].evidence?.historicalReports?.count, 2);
});

test("unknown managed closure and alert values remain unknown, not confirmed false",()=>{
  const response=calculated();
  response.rows[0][3]=JSON.stringify({corridorId:"demo-campus",contextVersion:"unknowns",walkingPathClosed:null,activeOfficialAlert:null});
  const result=validateEvaluationResult(response,plans,context,signals);
  assert.equal(result.ranked[0].evidence?.walkingPathClosed,undefined);
  assert.equal(result.ranked[0].evidence?.activeOfficialAlert,undefined);
});

test("mismatched score, duplicate plan, unknown plan, and wrong context are rejected", async () => {
  for (const mutate of [
    (r: StatementResult) => { r.rows[0][1] = "0"; },
    (r: StatementResult) => { r.rows[1][0] = "campus"; },
    (r: StatementResult) => { r.rows[0][0] = "attacker"; },
    (r: StatementResult) => { r.rows[0][3] = JSON.stringify({ corridorId: "another-campus", contextVersion: "bad" }); },
    (r: StatementResult) => { r.rows.pop(); },
  ]) {
    const bad = calculated(); mutate(bad);
    const result = await runDecision(plans, context, signals, { workspace, fetch: fakeFetch(() => mockResponse(succeeded(bad))) });
    assert.equal(result.engine, "local_fallback");
    assert.equal(result.fallbackReason, "UNTRUSTED_DECISION_RESULT");
  }
});

test("SQL uses parameters, managed tables are validated, audit strips unapproved fields", () => {
  const sql = buildEvaluationSql("workspace.beacon.route_context");
  assert.ok(sql.includes("LEFT JOIN campus"));
  assert.ok(sql.includes(":candidates_json"));
  assert.ok(sql.includes("score_units"));
  assert.ok(sql.includes("SELECT rc.* FROM"), "Campus CTE must not export a duplicate ctx column");
  assert.ok(sql.includes("source_id = 'nws-hourly'"));
  assert.ok(sql.includes("source_id = 'nws-alerts'"));
  assert.ok(sql.includes("startswith(rc.context_version"), "Superseded alert intervals cannot remain eligible");
  assert.ok(sql.includes("rc.valid_from <="));
  assert.throws(() => buildEvaluationSql("workspace.beacon.route_context; DROP SCHEMA beacon"));
  const params = evaluationParameters(prepareDecision(plans, context, signals));
  assert.ok(!JSON.stringify(params).includes("Campus Ride"));
  const audit = JSON.stringify(sanitizedDecision(evaluateCandidates(plans, context, signals)));
  assert.ok(!audit.includes("Campus Ride"));
  assert.ok(!audit.includes("unit-test-secret"));
});

test("HTTP success with FAILED status and truncated results produce truthful fallback", async () => {
  const truncated = succeeded(); truncated.manifest.truncated = true;
  for (const payload of [
    { statement_id: "failed", status: { state: "FAILED", error: { message: "sensitive vendor content" } } },
    truncated,
    { ...succeeded(), result: { data_array: calculated().rows, next_chunk_index: 1 } },
  ]) {
    const result = await runDecision(plans, context, signals, { workspace, fetch: fakeFetch(() => mockResponse(payload)) });
    assert.equal(result.engine, "local_fallback");
    assert.ok(!JSON.stringify(result).includes("sensitive vendor content"));
  }
});

test("tokens only go to a validated workspace with redirects disabled", async () => {
  for (const host of ["https://attacker.example", "http://dbc-test.cloud.databricks.com", "https://dbc-test.cloud.databricks.com.attacker.example", "https://dbc-test.cloud.databricks.com/?token=bad"]) assert.throws(() => validateConfig({ ...workspace, host }));
  let calls = 0;
  const result = await runDecision(plans, context, signals, { workspace: { ...workspace, host: "https://attacker.example" }, fetch: fakeFetch(() => { calls++; return mockResponse(succeeded()); }) });
  assert.equal(calls, 0);
  assert.equal(result.fallbackReason, "INVALID_WORKSPACE_CONFIG");
  await executeStatement(workspace, { statement: "SELECT 1" }, { fetch: fakeFetch((_url, init) => { assert.equal(init?.redirect, "error"); return mockResponse(succeeded()); }) });
});

test("authentication failure does not retry and emergency makes no network call", async () => {
  let calls = 0;
  const fetcher = fakeFetch(() => { calls++; return mockResponse({}, 401); });
  const result = await runDecision(plans, context, signals, { workspace, fetch: fetcher });
  assert.equal(result.fallbackReason, "WORKSPACE_AUTH_FAILED");
  assert.equal(calls, 1);
  const emergency = await runDecision(plans, { ...context, emergency: true }, signals, { workspace, fetch: fetcher });
  assert.equal(emergency.status, "EMERGENCY");
  assert.equal(calls, 1);
});

test("pending query is bounded and cancellation is attempted", async () => {
  let canceled = false;
  const result = await runDecision(plans, context, signals, { workspace, timeoutMs: 100, pollIntervalMs: 10, fetch: fakeFetch((url) => {
    if (url.endsWith("/cancel")) { canceled = true; return mockResponse({}); }
    return mockResponse({ statement_id: "pending", status: { state: "PENDING" } });
  }) });
  assert.equal(result.fallbackReason, "STATEMENT_TIMEOUT");
  assert.equal(canceled, true);
});

test("one transient poll failure is retried without resubmitting a statement", async () => {
  let posts = 0; let gets = 0;
  const response = await executeStatement(workspace, { statement: "SELECT 1" }, { pollIntervalMs: 1, fetch: fakeFetch((_url, init) => {
    if (init?.method === "POST") { posts++; return mockResponse({ statement_id: "statement-test", status: { state: "RUNNING" } }); }
    gets++;
    return gets === 1 ? mockResponse({}, 503) : mockResponse(succeeded());
  }) });
  assert.equal(response.rows.length, 2);
  assert.equal(posts, 1);
  assert.equal(gets, 2);
});

test("audit persistence is awaited; audit failure keeps valid decision", async () => {
  for (const success of [true, false]) {
    let calls = 0;
    const result = await runDecision(plans, context, signals, { workspace: { ...workspace, auditTable: "workspace.beacon.decision_events" }, fetch: fakeFetch((_url, init) => {
      calls++;
      if (calls === 1) return mockResponse(succeeded());
      const payload = JSON.parse(String(init?.body));
      assert.ok(payload.statement.startsWith("MERGE INTO"));
      return success ? mockResponse({ statement_id: "audit", status: { state: "SUCCEEDED" } }) : mockResponse({}, 403);
    }) });
    assert.equal(result.engine, "databricks");
    assert.equal(result.auditPersisted, success);
    assert.equal(calls, 2);
    if (!success) assert.ok(result.warnings.includes("AUDIT_WRITE_FAILED"));
  }
});

test("quote that expires during audit is not returned as a Databricks recommendation", async () => {
  const shortLived = { ...signals, campus: { ...signals.campus, validUntil: "2026-09-19T23:00:00.060Z" } };
  let calls = 0;
  const result = await runDecision(plans, context, shortLived, {
    workspace: { ...workspace, auditTable: "workspace.beacon.decision_events" },
    fetch: fakeFetch(async () => {
      calls++;
      if (calls === 1) return mockResponse(succeeded(calculated(shortLived)));
      await new Promise(resolve => setTimeout(resolve, 90));
      return mockResponse({ statement_id: "audit", status: { state: "SUCCEEDED" } });
    }),
  });
  assert.equal(calls, 2);
  assert.equal(result.engine, "local_fallback");
  assert.equal(result.fallbackReason, "QUOTE_EXPIRED_DURING_EVALUATION");
  assert.equal(result.status, "RECOMMENDED");
  if (result.status === "RECOMMENDED") assert.equal(result.recommendation.selectedPlanId, "walk");
});

test("bounded audit allows the measured Free Edition write latency above two seconds", async () => {
  let calls = 0;
  const result = await runDecision(plans, context, signals, {
    workspace: { ...workspace, auditTable: "workspace.beacon.decision_events" },
    fetch: fakeFetch(async (_url, init) => {
      calls++;
      if (calls === 1) return mockResponse(succeeded());
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2100);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Audit deadline", "TimeoutError"));
        }, { once: true });
      });
      return mockResponse({ statement_id: "audit", status: { state: "SUCCEEDED" } });
    }),
  });
  assert.equal(result.engine, "databricks");
  assert.equal(result.auditPersisted, true);
});

test("SQL must order the winner first, not just return plausible scores", () => {
  const reversed = calculated(); reversed.rows.reverse();
  assert.throws(() => validateEvaluationResult(reversed, plans, context, signals), /UNTRUSTED/);
});
