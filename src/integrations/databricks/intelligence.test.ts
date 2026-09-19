import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRouteEvidence, walkingOption, runIntelligence } from "./intelligence";
import { getRouteEvidence } from "../../lib/decision-client/route-evidence";
const snapshot=JSON.parse(readFileSync("data/campus/route-evidence.json","utf8"));
const workspace={host:"https://test.cloud.databricks.com",token:"test",warehouseId:"test",routeEvidenceTable:"workspace.beacon.route_evidence"};
test("managed route query binds corridor, validates snapshot and rejects mismatch",async()=>{
  const route=getRouteEvidence("eggleston-pritchard",snapshot)!;
  const fetcher=(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    assert.equal(body.parameters[0].value,"eggleston-pritchard");
    return new Response(JSON.stringify({statement_id:"route-1",status:{state:"SUCCEEDED"},manifest:{schema:{columns:[{name:"payload_json",position:0}]},total_row_count:1},result:{data_array:[[JSON.stringify(route)]]}}));
  }) as typeof fetch;
  const found=await loadRouteEvidence(workspace,"eggleston-pritchard",{fetch:fetcher});
  assert.equal(found?.evidence.status,"supported");
  assert.equal(found?.statementId,"route-1");
  await assert.rejects(loadRouteEvidence(workspace,"newman-pritchard",{fetch:(async()=>new Response(JSON.stringify({statement_id:"wrong-route",status:{state:"SUCCEEDED"},manifest:{schema:{columns:[{name:"payload_json",position:0}]},total_row_count:1},result:{data_array:[[JSON.stringify(route)]]}}))) as typeof fetch}), /ROUTE_CORRIDOR_MISMATCH/);
});
test("walking estimate uses source geometry only, discloses offsets and rejects unsupported/stale routes",()=>{
  const route=getRouteEvidence("eggleston-pritchard",snapshot)!;
  const at=route.captured_at;
  const option=walkingOption(route,at);
  assert.ok(option);
  assert.equal(option.candidate.cost,0);
  assert.equal(option.signals.source,"mapped");
  assert.ok(option.candidate.walkingMinutes>0);
  assert.equal(option.signals.corridorId,"eggleston-pritchard");
  assert.equal(walkingOption({...route,status:"unsupported",geometry:null,distance_meters:null},at),null);
  assert.equal(walkingOption(route,new Date(Date.parse(at)+8*86400000).toISOString()),null);
});
test("combined intelligence preserves local decision and clearly reports missing cloud context",async()=>{
  const result=await runIntelligence([], {maxBudget:5}, {}, {corridorId:"eggleston-pritchard",enableAi:true});
  assert.equal(result.decision.status,"NO_FEASIBLE_PLAN");
  assert.equal(result.route,null);
  assert.ok(result.warnings.includes("ROUTE_EVIDENCE_UNAVAILABLE"));
});
