import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './build.mjs';

export async function runDemo(track, live = false) {
  const { runDecision } = track.load('integrations/databricks/evaluate.js');
  const env = process.env;
  const workspace = live ? {host:env.DATABRICKS_HOST,token:env.DATABRICKS_TOKEN,warehouseId:env.DATABRICKS_WAREHOUSE_ID,routeContextTable:env.DATABRICKS_ROUTE_CONTEXT_TABLE,auditTable:env.DATABRICKS_AUDIT_TABLE} : undefined;
  const evaluateTrip = (plans, context, signals) => runDecision(plans, context, signals, {workspace});
  const { selectScheduledTransit } = track.load('lib/decision-client/transit.js');
  const { loadScheduledTransit } = track.load('integrations/databricks/transit-query.js');
  const at = new Date().toISOString();
  const candidate = (planId, providerId, providerName, mode, cost, waitMinutes, travelMinutes, walkingMinutes, reliability) => ({ planId, providerId, providerName, mode, cost, waitMinutes, travelMinutes, walkingMinutes, totalMinutes:waitMinutes+travelMinutes+walkingMinutes, reliability, transfers:0, available:true, requiresProviderVerification:mode.includes('ride') });
  const plans = [
    candidate('campus','campus','Campus Ride demo','campus_ride',0,8,11,1,.98),
    candidate('independent','independent','Independent Ride demo','independent_ride',7,5,10,1,.94),
    candidate('transit','transit','Transit demo','transit',0,15,14,5,.94),
    candidate('walk',null,'Walk demo','walk',0,0,0,22,1),
  ];
  const signals = Object.fromEntries(plans.map(p => [p.planId,{source:'simulated',lighting:'unknown'}]));
  const base = {maxBudget:10,minimizeWalking:true,minimizeTransfers:true,evaluatedAt:at,policyVersion:'beacon-v2'};
  const scenarios = [
    ['Normal choice',{},'campus'],
    ['Campus ride cancels',{excludedProviderIds:['campus'],objectiveVersion:1},'independent'],
    ['Budget reduced to $6',{excludedProviderIds:['campus'],maxBudget:6,objectiveVersion:2},'transit'],
    ['Cheapest after cancellation',{excludedProviderIds:['campus'],priority:'lowest_cost'},'transit'],
    ['Zero walking allowed',{maxWalkingMinutes:0},null],
  ];
  console.log(`\nBeacon decision demo — ${live ? 'Databricks SQL REQUIRED' : 'local/fallback allowed'}; provider offers SIMULATED.`);
  for (const [label, changes, winner] of scenarios) {
    const result = await evaluateTrip(plans, {...base,...changes},signals);
    if (live) assert.equal(result.engine,'databricks',`${label}: live SQL failed (${result.fallbackReason || result.engine})`);
    if (live) assert.equal(result.auditPersisted,true,`${label}: audit did not persist`);
    assert.equal(result.status,winner ? 'RECOMMENDED':'NO_FEASIBLE_PLAN');
    if (winner) assert.equal(result.recommendation.selectedPlanId,winner);
    console.log(JSON.stringify({scenario:label,engine:result.engine,selected:result.status==='RECOMMENDED'?result.recommendation.selectedPlanId:null,status:result.status,statementId:result.statementId,auditPersisted:result.auditPersisted,explanation:result.recommendation?.explanation,warnings:result.warnings}));
  }
  if (live) {
    const currentSignals = Object.fromEntries(plans.map(p => [p.planId,{...signals[p.planId],corridorId:'eggleston-pritchard'}]));
    const contextResult = await evaluateTrip(plans,{...base,evaluatedAt:new Date().toISOString()},currentSignals);
    assert.equal(contextResult.engine,'databricks');
    assert.equal(contextResult.status,'RECOMMENDED');
    assert.ok(contextResult.ranked.every(p => p.evidence?.contextVersion),'Refresh/import campus context before the live demo');
    assert.equal(contextResult.auditPersisted,true);
    console.log(JSON.stringify({scenario:'Current official campus weather joined from managed table',engine:contextResult.engine,contextVersion:contextResult.ranked[0].evidence.contextVersion,weather:contextResult.ranked[0].evidence.weather,statementId:contextResult.statementId,auditPersisted:contextResult.auditPersisted}));
  }
  const departures = JSON.parse(readFileSync(join(root,'data/campus/transit-departures.json'),'utf8'));
  // A fixed historical snapshot replay is stable for judging and visibly not a live arrival.
  const example = departures.find(d => d.corridor_id === 'newman-pritchard' && d.departure_at > '2026-09-19T00:00:00Z') || departures[0];
  assert.ok(example,'Official scheduled departures must exist');
  const replayAt = new Date(Date.parse(example.departure_at)-10*60000).toISOString();
  const transitRequest = {corridorId:'newman-pritchard',evaluatedAt:replayAt,accessWalkingMinutes:2,egressWalkingMinutes:1};
  const scheduled = live
    ? await loadScheduledTransit({...workspace,transitTable:env.DATABRICKS_TRANSIT_TABLE},transitRequest)
    : selectScheduledTransit(departures,transitRequest);
  assert.ok(scheduled,'Scheduled replay must have a catchable bus');
  const result = await evaluateTrip([scheduled.candidate],{maxBudget:0,evaluatedAt:replayAt},{[scheduled.candidate.planId]:scheduled.signals});
  if (live) assert.equal(result.engine,'databricks');
  if (live) assert.equal(result.auditPersisted,true);
  assert.equal(result.status,'RECOMMENDED');
  console.log(JSON.stringify({scenario:'Official GTFS snapshot replay: Newman → Pritchard',replayAt,accessAndEgress:'Demo assumptions: 2 minutes to stop + 1 minute from stop',engine:result.engine,source:scheduled.signals.source,feedVersion:scheduled.signals.dataVersion,cost:scheduled.candidate.cost,totalMinutes:scheduled.candidate.totalMinutes,status:result.status,statementId:result.statementId,scheduleStatementId:scheduled.statementId}));
}
