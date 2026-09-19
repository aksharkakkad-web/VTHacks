import assert from "node:assert/strict";
import test from "node:test";
import { calculateProviderReliability, validateProviderOutcome, providerOutcomeTimestamp, type ProviderOutcome } from "./provider-outcomes";
import { getProviderReliability, ingestProviderOutcome, providerOutcomesSchemaSql } from "../../integrations/databricks/provider-outcomes";

const at = "2026-09-19T15:00:00.000Z";
const providerId = "campus-ride";
// Test fixtures only: these records are never imported or used in the demo's actual history.
function outcome(index = 1, overrides: Partial<ProviderOutcome> = {}): ProviderOutcome {
  return { providerId, observationId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    requestedAt: "2026-09-19T13:00:00.000Z", acceptedAt: "2026-09-19T13:01:00.000Z",
    promisedPickupAt: "2026-09-19T13:10:00.000Z", actualPickupAt: "2026-09-19T13:12:00.000Z",
    completedAt: "2026-09-19T13:30:00.000Z", canceledAt: null, cancellationParty: null,
    finalOutcome: "completed", source: "beacon_observed", observedAt: "2026-09-19T13:31:00.000Z", dataVersion: "test-observer-v1", ...overrides };
}
const canceled = (index: number, party: "provider" | "student" | "unknown" = "provider") => outcome(index, {
  actualPickupAt: null, completedAt: null, canceledAt: "2026-09-19T13:05:00.000Z", finalOutcome: "canceled", cancellationParty: party,
});
const config = { host: "https://beacon-test.cloud.databricks.com", token: "test-token", warehouseId: "test-warehouse" };
const table = "workspace.beacon.provider_outcomes";
type Body = { statement: string; parameters: { name: string; value: string; type: string }[] };
const columns = ["completed", "provider_canceled", "excluded", "pickup_observations", "pickup_delay_ms", "last_observed_ms", "conflicts"];
function transport(capture: Body[], rows: (string | null)[][] = [], resultColumns: string[] = []): typeof fetch {
  return (async (_url, init) => {
    capture.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ statement_id: "test-statement", status: { state: "SUCCEEDED" }, manifest: {
      total_row_count: rows.length, schema: { columns: resultColumns.map((name, position) => ({ name, position })) },
    }, result: { data_array: rows } }), { status: 200 });
  }) as typeof fetch;
}

test("empty and insufficient real history return unknown, never a guessed reliability", () => {
  const empty = calculateProviderReliability([], providerId, at);
  assert.equal(empty.status, "unknown"); assert.equal(empty.reliability, null); assert.equal(empty.sampleSize, 0);
  const small = calculateProviderReliability(Array.from({ length: 9 }, (_, i) => outcome(i)), providerId, at);
  assert.equal(small.reliability, null); assert.equal(small.sampleSize, 9);
});

test("real completion and provider cancellation history use conservative shrinkage and delay evidence", () => {
  const records = [...Array.from({ length: 8 }, (_, i) => outcome(i)), ...Array.from({ length: 4 }, (_, i) => canceled(i + 10))];
  const reliability = calculateProviderReliability(records, providerId, at);
  assert.equal(reliability.status, "sufficient"); assert.equal(reliability.reliability, 13 / 22);
  assert.equal(reliability.completed, 8); assert.equal(reliability.providerCanceled, 4);
  assert.equal(reliability.averagePickupDelayMinutes, 2); assert.equal(reliability.pickupObservations, 8);
  assert.deepEqual(calculateProviderReliability([...records].reverse(), providerId, at), reliability);
  const perfectSmall = calculateProviderReliability(Array.from({ length: 10 }, (_, i) => outcome(i)), providerId, at);
  assert.equal(perfectSmall.reliability, 0.75);
});

test("simulated, self-reported and unattributed/student cancellations never count as observed reliability", () => {
  const records = [outcome(1, { source: "simulated" }), outcome(2, { source: "provider_reported" }), canceled(3, "student"), canceled(4, "unknown")];
  const result = calculateProviderReliability(records, providerId, at);
  assert.equal(result.sampleSize, 0); assert.equal(result.excluded, 4); assert.equal(result.reliability, null);
});

test("identical retries count once and changed final facts cannot double-count one observation", () => {
  const row = outcome();
  assert.equal(calculateProviderReliability([row, { ...row }], providerId, at).sampleSize, 1);
  assert.throws(() => calculateProviderReliability([row, canceled(1)], providerId, at), /CONFLICTING_PROVIDER_OUTCOME/);
  assert.throws(() => calculateProviderReliability([row, { ...row, dataVersion: "test-v2" }], providerId, at), /CONFLICTING_PROVIDER_OUTCOME/);
});

test("window is exactly 30 days and future/other-provider observations cannot affect a replay", () => {
  const old = outcome(1, { requestedAt: "2026-08-20T13:00:00Z", acceptedAt: null, promisedPickupAt: null, actualPickupAt: null,
    completedAt: "2026-08-20T15:00:00Z", observedAt: "2026-08-20T15:01:00Z" });
  const records = [old, outcome(2, { observedAt: "2026-09-19T16:00:00Z" }), outcome(3, { providerId: "other-provider" }), outcome(4)];
  assert.equal(calculateProviderReliability(records, providerId, at).sampleSize, 1);
});

