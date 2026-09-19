import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './build.mjs';

export async function runIntelligenceDemo(track, live=false, ai=false) {
  const { runIntelligence,loadRouteEvidence,walkingOption }=track.load('integrations/databricks/intelligence.js');
  const { getRouteEvidence }=track.load('lib/decision-client/route-evidence.js');
  const env=process.env;
  const workspace=live?{host:env.DATABRICKS_HOST,token:env.DATABRICKS_TOKEN,warehouseId:env.DATABRICKS_WAREHOUSE_ID,routeContextTable:env.DATABRICKS_ROUTE_CONTEXT_TABLE,auditTable:env.DATABRICKS_AUDIT_TABLE,routeEvidenceTable:env.DATABRICKS_ROUTE_EVIDENCE_TABLE}:undefined;
  const route=live?(await loadRouteEvidence(workspace,'eggleston-pritchard'))?.evidence:getRouteEvidence('eggleston-pritchard',JSON.parse(readFileSync(join(root,'data/campus/route-evidence.json'),'utf8')));
  assert.equal(route.status,'supported');
  // Public path length supports an explicitly estimated WALK alternative, not a verified doorstep route.
  const walking=walkingOption(route);
  assert.ok(walking);
  const plans=[
    {planId:'ride-demo',providerId:'campus-demo',providerName:'Simulated ride',mode:'campus_ride',cost:7,waitMinutes:2,travelMinutes:5,walkingMinutes:1,totalMinutes:8,transfers:0,reliability:.95,available:true,requiresProviderVerification:true},
    walking.candidate,
  ];
  const signals={'ride-demo':{source:'simulated',corridorId:route.corridor_id},[walking.candidate.planId]:walking.signals};
  const context={maxBudget:10,minimizeWalking:true,evaluatedAt:new Date().toISOString()};
  const combined=await runIntelligence(plans,context,signals,{workspace,corridorId:route.corridor_id,enableAi:ai,aiTimeoutMs:60000});
  const {decision,explanation}=combined;
  if(live){assert.equal(decision.engine,'databricks');assert.equal(decision.auditPersisted,true);assert.ok(combined.routeStatementId);}
  assert.equal(decision.status,'RECOMMENDED');
  if(ai) assert.equal(explanation.engine,'databricks_ai',explanation.warning);
  const cheaper=await runIntelligence(plans,{...context,maxBudget:0},signals,{workspace,corridorId:route.corridor_id});
  if(live){assert.equal(cheaper.decision.engine,'databricks');assert.equal(cheaper.decision.auditPersisted,true);assert.ok(cheaper.routeStatementId);}
  assert.equal(cheaper.decision.status,'RECOMMENDED');
  assert.equal(cheaper.decision.recommendation.selectedPlanId,walking.candidate.planId);
  console.log(JSON.stringify({decision,route:{corridor:route.corridor_id,meters:route.distance_meters,phones:route.nearby_phones.length,lighting:route.lighting},routeStatementId:combined.routeStatementId,explanation,budgetZero:{engine:cheaper.decision.engine,selected:cheaper.decision.recommendation.selectedPlanId,statementId:cheaper.decision.statementId}},null,2));
}
