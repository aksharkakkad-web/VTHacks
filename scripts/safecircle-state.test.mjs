import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const build = mkdtempSync(join(tmpdir(), 'safecircle-state-'));
for (const name of ['mock-data', 'demo-controller']) {
  const source = readFileSync(new URL(`../src/components/safecircle/${name}.ts`, import.meta.url), 'utf8');
  writeFileSync(join(build, `${name}.js`), ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
after(() => rmSync(build, {recursive:true,force:true}));
const { createDemoState, transitionDemo: act, deriveViewModel: view, validatedProfile } = require(join(build,'demo-controller.js'));
const { defaultProfile, campusRide, rideshare, eligiblePlans } = require(join(build,'mock-data.js'));
const advance = state => act(state,{type:'ADVANCE'});
function until(state, stage) {
  for(let i=0;i<40 && state.stage!==stage;i++) state=advance(state);
  assert.equal(state.stage,stage,`Expected ${stage}`);
  return state;
}
function recommendation(profile=defaultProfile) {
  return until(act(createDemoState(profile),{type:'START_TRIP'}),'recommendation');
}

test('home has no completed trust or trip events',()=>{
  const state=createDemoState(defaultProfile);
  assert.equal(view(state).timeline.filter(step=>step.state==='done').length,0);
  assert.equal(view(state).providerVerified,false);
});
test('GO precedes identity and authorization; precise data is withheld until both pass',()=>{
  let state=recommendation();
  assert.equal(state.providerVerified,false);
  assert.equal(state.sensitiveDataReleased,false);
  state=advance(state);
  assert.equal(state.stage,'recommendation');
  state=act(state,{type:'GO'});
  assert.equal(state.stage,'verifying-initial');
  assert.equal(state.sensitiveDataReleased,false);
  state=advance(state);
  assert.equal(state.providerVerified,true);
  assert.equal(state.providerAuthorized,false);
  assert.equal(state.sensitiveDataReleased,false);
  state=advance(state);
  assert.equal(state.providerAuthorized,true);
  assert.equal(state.sensitiveDataReleased,true);
});
test('cancellation revokes original access and independently verifies replacement',()=>{
  let state=until(act(recommendation(),{type:'GO'}),'waiting-initial');
  state=act(state,{type:'CANCEL_PROVIDER'});
  assert.equal(state.providerVerified,false);
  assert.equal(state.providerAuthorized,false);
  assert.equal(state.sensitiveDataReleased,false);
  state=until(state,'verifying-replacement');
  assert.equal(view(state).selectedPlan.planId,rideshare.planId);
  assert.equal(state.providerVerified,false);
  assert.equal(state.sensitiveDataReleased,false);
  state=until(state,'waiting-replacement');
  assert.equal(state.providerVerified,true);
  assert.equal(state.providerAuthorized,true);
});
test('recovery never exceeds the approved budget',()=>{
  const profile={...defaultProfile,maxBudget:3};
  let state=until(act(recommendation(profile),{type:'GO'}),'waiting-initial');
  state=act(state,{type:'CANCEL_PROVIDER'});
  state=until(state,'no-options');
  assert.equal(state.sensitiveDataReleased,false);
  assert.equal(view(state).selectedPlan,undefined);
  assert(eligiblePlans(profile,{}).every(plan=>plan.cost<=3));
});
test('initial and replacement arrival retain provider and revoke temporary access',()=>{
  for(const replacement of [false,true]) {
    let state=until(act(recommendation(),{type:'GO'}),'waiting-initial');
    if(replacement) state=until(act(state,{type:'CANCEL_PROVIDER'}),'waiting-replacement');
    state=until(state,'arrival');
    assert.equal(view(state).selectedPlan.planId,replacement?rideshare.planId:campusRide.planId);
    assert.equal(state.providerAuthorized,false);
    assert.equal(state.sensitiveDataReleased,false);
    assert.equal(view(state).trip.state,'ARRIVED');
  }
});
test('offline is a pause and reconnect resumes the same trip',()=>{
  let state=until(act(recommendation(),{type:'GO'}),'waiting-initial');
  const plan=state.selectedPlanId;
  state=act(state,{type:'SIMULATE',scenario:'offline'});
  const paused=advance(state);
  assert.equal(paused.stage,'offline');
  state=act(paused,{type:'RECONNECT'});
  assert.equal(state.stage,'waiting-initial');
  assert.equal(state.selectedPlanId,plan);
});
test('failed verification withholds data and has a retry path',()=>{
  let state=act(recommendation(),{type:'GO'});
  state=act(state,{type:'SIMULATE',scenario:'verification-failed'});
  assert.equal(state.sensitiveDataReleased,false);
  assert.equal(state.providerAuthorized,false);
  assert.equal(view(state).timeline.find(step=>step.id==='identity').state,'failed');
  assert.equal(act(state,{type:'RETRY'}).stage,'verifying-initial');
});
test('invalid stored profiles fail closed instead of crashing startup',()=>{
  for(const invalid of [null,{}, {homeName:4}, {...defaultProfile,maxBudget:-1},{...defaultProfile,maxBudget:NaN},{...defaultProfile,walkingPreference:'never'},{...defaultProfile,avoidTransfers:'yes'}]) {
    assert.doesNotThrow(()=>validatedProfile(invalid));
    assert.equal(validatedProfile(invalid),null);
  }
  assert(validatedProfile(defaultProfile));
  assert(validatedProfile({...defaultProfile,trustedContact:'+1 (540) 555-0100'}));
  assert.equal(validatedProfile({...defaultProfile,trustedContact:'javascript:alert(1)'}),null);
});

test('walking never impersonates a provider or releases pickup data',()=>{
  let state=recommendation({...defaultProfile,maxBudget:0,walkingPreference:'normal'});
  assert.equal(view(state).selectedPlan.mode,'walk');
  state=act(state,{type:'GO'});
  assert.equal(state.stage,'in-trip-initial');
  assert.equal(act(state,{type:'CANCEL_PROVIDER'}),state);
  state=until(state,'arrival');
  assert.equal(state.providerVerified,false);
  assert.equal(state.sensitiveDataReleased,false);
  assert.equal(view(state).timeline.some(step=>step.id==='identity'),false);
});
test('recovery retry never resurrects a cancelled provider',()=>{
  let state=until(act(recommendation({...defaultProfile,maxBudget:3}),{type:'GO'}),'waiting-initial');
  state=until(act(state,{type:'CANCEL_PROVIDER'}),'no-options');
  state=until(act(state,{type:'RETRY'}),'no-options');
  assert(state.failedPlanIds.includes(campusRide.planId));
  assert.equal(state.selectedPlanId,undefined);
});
test('repeated offline events preserve overdue resume and manual pause',()=>{
  let state=until(act(recommendation(),{type:'GO'}),'in-trip-initial');
  state=act(state,{type:'SIMULATE',scenario:'overdue'});
  state=act(state,{type:'TOGGLE_PAUSE'});
  state=act(state,{type:'SIMULATE',scenario:'offline'});
  state=act(state,{type:'SIMULATE',scenario:'offline'});
  state=act(state,{type:'RECONNECT'});
  assert.equal(state.stage,'overdue');
  assert.equal(state.paused,true);
  assert.equal(act(state,{type:'STILL_TRAVELLING'}).stage,'in-trip-initial');
});
test('home cannot complete a trip; active constraints remain approved',()=>{
  let state=createDemoState(defaultProfile);
  for(const action of [{type:'CONFIRM_ARRIVAL'},{type:'STILL_TRAVELLING'},{type:'SIMULATE',scenario:'overdue'}]) assert.equal(act(state,action),state);
  assert.equal(act(state,{type:'SET_CONTEXT',context:{maxBudget:-1}}),state);
  state=act(recommendation(),{type:'GO'});
  assert.equal(act(state,{type:'SET_CONTEXT',context:{maxBudget:90}}),state);
});
test('finish clears pause, interrupted states, and prior trip data',()=>{
  let state=act(recommendation(),{type:'TOGGLE_PAUSE'});
  state=act(state,{type:'FINISH'});
  assert.equal(state.paused,false);
  assert.equal(state.previousStage,undefined);
  assert.equal(state.selectedPlanId,undefined);
  assert.equal(advance(act(state,{type:'START_TRIP'})).stage,'collecting-quotes');
});
test('cancelled route disappears and recoverable states are not failures',()=>{
  const active=until(act(recommendation(),{type:'GO'}),'waiting-initial');
  const cancelled=act(active,{type:'CANCEL_PROVIDER'});
  assert.equal(view(cancelled).isRouteVisible,false);
  assert.equal(view(cancelled).isReplacement,false);
  assert.equal(view(act(active,{type:'SIMULATE',scenario:'offline'})).trip.state,'WAITING_FOR_PICKUP');
  assert.equal(view(act(createDemoState(defaultProfile),{type:'SIMULATE',scenario:'context-fallback'})).trip.state,'EVALUATING');
});
test('judge shortcuts use the same constraints and verification invariants',()=>{
  const state=act(createDemoState(defaultProfile),{type:'JUMP',stage:'waiting-replacement'});
  assert.equal(state.selectedPlanId,rideshare.planId);
  assert.equal(state.providerVerified,true);
  assert.equal(state.userApproved,true);
  assert(state.failedPlanIds.includes(campusRide.planId));
  const constrained=act(createDemoState({...defaultProfile,maxBudget:3}),{type:'JUMP',stage:'waiting-replacement'});
  assert.equal(constrained.stage,'no-options');
});
test('profile actions validate storage data at the state boundary',()=>{
  const home=createDemoState(defaultProfile);
  const bad={...defaultProfile,maxBudget:NaN};
  assert.equal(act(home,{type:'SAVE_PROFILE',profile:bad}),home);
  assert.equal(act(home,{type:'RESTORE_PROFILE',profile:bad}).stage,'setup-home');
});
test('judge controls cannot skip required setup or manufacture a trip without a profile',()=>{
  const state=createDemoState(null);
  for(const stage of ['home','recommendation','waiting-initial','arrival','overdue']) {
    assert.equal(act(state,{type:'JUMP',stage}).stage,'setup-home');
  }
  assert.equal(act(state,{type:'SIMULATE',scenario:'verification-failed'}),state);
});
