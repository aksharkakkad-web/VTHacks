import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { createLocalDemo, localDemoAction, localNextLabel } = require('../src/components/safecircle/local-walkthrough.ts');
const act = (state, type, mode='transit') => localDemoAction(state, {type,now:1000}, mode, 1000);
function start(mode) {
  let state=act(createLocalDemo(),'START_TRIP',mode);
  for(let i=0;i<4 && state.stage!=='recommendation';i++)state=act(state,'ADVANCE',mode);
  assert.equal(state.stage,'recommendation');
  return act(state,'GO',mode);
}

test('transit proceeds through boarding, final walk, and arrival without becoming rideshare',()=>{
  let state=start('transit');
  assert.equal(state.selectedPlanId,'transit-017');
  assert.equal(localNextLabel(state),'Bus is here — board');
  state=act(state,'BOARD_TRANSIT');
  assert.equal(state.stage,'in-trip-initial');
  assert.equal(state.integration.mobility.leg.purpose,'transit-stop');
  assert.equal(state.integration.mobility.ride,undefined);
  state=act(state,'ADVANCE');
  assert.equal(state.integration.mobility.leg.kind,'walk');
  assert.equal(state.integration.mobility.leg.purpose,'home');
  state=act(state,'WALK_LEG_COMPLETE');
  assert.equal(state.stage,'arrival');
});

test('rideshare has distinct approaching, here, onboard and drop-off stages',()=>{
  let state=start('rideshare');
  assert.equal(state.selectedPlanId,'independent-ride-023');
  for(let i=0;i<8 && state.stage!=='waiting-initial';i++)state=act(state,'ADVANCE','rideshare');
  assert.equal(state.stage,'waiting-initial');
  state=act(state,'ADVANCE','rideshare');
  assert.equal(state.integration.mobility.ride.stage,'approaching');
  state=act(state,'ADVANCE','rideshare');
  assert.equal(state.integration.mobility.ride.stage,'arrived');
  state=act(state,'ADVANCE','rideshare');
  assert.equal(state.integration.mobility.ride.stage,'riding');
  state=act(state,'ADVANCE','rideshare');
  assert.equal(state.integration.mobility.ride.stage,'completed');
  assert.equal(state.stage,'in-trip-initial');
  assert.equal(act(state,'CONFIRM_ARRIVAL','rideshare').stage,'arrival');
});

test('missed check-in permits late home confirmation and clean restart',()=>{
  let state=act(start('transit'),'BOARD_TRANSIT');
  state=localDemoAction(state,{type:'SIMULATE',scenario:'overdue'},'transit',1000);
  assert.equal(state.stage,'overdue');
  assert.equal(state.previousStage,'in-trip-initial');
  state=act(state,'CONFIRM_ARRIVAL');
  assert.equal(state.stage,'arrival');
  assert.equal(state.sensitiveDataReleased,false);
  assert.equal(act(state,'FINISH').stage,'home');
  assert.equal(createLocalDemo().integration,undefined);
});

test('demo profile remains valid and still-travelling keeps the final walk',()=>{
  const {validatedProfile}=require('../src/components/safecircle/demo-controller.ts');
  assert.ok(validatedProfile(createLocalDemo().profile));
  let state=act(act(start('transit'),'BOARD_TRANSIT'),'ADVANCE');
  const mobility=state.integration.mobility;
  state=localDemoAction(state,{type:'SIMULATE',scenario:'overdue'},'transit',1000);
  state=act(state,'STILL_TRAVELLING');
  assert.equal(state.integration.mobility,mobility);
  assert.equal(state.integration.mobility.leg.purpose,'home');
});
