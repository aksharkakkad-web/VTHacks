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
