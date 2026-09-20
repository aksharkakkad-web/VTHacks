import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { StudentAgent } from './student/service';
import { MemoryTripStore } from '../lib/trip-state/store';
import { LocalDemoDirectory } from '../integrations/ans/directory';
import { demoDescriptors } from './demo-provider';
import type { ProviderTrip } from './contract';

async function fixture(pending = false) {
  let now = Date.parse('2026-09-19T21:00:00Z'), calls = 0, unavailable = false;
  const store = new MemoryTripStore(), provider = demoDescriptors.find(p => p.mode === 'campus_ride')!;
  const cancel = async (id:string):Promise<ProviderTrip> => { calls++; if(unavailable) throw new Error('offline'); return {id,status:'cancelled',payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:100,state:'captured'}}; };
  const agent = new StudentAgent({store,directory:new LocalDemoDirectory([provider],true),demo:true,clock:()=>now,
    provider:()=>({descriptor:provider,quote:async()=>{throw new Error('must not replan');},requestTrip:async()=>{throw new Error('must not book');},getStatus:async()=>{throw new Error('must not poll active booking');},cancelTrip:cancel,cancelRequest:cancel}),
    recommend:async()=>{throw new Error('must not replan');},notify:async()=>{throw new Error('must not notify');}});
  const trip=await agent.create('owner',{});
  await store.update(trip.id, async r=>{
    r.providers=[provider];r.trip.state='WAITING_FOR_PICKUP';r.trip.sensitiveDataReleased=true;
    r.trip.selectedPlan={planId:'plan',providerId:provider.id,providerName:'Demo provider',mode:'campus_ride',available:true,cost:2,waitMinutes:1,travelMinutes:5,walkingMinutes:0,totalMinutes:6,transfers:0,requiresProviderVerification:true};
    if(pending)r.pendingBooking={providerId:provider.id,requestId:'attempt-1'};else r.booking={providerId:provider.id,id:'booking-1',requestId:'attempt-1'};
    r.networkAttempts=[{requestId:'attempt-1',providerId:provider.id,quoteId:'quote',observationId:randomUUID(),amountMinor:200,cancellationFeeMinor:100,requestedAt:new Date(now).toISOString(),payment:{mode:'simulated',currency:'USD',amountMinor:200,retainedMinor:0,state:'authorized'}}];
  });
  return {agent,store,id:trip.id,calls:()=>calls,fail:(v:boolean)=>{unavailable=v;},advance:()=>{now+=10001;}};
}

test('user cancellation is owner scoped, idempotent, settled and never arrival or replacement',async()=>{
  const s=await fixture();
  await assert.rejects(s.agent.act(s.id,'other','cancel'),{code:'TRIP_NOT_FOUND'});
  assert.equal(s.calls(),0);
  await s.agent.act(s.id,'owner','cancel');
  const view=await s.agent.journey(s.id,'owner');
  assert.equal(view.cancellation?.status,'resolved');assert.equal(view.cancellation?.attemptId,'attempt-1');
  assert.equal(view.trip.state,'FAILED');assert.notEqual(view.arrival.status,'ARRIVED');
  assert.equal(view.coordination.remainingBudgetMinor,900);assert.equal(view.coordination.payments[0].retainedMinor,100);
  const r=await s.store.read(s.id);assert.equal(r.private,undefined);assert.equal(r.booking,undefined);assert.equal(r.replanCount,0);
  await s.agent.act(s.id,'owner','cancel');await s.agent.monitor();assert.equal(s.calls(),1);
  for(const action of ['request','arrive','location','replan'] as const)await assert.rejects(s.agent.act(s.id,'owner',action),{code:'TRIP_CANCELLED'});
});

test('uncertain user cancellation persists same attempt and monitor retries without rebooking',async()=>{
  const s=await fixture(true);s.fail(true);
  await s.agent.act(s.id,'owner','cancel');
  let view=await s.agent.journey(s.id,'owner');
  assert.equal(view.cancellation?.status,'pending');assert.equal(view.cancellation?.attemptId,'attempt-1');
  assert.equal(view.trip.sensitiveDataReleased,true);assert.equal(view.coordination.remainingBudgetMinor,800);
  await s.agent.act(s.id,'owner','cancel');assert.equal(s.calls(),1);
  s.fail(false);s.advance();await s.agent.monitor();
  view=await s.agent.journey(s.id,'owner');
  assert.equal(view.cancellation?.status,'resolved');assert.equal(view.cancellation?.attemptId,'attempt-1');
  assert.equal(view.trip.sensitiveDataReleased,false);assert.equal(view.coordination.remainingBudgetMinor,900);assert.equal(s.calls(),2);
});

test('unbooked cancellation resolves locally without inventing provider calls',async()=>{
  const s=await fixture();
  await s.store.update(s.id,async r=>{delete r.booking;delete r.networkAttempts;r.trip.state='SELECTED';});
  await s.agent.act(s.id,'owner','cancel');
  assert.equal((await s.agent.journey(s.id,'owner')).cancellation?.status,'resolved');assert.equal(s.calls(),0);
});
