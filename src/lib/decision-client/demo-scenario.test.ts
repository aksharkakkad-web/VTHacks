import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoScenario, demoScenarioRoute, scenarioCondition, scenarioExposure, scenarioEnabled, demoScenarioStops, demoScenarioTransit } from './demo-scenario';
import { validateWalkingRoute } from './walking-router';

const at='2026-09-19T21:00:00.000Z';
const from={lat:37.2288,lng:-80.4192},to={lat:37.2268,lng:-80.4192};

test('synthetic route is bounded, time-limited, and explicitly not real navigation',async()=>{
 const route=await demoScenarioRoute(from,to,at);
 assert.equal(validateWalkingRoute(route,from,to,at).provider,'beacon_synthetic_demo');
 assert.match(route.instructions[0].text,/simulated.*not navigation/i);
 assert.ok(route.warnings?.some(x=>/simulated/i.test(x)));
 await assert.rejects(demoScenarioRoute({lat:38,lng:-80.4192},to,at),/outside the supported campus box/i);
});
test('every scenario variant supplies numeric synthetic lighting, incident, rain and a current shelter',()=>{
 for(const variant of ['baseline','lighting_outage','incident_pressure','rain'] as const){
  const scenario=createDemoScenario(variant,at,{id:'origin',name:'Current location',point:from});
  assert.equal(scenario.currentWaitingPlace.accessAllowed,true);
  assert.equal(scenario.currentWaitingPlace.sheltered,variant==='incident_pressure'?false:true);
  assert.equal(scenario.waitingPlaces.length,variant==='incident_pressure'?1:0);
  assert.match(scenario.currentWaitingPlace.sourceUrl,/\.invalid\//);
  for(const surface of ['walking_path','waiting_point','pickup_point','dropoff_point'] as const){
   const evidence=scenarioCondition(variant,surface);
   assert.equal(evidence.source,'synthetic_demo');
   assert.ok(Number.isInteger(evidence.lightingCoveragePercent));
   assert.ok(Number.isInteger(evidence.historicalIncidentIndex));
   assert.equal(typeof evidence.rain,'boolean');
  }
 }
 assert.equal(scenarioCondition('lighting_outage','walking_path').lightingCoveragePercent,15);
 assert.equal(scenarioCondition('incident_pressure','walking_path').historicalIncidentIndex,70);
 assert.equal(scenarioCondition('rain','walking_path').rain,true);
});
test('scenario penalty counts only uncovered walking, unsheltered wait and scenario incident/rain terms',()=>{
 const baseline=scenarioExposure([{kind:'walk',durationSeconds:120,sheltered:false,evidence:scenarioCondition('baseline','walking_path')}]);
 const outage=scenarioExposure([{kind:'walk',durationSeconds:120,sheltered:false,evidence:scenarioCondition('lighting_outage','walking_path')}]);
 const sheltered=scenarioExposure([{kind:'wait',durationSeconds:120,sheltered:true,evidence:scenarioCondition('lighting_outage','waiting_point')}]);
 assert.deepEqual(baseline,{lightingExposureSeconds:3,incidentPressureSeconds:2,rainWalkingSeconds:0});
 assert.deepEqual(outage,{lightingExposureSeconds:102,incidentPressureSeconds:2,rainWalkingSeconds:0});
 assert.equal(sheltered.lightingExposureSeconds,0);
});
test('two explicit server flags are required for synthetic activation',()=>{
 assert.equal(scenarioEnabled({DEMO_MODE:'true',BEACON_DEMO_SCENARIO:'true'}),true);
 assert.equal(scenarioEnabled({DEMO_MODE:'true'}),false);
 assert.equal(scenarioEnabled({BEACON_DEMO_SCENARIO:'true'}),false);
 assert.equal(scenarioEnabled({DEMO_MODE:'false',BEACON_DEMO_SCENARIO:'true'}),false);
});
test('demo direct bus is an explicitly simulated schedule without a fabricated cloud statement',()=>{
 const origin={id:'origin',name:'Current location',point:from},destination={id:'home',name:'Home',point:to};
 const stops=demoScenarioStops(origin,destination);
 const bus=demoScenarioTransit({fromStopId:stops[0].id,toStopId:stops[1].id,evaluatedAt:at,accessWalkingMinutes:0,egressWalkingMinutes:0,maxWaitMinutes:45,walkingSource:'estimated'});
 assert.equal(bus?.signals.source,'simulated');
 assert.equal(bus?.statementId,null);
 assert.equal(bus?.source.departureAt,'2026-09-19T21:15:00.000Z');
 assert.ok(bus?.warnings.some(x=>/simulated/i.test(x)));
 assert.equal(demoScenarioTransit({fromStopId:'other',toStopId:stops[1].id,evaluatedAt:at,accessWalkingMinutes:0,egressWalkingMinutes:0,maxWaitMinutes:45,walkingSource:'estimated'}),null);
});
