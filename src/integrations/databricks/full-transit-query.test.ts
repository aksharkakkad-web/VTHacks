import test from "node:test";
import assert from "node:assert/strict";
import { loadFullTransit } from "./full-transit-query";
import { evaluateCandidates } from "../../lib/decision-client/decision";

const workspace = { host: "https://test.cloud.databricks.com", token: "test", warehouseId: "warehouse", transitSchema: "workspace.beacon" };
const request = { fromStopId: "1100", toStopId: "1146", evaluatedAt: "2026-09-19T05:20:00-04:00", accessWalkingMinutes: 2, egressWalkingMinutes: 1, maxWaitMinutes: 20, walkingSource: "estimated" as const };
const columns = ["source_sha256", "captured_at", "service_date", "trip_id", "route_id", "route_short_name", "route_long_name", "from_stop_id", "to_stop_id", "board_sequence", "alight_sequence", "departure_at", "arrival_at", "transfers", "source_kind"];
const sourceSha256 = "aed7634f4df2e942f1af101c24d05f53e2b8686013f0bbe843b0e1c8dd34dd85";
const row = [sourceSha256, String(Date.parse("2026-09-19T08:00:00Z")), "2026-09-18", "night-trip", "CAS", "CAS", "Campus Shuttle", "1100", "1146", "4", "9", String(Date.parse("2026-09-19T09:26:31Z")), String(Date.parse("2026-09-19T09:37:41Z")), "0", "scheduled"];
function fakeResponse(rows: (string | null)[][] = [row], returnedColumns = columns) {
  return new Response(JSON.stringify({ statement_id: "native-1", status: { state: "SUCCEEDED" }, manifest: { schema: { columns: returnedColumns.map((name, position) => ({ name, position })) }, total_row_count: rows.length }, result: { data_array: rows } }));
}
function fetchRows(rows: (string | null)[][] = [row], returnedColumns = columns) {
  return (async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    return fakeResponse(rows, returnedColumns);
  }) as typeof fetch;
}

test("binds explicit stop/time/walk/wait parameters and uses only validated native tables", async () => {
  let inspected = false;
  const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.ok(body.statement.includes("`workspace`.`beacon`.`transit_imports`"));
    for (const name of ["transit_stops", "transit_service_trips", "transit_trips", "transit_routes", "transit_stop_times"]) assert.ok(body.statement.includes(`\`workspace\`.\`beacon\`.\`${name}\``));
    assert.ok(body.statement.includes("alight.stop_sequence > board.stop_sequence"));
    assert.ok(body.statement.includes("board.pickup_type = 0"));
    assert.ok(body.statement.includes("alight.drop_off_type = 0"));
    assert.ok(!body.statement.includes(request.evaluatedAt));
    assert.deepEqual(Object.fromEntries(body.parameters.map((item: { name: string; value: string }) => [item.name, item.value])), { from_stop_id: "1100", to_stop_id: "1146", access_seconds: "120", evaluated_at: "2026-09-19T09:20:00.000Z", max_wait_seconds: "1200" });
    inspected = true;
    return fakeResponse();
  }) as typeof fetch;
  await loadFullTransit(workspace, request, { fetch: fakeFetch });
  assert.ok(inspected);
});

