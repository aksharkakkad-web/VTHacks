import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const build=mkdtempSync(join(tmpdir(),'beacon-storage-'));
for(const folder of ['components/beacon','components/safecircle','lib/client/beacon']) mkdirSync(join(build,folder),{recursive:true});
for(const file of ['beacon/profile-storage','beacon/trip-storage','safecircle/mock-data','safecircle/demo-controller']) {
  const source=readFileSync(new URL(`../src/components/${file}.ts`,import.meta.url),'utf8');
  writeFileSync(join(build,`components/${file}.js`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
for(const file of ['response-adapter','route-geometry']) {
  const source=readFileSync(new URL(`../src/lib/client/beacon/${file}.ts`,import.meta.url),'utf8');
  writeFileSync(join(build,`lib/client/beacon/${file}.js`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
after(()=>rmSync(build,{recursive:true,force:true}));
const storage=require(join(build,'components/beacon/profile-storage.js'));
const {defaultProfile}=require(join(build,'components/safecircle/mock-data.js'));
function memoryStorage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
test('onboarding destination and exact budget survive a new page',()=>{
  global.localStorage=memoryStorage();global.sessionStorage=memoryStorage();storage.clearProfile();
  storage.saveHomeDraft({homeName:'Pritchard Hall',homeAddress:'Virginia Tech, Blacksburg, VA'});
  assert.equal(storage.readHomeDraft().homeName,'Pritchard Hall');
  assert(storage.saveProfile({...defaultProfile,maxBudget:17.5}));
  assert.equal(storage.readProfile().maxBudget,17.5);
  assert.equal(JSON.parse(localStorage.getItem(storage.PROFILE_STORAGE_KEY)).maxBudget,17.5);
  storage.clearProfile();
  assert.equal(storage.readProfile(),null);
  assert.equal(storage.readHomeDraft(),null);
});
test('blocked storage keeps onboarding usable in memory and rejects invalid budgets',()=>{
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  global.localStorage=blocked;global.sessionStorage=blocked;storage.clearProfile();
  storage.saveHomeDraft({homeName:'Home',homeAddress:'Pritchard Hall'});
  assert.equal(storage.readHomeDraft().homeName,'Home');
  assert.equal(storage.saveProfile({...defaultProfile,maxBudget:28}),false);
  assert.equal(storage.readProfile().maxBudget,28);
  assert.equal(storage.saveProfile({...defaultProfile,maxBudget:101}),false);
  assert.equal(storage.readProfile().maxBudget,28);
  storage.clearProfile();assert.equal(storage.readProfile(),null);
});

const trips=require(join(build,'components/beacon/trip-storage.js'));
const {createDemoState,transitionDemo:act}=require(join(build,'components/safecircle/demo-controller.js'));
test('refresh restores the same simulated booking and separate payment state',()=>{
  global.sessionStorage=memoryStorage();
  const state=act(createDemoState(defaultProfile),{type:'JUMP',stage:'coordinating-initial'});
  assert(trips.saveTrip(state));
  const restored=trips.readTrip(defaultProfile);
  assert.equal(restored.failed,false);
  assert.equal(restored.state.stage,state.stage);
  assert.equal(restored.state.attemptId,state.attemptId);
  assert.equal(restored.state.paymentStatus,'approved');
  assert.equal(restored.state.bookingStatus,'pending');
});
test('corrupt or foreign saved trip fails closed rather than silently starting another',()=>{
  for(const raw of ['{broken',JSON.stringify({version:1}),JSON.stringify({version:2,mode:'live',state:{stage:'home'}})]) {
    global.sessionStorage=memoryStorage();sessionStorage.setItem(trips.TRIP_STORAGE_KEY,raw);
    assert.equal(trips.readTrip(defaultProfile).state.stage,'session-error');
  }
  const state=act(createDemoState(defaultProfile),{type:'JUMP',stage:'waiting-initial'});
  trips.saveTrip({...state,providerVerified:false,sensitiveDataReleased:true});
  assert.equal(trips.readTrip(defaultProfile).failed,true);
});
test('finishing the local trip clears its saved snapshot',()=>{
  global.sessionStorage=memoryStorage();
  trips.saveTrip(act(createDemoState(defaultProfile),{type:'JUMP',stage:'arrival'}));
  trips.saveTrip(createDemoState(defaultProfile));
  assert.equal(sessionStorage.getItem(trips.TRIP_STORAGE_KEY),null);
});

test('malformed saved presentation fields fail closed before rendering',()=>{
  const state=act(createDemoState(defaultProfile),{type:'JUMP',stage:'waiting-initial'});
  for(const patch of [
    {userApproved:'yes'}, {cancellationRequested:1}, {offerExpiresAt:'tomorrow'},
    {lastTripUpdateAt:-1}, {cancellationFee:null}, {attemptId:42},
    {recommendation:{...state.recommendation,reasonCodes:null}},
  ]) {
    global.sessionStorage=memoryStorage();
    sessionStorage.setItem(trips.TRIP_STORAGE_KEY,JSON.stringify({version:2,mode:'local-simulation',state:{...state,...patch}}));
    assert.equal(trips.readTrip(defaultProfile).state.stage,'session-error');
  }
});

test('backend status restoration requests fresh authority and does not persist route or driver payload',()=>{
  global.sessionStorage=memoryStorage();
  const state=act(createDemoState(defaultProfile),{type:'JUMP',stage:'waiting-initial'});
  state.integration={tripId:'trip-demo-2409',responseRevision:3,responseSource:'backend',mobility:{leg:{id:'wait',kind:'wait',purpose:'pickup',status:'active'},ride:{providerSource:'simulated-rideshare',stage:'waiting',driver:{firstName:'Test fixture'}}}};
  assert(trips.saveTrip(state));
  assert(!sessionStorage.getItem(trips.TRIP_STORAGE_KEY).includes('Test fixture'));
  const restored=trips.readTrip(defaultProfile);
  assert.equal(restored.failed,false);
  assert.equal(restored.state.stage,'reconnecting');
  assert.equal(restored.state.integration.mobility,undefined);
  assert.equal(restored.state.attemptId,state.attemptId);
});
test('stored mobility is validated before it can reach a map or ride card',()=>{
  global.sessionStorage=memoryStorage();
  const state=act(createDemoState(defaultProfile),{type:'JUMP',stage:'waiting-initial'});
  state.integration={tripId:'trip-demo-2409',responseRevision:2,responseSource:'sample',mobility:{leg:{id:'walk',kind:'walk',purpose:'pickup',status:'active'},walkingRoute:{routeId:'bad',source:'fixture',status:'available',geometry:{format:'coordinates',points:[{lat:900,lng:0},{lat:0,lng:0}]}}}};
  trips.saveTrip(state);
  assert.equal(trips.readTrip(defaultProfile).failed,true);
});
