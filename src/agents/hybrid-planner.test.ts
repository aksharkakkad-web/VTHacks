import test from "node:test";
import assert from "node:assert/strict";
import { MemoryJsonStore } from "../lib/planner/store";
import { emptyPlannerState, PlannerQueue } from "../lib/planner/queue";
import { HybridPlanner, type PlanningTripAdapter } from "../lib/planner/orchestrator";

function fixture() {
  let now = Date.parse("2026-09-19T12:00:00Z");
  let snapshot = "objective-1";
  let arrived = false;
  let quoteExpiresAt = now + 60_000;
  let evaluations = 0;
  const bookings = 0;
  const adapter: PlanningTripAdapter = {
    snapshot: async (_tripId, owner) => {
      if (owner !== "owner") throw Object.assign(new Error("Trip not found"), { code: "TRIP_NOT_FOUND" });
      return {
        snapshotId: snapshot,
        terminal: arrived,
        ...(snapshot === "selection-1" ? { selectedPlanId: "plan-1", expiresAt: quoteExpiresAt } : {}),
        input: { objective: "get_home", constraints: { maxBudgetMinor: 1_000 }, preferences: ["minimize_walking"] },
      };
    },
    evaluate: async () => {
      evaluations++;
      snapshot = "selection-1";
      return {
        snapshotId: snapshot,
        selectedPlanId: "plan-1",
        expiresAt: quoteExpiresAt,
        facts: [
          { id: "selected", text: "Campus Ride is the selected plan." },
          { id: "cost", text: "The quoted total is $7.00." },
        ],
      };
    },
  };
  const queue = new PlannerQueue(new MemoryJsonStore(emptyPlannerState()), () => now);
  const planner = new HybridPlanner(queue, adapter, () => now);
  return {
    queue, planner, adapter,
    pair: async () => queue.pair("owner", await queue.createPairing()),
    advance: (ms: number) => { now += ms; },
    arrive: () => { arrived = true; snapshot = "arrived"; },
    expire: () => { quoteExpiresAt = now - 1; },
    counts: () => ({ evaluations, bookings }),
  };
}

async function completeCurrent(q: PlannerQueue, output: unknown, outcome: "succeeded" | "failed" = "succeeded") {
  const claim = await q.claim("worker", ["student-intent", "student-explanation"]);
  assert.ok(claim);
  await q.complete({
    version: "beacon-planner-result-v1", jobId: claim.job.jobId, leaseId: claim.leaseId,
    attempt: claim.attempt, snapshotId: claim.job.snapshotId, inputHash: claim.job.inputHash,
    model: "gpt-5.6-sol", outcome, output: outcome === "failed" ? null : output,
    errorCode: outcome === "failed" ? "MODEL_UNAVAILABLE" : null,
  });
  return claim.job;
}

test("planning coalesces one active run per paired owner and isolates owners", async () => {
  const f = fixture();
  await f.pair();
  const first = await f.planner.start("owner", "trip-1");
  const duplicate = await f.planner.start("owner", "trip-1");
  assert.deepEqual(duplicate, first);
  await assert.rejects(f.planner.start("other", "trip-1"), /Trip not found|PAIRING_REQUIRED/);
});

test("successful intent runs existing evaluation once and queues a snapshot-bound explanation", async () => {
  const f = fixture(); await f.pair(); await f.planner.start("owner", "trip-1");
  await completeCurrent(f.queue, { objective: "get_home", priorities: ["minimize_walking"], evidenceRequests: [{ topic: "weather" }], clarification: null });
  await f.planner.tick();
  const view = await f.planner.view("owner", "trip-1");
  assert.equal(view.phase, "explaining");
  assert.equal(f.counts().evaluations, 1);
  assert.equal(f.counts().bookings, 0, "worker stages have no booking capability");
  const explanation = await f.queue.claim("worker", ["student-explanation"]);
  assert.equal(explanation?.job.role, "student-explanation");
  assert.equal(explanation?.job.snapshotId, "selection-1");
});

test("arrival during inference rejects completion before it can advance a run", async () => {
  const f = fixture(); await f.pair(); await f.planner.start("owner", "trip-1");
  const claim = await f.queue.claim("worker", ["student-intent"]); assert.ok(claim);
  f.arrive();
  await assert.rejects(f.planner.complete({
    version: "beacon-planner-result-v1", jobId: claim.job.jobId, leaseId: claim.leaseId,
    attempt: claim.attempt, snapshotId: claim.job.snapshotId, inputHash: claim.job.inputHash,
    model: "gpt-5.6-sol", outcome: "succeeded",
    output: { objective: "get_home", priorities: [], evidenceRequests: [], clarification: null }, errorCode: null,
  }), /STALE_SNAPSHOT/);
});

