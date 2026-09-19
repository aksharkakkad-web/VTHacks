import test from "node:test";
import assert from "node:assert/strict";
import { loadScheduledTransit } from "./transit-query";

const names = ["corridor_id","trip_id","route_id","route_name","service_date","departure_at","arrival_at","travel_minutes","from_stop_id","to_stop_id","source_id","source_version"];
test("managed transit lookup binds corridor/time and produces a scheduled candidate", async () => {
  const mock = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.ok(!body.statement.includes("2026-09-19T"));
    assert.ok(body.statement.includes("`workspace`.`beacon`.`transit_departures`"));
    assert.equal(body.parameters[0].value, "eggleston-pritchard");
    return new Response(JSON.stringify({statement_id:"schedule-1",status:{state:"SUCCEEDED"},manifest:{schema:{columns:names.map((name,position)=>({name,position}))},total_row_count:1},result:{data_array:[["eggleston-pritchard","trip-1","CAS","Campus Shuttle","2026-09-19",String(Date.parse("2026-09-19T12:10:00Z")),String(Date.parse("2026-09-19T12:20:00Z")),"10","1143","1146","bt-gtfs","FY27"]]}}));
  }) as typeof fetch;
  const result = await loadScheduledTransit({host:"https://test.cloud.databricks.com",token:"test",warehouseId:"warehouse",transitTable:"workspace.beacon.transit_departures"},{corridorId:"eggleston-pritchard",evaluatedAt:"2026-09-19T12:00:00Z",accessWalkingMinutes:2,egressWalkingMinutes:1},{fetch:mock});
  assert.equal(result?.candidate.totalMinutes,21);
  assert.equal(result?.signals.source,"scheduled");
  assert.equal(result?.statementId,"schedule-1");
});