test("overnight service returns a scheduled option with wait/access/egress counted once and warned POC estimate", async () => {
  const result = await loadFullTransit(workspace, request, { fetch: fetchRows() });
  assert.ok(result);
  assert.equal(result.statementId, "native-1");
  assert.equal(result.candidate.walkingMinutes, 3);
  assert.equal(Math.round(result.candidate.waitMinutes * 60), 271);
  assert.equal(Math.round(result.candidate.travelMinutes * 60), 670);
  assert.equal(Math.round(result.candidate.totalMinutes * 60), 1121);
  assert.equal(result.candidate.transfers, 0);
  assert.equal(result.candidate.planId, `bt:${sourceSha256.slice(0, 12)}:2026-09-18:night-trip`);
  assert.equal(result.signals.source, "scheduled");
  assert.equal(result.signals.validUntil, "2026-09-19T09:23:31.000Z");
  assert.equal(result.source.serviceDate, "2026-09-18");
  assert.equal(result.source.sourceSha256, sourceSha256);
  assert.equal(result.source.walkingSource, "estimated");
  assert.ok(result.warnings.some(warning => /estimated/i.test(warning)));
  assert.equal(evaluateCandidates([result.candidate], { maxBudget: 0, evaluatedAt: request.evaluatedAt }, { [result.candidate.planId]: result.signals }).status, "RECOMMENDED");
});

test("mapped walk input never implies verified lighting, shelter, or live schedule", async () => {
  const result = await loadFullTransit(workspace, { ...request, walkingSource: "mapped" }, { fetch: fetchRows() });
  assert.equal(result?.source.walkingSource, "mapped");
  assert.equal(result?.signals.source, "scheduled");
  assert.equal(result?.signals.lighting, "unknown");
  assert.ok(!result?.warnings.some(warning => /estimated/i.test(warning)));
});

test("missed boarding buffer and excessive wait produce no option", async () => {
  assert.equal(await loadFullTransit(workspace, { ...request, evaluatedAt: "2026-09-19T09:24:00Z" }, { fetch: fetchRows() }), null);
  assert.equal(await loadFullTransit(workspace, { ...request, maxWaitMinutes: 3 }, { fetch: fetchRows() }), null);
});

test("unknown stops return no option; malformed stop IDs, timestamp and estimates fail before network", async () => {
  assert.equal(await loadFullTransit(workspace, request, { fetch: fetchRows([[...row.slice(0, 7), "other", ...row.slice(8)]]) }), null);
  const shouldNotFetch = (() => { throw new Error("Unexpected network request"); }) as typeof fetch;
  for (const invalid of [
    { fromStopId: "1' OR 1=1" }, { toStopId: "" }, { fromStopId: "1146" },
    { evaluatedAt: "2026-09-19T09:20:00" }, { evaluatedAt: "2026-02-30T09:20:00Z" }, { accessWalkingMinutes: -1 },
    { egressWalkingMinutes: Number.NaN }, { maxWaitMinutes: -1 }, { walkingSource: "verified" },
  ]) await assert.rejects(loadFullTransit(workspace, { ...request, ...invalid } as typeof request, { fetch: shouldNotFetch }), /Invalid full transit request/);
});

test("stale snapshot yields no supported itinerary; malformed rows fail closed", async () => {
  assert.equal(await loadFullTransit(workspace, request, { fetch: fetchRows([[row[0], String(Date.parse("2026-09-01T00:00:00Z")), ...row.slice(2)]]) }), null);
  for (const malformed of [
    [...row.slice(0, 10), "3", ...row.slice(11)],
    ["not-a-sha", ...row.slice(1)],
    [...row.slice(0, 2), "2026-13-40", ...row.slice(3)],
    [...row.slice(0, 11), "NaN", ...row.slice(12)],
    [...row.slice(0, 12), row[11], ...row.slice(13)],
    [...row.slice(0, 14), "live"],
  ]) await assert.rejects(loadFullTransit(workspace, request, { fetch: fetchRows([malformed]) }), /Invalid full transit result/);
  await assert.rejects(loadFullTransit(workspace, request, { fetch: fetchRows([row], [...columns].reverse()) }), /Invalid full transit result/);
});

test("no SQL row or invalid schema cannot create an option", async () => {
  assert.equal(await loadFullTransit(workspace, request, { fetch: fetchRows([]) }), null);
  await assert.rejects(loadFullTransit({ ...workspace, transitSchema: "workspace.beacon;DROP" }, request, { fetch: fetchRows() }), /INVALID_TABLE_CONFIG/);
});