test("expired selection rejects late explanation and never exposes the old prose", async () => {
  const f = fixture(); await f.pair(); await f.planner.start("owner", "trip-1");
  await completeCurrent(f.queue, { objective: "get_home", priorities: [], evidenceRequests: [], clarification: null });
  await f.planner.tick();
  const claim = await f.queue.claim("worker", ["student-explanation"]); assert.ok(claim);
  f.expire(); f.advance(1);
  await assert.rejects(f.planner.complete({
    version: "beacon-planner-result-v1", jobId: claim.job.jobId, leaseId: claim.leaseId,
    attempt: claim.attempt, snapshotId: claim.job.snapshotId, inputHash: claim.job.inputHash,
    model: "gpt-5.6-sol", outcome: "succeeded",
    output: { snapshotId: "selection-1", selectedPlanId: "plan-1", sentences: [{ text: "Old unsupported explanation.", factIds: ["cost"] }] }, errorCode: null,
  }), /STALE_SNAPSHOT/);
  assert.equal((await f.planner.view("owner", "trip-1")).explanation, undefined);
});

test("unsupported explanation falls back to controlled exact fact templates", async () => {
  const f = fixture(); await f.pair(); await f.planner.start("owner", "trip-1");
  await completeCurrent(f.queue, { objective: "get_home", priorities: [], evidenceRequests: [], clarification: null });
  await f.planner.tick();
  await completeCurrent(f.queue, { snapshotId: "selection-1", selectedPlanId: "plan-1", sentences: [{ text: "This is definitely the safest ride and costs only $1.", factIds: ["cost"] }] });
  await f.planner.tick();
  const view = await f.planner.view("owner", "trip-1");
  assert.equal(view.phase, "ready");
  assert.equal(view.explanationSource, "template");
  assert.equal(view.explanation, "Campus Ride is the selected plan. The quoted total is $7.00.");
});

test("an unclaimed expired intent releases the active owner run as unavailable", async () => {
  const f=fixture();await f.pair();await f.planner.start("owner","trip-1");
  f.advance(90_001);
  assert.deepEqual(await f.planner.tick(),{advanced:true});
  assert.equal((await f.planner.view("owner","trip-1")).phase,"unavailable");
});

test("polling an expired plan never starts another model job", async () => {
  const f = fixture(); await f.pair(); await f.planner.start("owner", "trip-1");
  await completeCurrent(f.queue, { objective: "get_home", priorities: [], evidenceRequests: [], clarification: null });
  await f.planner.tick();
  const before = await f.queue.readRun("trip-1");
  f.expire();
  for (let i = 0; i < 3; i++) {
    const view = await f.planner.view("owner", "trip-1");
    assert.equal(view.phase, "unavailable");
    assert.equal(view.messageCode, "PLANNER_STALE_SNAPSHOT");
  }
  assert.equal((await f.queue.readRun("trip-1"))?.id, before?.id);
  assert.equal(f.counts().evaluations, 1);
});

test("leased evaluation snapshot changes show progress without stale prose; unrelated changes stay blocked",async()=>{
 const f=fixture();await f.pair();await f.planner.start('owner','trip-1');
 await completeCurrent(f.queue,{objective:'get_home',priorities:[],evidenceRequests:[],clarification:null});
 let release!:()=>void,entered!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const evaluate=f.adapter.evaluate;
 f.adapter.evaluate=async(...args)=>{const selection=await evaluate(...args);entered();await held;return selection;};
 const ticking=f.planner.tick();await started;
 const progress=await f.planner.view('owner','trip-1');
 assert.equal(progress.phase,'gathering');assert.equal(progress.snapshotId,null);assert.equal(progress.explanation,undefined);assert.equal(progress.explanationSource,'none');
 const snapshot=f.adapter.snapshot;
 f.adapter.snapshot=async(...args)=>{const value=await snapshot(...args);return {...value,input:{...value.input,objective:'different'}};};
 assert.equal((await f.planner.view('owner','trip-1')).messageCode,'PLANNER_STALE_SNAPSHOT');
 f.adapter.snapshot=snapshot;
 release();await ticking;
 assert.equal((await f.planner.view('owner','trip-1')).phase,'explaining');
});

test("expired evaluator lease never hides an unbound changed snapshot",async()=>{
 const f=fixture();await f.pair();await f.planner.start('owner','trip-1');
 await completeCurrent(f.queue,{objective:'get_home',priorities:[],evidenceRequests:[],clarification:null});
 let release!:()=>void,entered!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const evaluate=f.adapter.evaluate;
 f.adapter.evaluate=async(...args)=>{const selection=await evaluate(...args);entered();await held;return selection;};
 const ticking=f.planner.tick();await started;f.advance(90001);
 assert.equal((await f.planner.view('owner','trip-1')).phase,'unavailable');
 release();await assert.rejects(ticking,/STALE_SNAPSHOT|STALE_STAGE/);
});
