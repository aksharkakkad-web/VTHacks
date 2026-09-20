import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJsonStore } from '../lib/planner/store';
import { PlannerQueue, emptyPlannerState } from '../lib/planner/queue';

function setup(){let now=1000000;const store=new MemoryJsonStore(emptyPlannerState());return {q:new PlannerQueue(store,()=>now),advance:(ms:number)=>{now+=ms;}};}
test('pairing is one-time and owner-bound; unpaired visitors cannot enqueue',async()=>{
 const {q}=setup();await assert.rejects(q.enqueue('a','trip','student-intent','s',{}),/PAIRING_REQUIRED/);
 const code=await q.createPairing();await q.pair('a',code);await assert.rejects(q.pair('b',code),/PAIRING_INVALID/);
 const j=await q.enqueue('a','trip','student-intent','s',{});assert.equal(j.role,'student-intent');
});
test('concurrent claims produce one lease and completion is idempotent',async()=>{
 const {q}=setup();await q.pair('a',await q.createPairing());const j=await q.enqueue('a','trip','research-intent','s',{});
 const claims=await Promise.all([q.claim('worker1'),q.claim('worker2')]);assert.equal(claims.filter(Boolean).length,1);
 const c=claims.find(Boolean)!;const result={version:'beacon-planner-result-v1' as const,jobId:j.jobId,leaseId:c.leaseId,attempt:c.attempt,snapshotId:'s',inputHash:j.inputHash,model:'gpt-5.6-sol',outcome:'succeeded' as const,output:{topics:['weather']},errorCode:null};
 await q.complete(result);await q.complete(result);await assert.rejects(q.complete({...result,output:{topics:['crime']}}),/COMPLETION_CONFLICT/);
});
test('expired leases cannot complete and retry is capped',async()=>{
 const {q,advance}=setup();await q.pair('a',await q.createPairing());const j=await q.enqueue('a','trip','research-intent','s',{});const old=(await q.claim('worker'))!;
 advance(31000);const next=(await q.claim('worker'))!;assert.notEqual(next.leaseId,old.leaseId);
 await assert.rejects(q.complete({version:'beacon-planner-result-v1',jobId:j.jobId,leaseId:old.leaseId,attempt:old.attempt,snapshotId:'s',inputHash:j.inputHash,model:'gpt-5.6-sol',outcome:'succeeded',output:{topics:[]},errorCode:null}),/STALE_LEASE/);
 advance(31000);assert.equal(await q.claim('worker'),null);
});
test('canonical input hashes ignore key order and enqueues coalesce',async()=>{
 const {q}=setup();await q.pair('a',await q.createPairing());const a=await q.enqueue('a','trip','research-intent','s',{a:1,b:2});const b=await q.enqueue('a','trip','research-intent','s',{b:2,a:1});assert.equal(a.jobId,b.jobId);
});
test('trip invalidation removes jobs and cannot be reversed by late results',async()=>{
 const {q}=setup();await q.pair('a',await q.createPairing());const j=await q.enqueue('a','trip','research-intent','s',{});const c=(await q.claim('worker'))!;await q.invalidate('trip');
 await assert.rejects(q.complete({version:'beacon-planner-result-v1',jobId:j.jobId,leaseId:c.leaseId,attempt:c.attempt,snapshotId:'s',inputHash:j.inputHash,model:'gpt-5.6-sol',outcome:'succeeded',output:{topics:[]},errorCode:null}),/STALE_LEASE/);
});
test('model output rejects duplicate priorities, topics and fact references',async()=>{
 const duplicateIntent={version:'beacon-planner-result-v1' as const,jobId:'',leaseId:'',attempt:1,snapshotId:'s',inputHash:'',model:'gpt-5.6-sol',outcome:'succeeded' as const,output:{objective:'get_home',priorities:['minimize_cost','minimize_cost'],evidenceRequests:[],clarification:null},errorCode:null};
 for(const output of [duplicateIntent.output,{objective:'get_home',priorities:[],evidenceRequests:[{topic:'weather'},{topic:'weather'}],clarification:null}]){
  const {q}=setup();await q.pair('a',await q.createPairing());const j=await q.enqueue('a','trip','student-intent','s',{});const c=(await q.claim('worker'))!;
  await assert.rejects(q.complete({...duplicateIntent,jobId:j.jobId,leaseId:c.leaseId,inputHash:j.inputHash,output}),/INVALID_OUTPUT/);
 }
});
test('failed completion requires null output and an approved non-secret model id',async()=>{
 for(const change of [{output:{}},{model:'private.example.com/account'}]){
  const {q}=setup();await q.pair('a',await q.createPairing());const j=await q.enqueue('a','trip','research-intent','s',{});const c=(await q.claim('worker'))!;
  await assert.rejects(q.complete({version:'beacon-planner-result-v1',jobId:j.jobId,leaseId:c.leaseId,attempt:c.attempt,snapshotId:'s',inputHash:j.inputHash,model:'gpt-5.6-sol',outcome:'failed',output:null,errorCode:'MODEL_UNAVAILABLE',...change}),/INVALID_OUTPUT/);
 }
});
