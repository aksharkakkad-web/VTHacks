import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProviderTrip } from './contract';
import { observeProvider } from '../lib/journey/provider-status';
test('ride observations expose only provider-supported details and retain unknowns',()=>{
 const trip=parseProviderTrip({id:'ride',status:'waiting',details:{stage:'approaching',pickupEtaSeconds:60,driver:{displayName:'Demo Driver',phone:'private'},vehicle:{make:'Demo',model:'Example',color:'blue',licensePlate:null},updatedAt:'2026-09-19T20:00:00Z',secret:'discard'}});
 const observation=observeProvider(trip,'provider_poll',Date.parse('2026-09-19T20:00:01Z'),true);
 assert.equal(observation.stage,'approaching');assert.equal(observation.pickupEtaSeconds,60);assert.equal(observation.meetingInstructions,null);assert.equal(JSON.stringify(observation).includes('private'),false);
 assert.equal(observeProvider({status:'waiting'},'provider_poll',Date.now(),true).stage,'unknown');
});
test('stale provider details cannot overwrite newer status or manufacture driver information',()=>{
 const now=Date.now(),fresh=observeProvider({status:'waiting',details:{stage:'arrived',updatedAt:new Date(now).toISOString()}},'provider_event',now,true);
 assert.deepEqual(observeProvider({status:'waiting',details:{stage:'approaching',updatedAt:new Date(now-1000).toISOString()}},'provider_poll',now,true,fresh),fresh);
 assert.equal(fresh.driver,null);assert.equal(fresh.vehicle,null);
 assert.throws(()=>parseProviderTrip({id:'ride',status:'waiting',details:{pickupEtaSeconds:-1}}));
});

test('provider lifecycle wins over contradictory details and cannot regress a completed ride',()=>{
 const now=Date.now();
 const completed=observeProvider({status:'completed',details:{stage:'approaching',pickupEtaSeconds:60}},'provider_poll',now,true);
 assert.equal(completed.stage,'completed');assert.equal(completed.pickupEtaSeconds,null);
 assert.deepEqual(observeProvider({status:'waiting',details:{stage:'assigned'}},'provider_poll',now+1000,true,completed),completed);
});

test('later polls cannot move a ride backwards or discard unchanged driver details',()=>{
 const now=Date.now();
 const assigned=observeProvider({status:'waiting',details:{stage:'assigned',driver:{displayName:'Sandbox Driver'},vehicle:{make:'Toyota',model:'Prius',color:'White',licensePlate:'TEST123'}}},'provider_poll',now,true);
 const approaching=observeProvider({status:'waiting',details:{stage:'approaching',pickupEtaSeconds:60}},'provider_poll',now+1000,true,assigned);
 assert.deepEqual(approaching.driver,assigned.driver);assert.deepEqual(approaching.vehicle,assigned.vehicle);
 assert.deepEqual(observeProvider({status:'waiting',details:{stage:'searching'}},'provider_poll',now+2000,true,approaching),approaching);
 const cancelled=observeProvider({status:'cancelled'},'provider_poll',now+3000,true,approaching);
 assert.equal(cancelled.stage,'cancelled');assert.equal(cancelled.pickupEtaSeconds,null);
});
test('declined is a terminal cancelled display stage with the truthful provider status',()=>{
 const now=Date.now(),assigned=observeProvider({status:'waiting',details:{stage:'assigned'}},'provider_poll',now,true);
 const declined=observeProvider({status:'declined'},'provider_poll',now+1000,true,assigned);
 assert.equal(declined.stage,'cancelled');assert.equal(declined.providerStatus,'declined');
 assert.deepEqual(observeProvider({status:'waiting'},'provider_poll',now+2000,true,declined),declined);
 const completed=observeProvider({status:'completed'},'provider_poll',now,true);
 assert.deepEqual(observeProvider({status:'declined'},'provider_poll',now+1000,true,completed),completed);
});