test("strict timestamp and terminal validation reject malformed or inconsistent observations", () => {
  for (const value of ["2026-02-30T12:00:00Z", "2026-09-19", "2026-09-19T24:00:00Z", "2026-09-19T13:00:00-04:00", "never"]) {
    assert.throws(() => providerOutcomeTimestamp(value), /INVALID_OUTCOME_TIMESTAMP/);
  }
  assert.equal(providerOutcomeTimestamp("2026-09-19T12:00:00.1Z"), "2026-09-19T12:00:00.100Z");
  assert.throws(() => validateProviderOutcome(outcome(1, { actualPickupAt: "2026-09-19T12:00:00Z" })), /INVALID_OUTCOME_SEQUENCE/);
  assert.throws(() => validateProviderOutcome(outcome(1, { observedAt: "2026-09-19T13:00:00Z" })), /INVALID_OUTCOME_SEQUENCE/);
  assert.throws(() => validateProviderOutcome(outcome(1, { canceledAt: at })), /INCONSISTENT_FINAL_OUTCOME/);
  assert.throws(() => validateProviderOutcome(outcome(1, { completedAt: null })), /INCONSISTENT_FINAL_OUTCOME/);
});

test("privacy allowlist rejects identity/location/free-text payloads and coerced provenance", () => {
  for (const field of ["tripId", "bookingId", "studentId", "lat", "contact", "notes", "coordinates"]) {
    assert.throws(() => validateProviderOutcome({ ...outcome(), [field]: "must-not-be-stored" }), /UNEXPECTED_OUTCOME_FIELD/);
  }
  assert.throws(() => validateProviderOutcome({ ...outcome(), source: { toString: () => "beacon_observed", studentId: "secret" } }), /INVALID_OUTCOME_PROVENANCE/);
  assert.throws(() => validateProviderOutcome({ ...outcome(), observationId: "trip-123" }), /INVALID_OBSERVATION_ID/);
});

test("managed ingestion binds one allowlisted payload, preserves idempotence key and rejects future/private input before HTTP", async () => {
  const calls: Body[] = [];
  const result = await ingestProviderOutcome(config, table, outcome(), { fetch: transport(calls), receivedAt: at });
  assert.equal(result.statementId, "test-statement");
  assert.equal(calls.length, 1); assert.equal(calls[0].parameters.length, 1);
  assert.deepEqual(JSON.parse(calls[0].parameters[0].value), validateProviderOutcome(outcome()));
  assert.ok(!calls[0].statement.includes(outcome().observationId));
  assert.ok(!calls[0].statement.includes(outcome().providerId));
  assert.match(calls[0].statement, /target\.observation_id = incoming\.observation_id/);
  assert.match(calls[0].statement, /raise_error\('CONFLICTING_PROVIDER_OUTCOME'\)/);
  await assert.rejects(ingestProviderOutcome(config, table, { ...outcome(), tripId: "secret" }, { fetch: transport(calls), receivedAt: at }), /UNEXPECTED_OUTCOME_FIELD/);
  await assert.rejects(ingestProviderOutcome(config, table, outcome(2, { observedAt: "2026-09-20T15:00:00Z" }), { fetch: transport(calls), receivedAt: at }), /FUTURE_PROVIDER_OUTCOME/);
  assert.equal(calls.length, 1);
});

test("managed aggregation uses the same policy, parameterized provider/time, and an untruncated deduplicated sample", async () => {
  const calls: Body[] = [], records = [...Array.from({ length: 8 }, (_, i) => outcome(i)), ...Array.from({ length: 4 }, (_, i) => canceled(i + 10))];
  const expected = calculateProviderReliability(records, providerId, at);
  const row = ["8", "4", "0", "8", "960000", String(Date.parse(outcome().observedAt)), "0"];
  const { statementId, ...actual } = await getProviderReliability(config, table, providerId, at, { fetch: transport(calls, [row], columns) });
  assert.equal(statementId, "test-statement"); assert.deepEqual(actual, expected);
  assert.deepEqual(calls[0].parameters.map(p => p.value), [providerId, at]);
  assert.ok(!calls[0].statement.includes(providerId)); assert.ok(!calls[0].statement.includes(at));
  assert.match(calls[0].statement, /GROUP BY observation_id/); assert.match(calls[0].statement, /COUNT\(DISTINCT payload_json\)/);
  assert.match(calls[0].statement, /source = 'beacon_observed'/); assert.ok(!calls[0].statement.includes("LIMIT"));
});

test("managed empty table is unknown; conflict, malformed result and outage reject instead of inventing history", async () => {
  const empty = ["0", "0", "0", "0", "0", null, "0"];
  const result = await getProviderReliability(config, table, providerId, at, { fetch: transport([], [empty], columns) });
  assert.equal(result.status, "unknown"); assert.equal(result.reliability, null);
  await assert.rejects(getProviderReliability(config, table, providerId, at, { fetch: transport([], [[...empty.slice(0, 6), "1"]], columns) }), /CONFLICTING_PROVIDER_OUTCOME/);
  await assert.rejects(getProviderReliability(config, table, providerId, at, { fetch: transport([], [["NaN", ...empty.slice(1)]], columns) }), /INVALID_PROVIDER_OUTCOME_RESULT/);
  await assert.rejects(getProviderReliability(config, table, providerId, at, { fetch: transport([], [], columns) }), /INVALID_PROVIDER_OUTCOME_RESULT/);
  await assert.rejects(getProviderReliability(config, table, providerId, at, { fetch: (async () => { throw new Error("network down"); }) as typeof fetch }), /WORKSPACE_TRANSPORT_FAILED/);
});

test("table configuration cannot inject SQL and bootstrap never inserts fake rows", () => {
  const sql = providerOutcomesSchemaSql(table);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `workspace`.`beacon`.`provider_outcomes`/);
  assert.ok(!sql.includes("INSERT"));
  assert.throws(() => providerOutcomesSchemaSql("workspace.beacon.provider_outcomes; DROP TABLE x"), /INVALID_TABLE_CONFIG/);
});
