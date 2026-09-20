import test from "node:test";
import assert from "node:assert/strict";
import { explainEvidence } from "./explain";
import type { EvidenceBrief } from "../../lib/decision-client/intelligence";
const brief:EvidenceBrief={status:"RECOMMENDED",selectedPlanId:"p1",facts:[{id:"selected",text:"The option costs $0.00.",sourceKind:"verified_calculation"},{id:"limitations",text:"Lighting is unknown.",sourceKind:"coverage_limit"}],requiredFactIds:["selected","limitations"],alternatives:[]};
const workspace={host:"https://test.cloud.databricks.com",token:"secret",warehouseId:"test"};
function response(raw:string) { return new Response(JSON.stringify({statement_id:"ai-1",status:{state:"SUCCEEDED"},manifest:{schema:{columns:[{name:"evidence_order",position:0}]},total_row_count:1},result:{data_array:[[raw]]}})); }
test("native model selects validated evidence; prompt is bound and contains no credentials",async()=>{
  const result=await explainEvidence(brief,{workspace,enabled:true,fetch:(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    assert.ok(body.statement.includes("ai_query("));
    assert.ok(body.statement.includes(":prompt"));
    assert.ok(!body.parameters[0].value.includes("secret"));
    assert.ok(!body.parameters[0].value.includes("p1"));
    return response('{"fact_ids":["selected"]}');
  }) as typeof fetch});
  assert.equal(result.engine,"databricks_ai");
  assert.equal(result.statementId,"ai-1");
  assert.equal(result.facts[1].id,"limitations");
});
test("invalid AI output and workspace outage return grounded local evidence",async()=>{
  for(const fetcher of [(async()=>response('{"fact_ids":["invented"]}')) as typeof fetch,(async()=>new Response("denied",{status:403})) as typeof fetch]) {
    const result=await explainEvidence(brief,{workspace,enabled:true,fetch:fetcher});
    assert.equal(result.engine,"template_fallback");
    assert.ok(result.warning);
    assert.deepEqual(result.facts.map(f=>f.id),["selected","limitations"]);
  }
});
test("emergency, disabled AI and missing workspace do not make model requests",async()=>{
  const forbidden=(async()=>{throw new Error("should not call")}) as typeof fetch;
  assert.equal((await explainEvidence({...brief,status:"EMERGENCY",selectedPlanId:null},{workspace,enabled:true,fetch:forbidden})).engine,"template");
  assert.equal((await explainEvidence(brief,{workspace,enabled:false,fetch:forbidden})).engine,"template");
  assert.equal((await explainEvidence(brief,{enabled:true,fetch:forbidden})).engine,"template_fallback");
});
