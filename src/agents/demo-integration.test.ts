import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPlanningToJourney} from '../lib/journey/planning';
import type {PlanningView} from '../lib/planner/contracts';
import {createDemoRideControl} from '../lib/trip-state/demo-ride-control';
import {demoDescriptors} from './demo-provider';

test('atomic journey never presents explanation from another scenario revision',()=>{
  const view:PlanningView={version:'beacon-planning-v1',runId:'run',phase:'ready',worker:'online',modelSource:'codex_subscription',explanationSource:'llm_grounded',snapshotId:'new',messageCode:'PLAN_READY_GROUNDED',explanation:'Take the new ride.'};
  assert.equal(bindPlanningToJourney(view,'new')?.explanation,view.explanation);
  const mismatched=bindPlanningToJourney(view,'old');
  assert.equal(mismatched?.explanation,undefined);assert.equal(mismatched?.phase,'unavailable');assert.equal(view.phase,'ready');
});
test('operator control is opt-in and cannot forward credentials to discovered providers',async()=>{
  assert.equal(createDemoRideControl({DEMO_MODE:'true'},demoDescriptors,()=>undefined),undefined);
  const control=createDemoRideControl({DEMO_MODE:'true',BEACON_DEMO_RIDE_PROGRESS:'true'},demoDescriptors,()=> 'private-token');
  await assert.rejects(control!({...demoDescriptors[1],baseUrl:'https://external.example'},'booking','approaching'),{code:'DEMO_DISABLED'});
});
