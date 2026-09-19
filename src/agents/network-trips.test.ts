import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { ProviderOutcome } from "../lib/decision-client/provider-outcomes";
import { validateProviderOutcome, calculateProviderReliability } from "../lib/decision-client/provider-outcomes";
import { StudentAgent } from "./student/service";
import { MemoryTripStore } from "../lib/trip-state/store";
import { LocalDemoDirectory } from "../integrations/ans/directory";
import { demoDescriptors } from "./demo-provider";
import { normalizeQuote, type ProviderAgent, type ProviderTrip, type TripRequest } from "./contract";
import type { NetworkOffer } from "./provider-manifest";

type View = { coordination: {
  requiredAction: string; remainingBudgetMinor: number;
  selectedOffer?: { quoteId: string; planId: string; totalMinor: number; simulated: boolean };
  payments: { state: string; amountMinor: number; retainedMinor: number }[];
} };

function setup() {
  let now = Date.parse("2026-09-19T20:00:00.000Z");
  let serial = 0;
  const store = new MemoryTripStore();
  const released: TripRequest[] = [];
  const outcomes: ProviderOutcome[] = [];
  const bookings = new Map<string, ProviderTrip>();
  const controls = { lostResponse: false, cancellationUnknown: false, decline: false, feeMinor: 0, paidFirst: false, outcomeOffline: false, cancellationActive: false, requestMissing: false, statusOffline: false };
  const descriptors = demoDescriptors.filter(d => d.mode !== "transit");
  const directory = new LocalDemoDirectory(descriptors, true);
  const agent = new StudentAgent({ store, demo: true, clock: () => now, directory: { discover: () => directory.discover(), verify: async descriptor => ({ ...await directory.verify(descriptor), validUntil: now + 60_000 }) },
    provider: (descriptor): ProviderAgent => ({ descriptor,
      quote: async () => {
        const cost = descriptor.mode === "campus_ride" && !controls.paidFirst ? 0 : 7;
        const quoteId = `quote-${++serial}`;
        const network: NetworkOffer = {
          manifest: { profileVersion: "beacon-mobility-v2", providerId: descriptor.id, serviceId: descriptor.id, operatorName: "Beacon demo operator", operatorAnsId: null,
            endpoint: descriptor.baseUrl, mode: descriptor.mode, capabilities: descriptor.functions,
            serviceArea: { originZones: ["Downtown Blacksburg"], destinationZones: ["VT residential campus"] }, executionMode: "simulated", authorization: "beacon-hmac-v1", payment: "simulated-usd-v1" },
          offer: { profileVersion: "beacon-mobility-v2", quoteId, providerId: descriptor.id, serviceId: descriptor.id, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(), available: true,
            price: { currency: "USD", totalMinor: cost * 100, kind: "fixed", feesIncluded: true }, cancellation: { feeMinor: controls.feeMinor }, pickup: { instructions: "Demo pickup; no real vehicle is dispatched.", accessVerified: false },
            waitMinutes: 5, travelMinutes: 10, walkingMinutes: 1, simulated: true },
        };
        return { ...normalizeQuote({ provider_id: descriptor.id, available: true, cost, simulated: true, pickup_eta_minutes: 5, travel_time_minutes: 10, walking_minutes: 1, expires_at: network.offer.expiresAt }, descriptor, now), planId: `${descriptor.id}:${quoteId}`, network };
      },
      requestTrip: async request => {
        released.push(structuredClone(request));
        const result: ProviderTrip = { id: request.tripId, status: controls.decline ? "declined" : "waiting", payment: { mode: "simulated", currency: "USD", amountMinor: request.network?.offer.price.totalMinor ?? 0, retainedMinor: 0, state: controls.decline ? "voided" : "authorized" } };
        bookings.set(request.tripId, result);
        if (controls.lostResponse) throw new Error("Lost response");
        return structuredClone(result);
      },
      getStatus: async id => { if (controls.statusOffline) throw new Error("Status outage"); return structuredClone(bookings.get(id)!); },
      getRequestStatus: async id => { if (controls.lostResponse) throw new Error("Offline"); return controls.requestMissing ? undefined : structuredClone(bookings.get(id)); },
      cancelTrip: async id => {
        const result = bookings.get(id)!; if (controls.cancellationActive || result.status === "completed") return structuredClone(result); result.status = "cancelled";
        const payment = { ...result.payment!, state: controls.feeMinor ? "captured" as const : "voided" as const, retainedMinor: controls.feeMinor };
        result.payment = payment;
        return controls.cancellationUnknown ? { id, status: "cancelled" } : structuredClone(result);
      },
      cancelRequest: async id => {
        const result = bookings.get(id) ?? { id, status: "cancelled" as const };
        if (controls.cancellationActive) return structuredClone(result);
        result.status = "cancelled";
        result.payment = { mode: "simulated", currency: "USD", amountMinor: result.payment?.amountMinor ?? 0, retainedMinor: 0, state: "voided" };
        bookings.set(id, result); return structuredClone(result);
      },
    }),
    recommend: async (plans, context) => {
      const eligible = plans.filter(p => p.cost <= context.maxBudget);
      const plan = eligible.find(p => p.mode === "campus_ride") ?? eligible.find(p => p.mode === "independent_ride") ?? eligible[0];
      if (!plan) throw new Error("No feasible plan");
      return { selectedPlanId: plan.planId, reasonCodes: ["TEST_POLICY"], explanation: "Fixture choice", evaluatedAt: new Date(now).toISOString() };
    },
    recordOutcome: async outcome => { outcomes.push(structuredClone(outcome)); if (controls.outcomeOffline) throw new Error("Temporary outcome store outage"); },
    notify: async () => { throw new Error("Test must never notify a contact"); },
  });
  const evidence = async (id: string) => await agent.evidence(id, "owner") as unknown as View;
  const confirm = async (id: string) => {
    const t = await agent.read(id, "owner");
    const quoteId = (await evidence(id)).coordination.selectedOffer?.quoteId;
    await agent.act(id, "owner", "confirm", { planId: t.selectedPlan!.planId, ...(quoteId ? { quoteId } : {}) });
    await agent.act(id, "owner", "verify");
    return agent.act(id, "owner", "request");
  };
  const start = async () => {
    const trip = await agent.create("owner", {});
    await agent.act(trip.id, "owner", "discover");
    await agent.act(trip.id, "owner", "evaluate");
    return trip.id;
  };
  return { agent, store, bookings, released, controls, outcomes, evidence, confirm, start, advance: (ms: number) => { now += ms; } };
}

test("network offers stay in an owner-only sidecar and require confirmation of the exact quote", async () => {
  const s = setup(); const id = await s.start();
  const trip = await s.agent.read(id, "owner");
  assert.ok(trip.candidates.every(p => !("network" in p)), "Databricks and the public Trip receive only CandidatePlan fields");
  const view = (await s.evidence(id)).coordination;
  assert.equal(view.selectedOffer?.totalMinor, 0);
  assert.equal(view.selectedOffer?.simulated, true);
  assert.equal(view.requiredAction, "confirm");
  await assert.rejects(s.agent.evidence(id, "someone-else"), { code: "TRIP_NOT_FOUND" });
  await assert.rejects(s.agent.act(id, "owner", "confirm", { planId: trip.selectedPlan!.planId, quoteId: "stale-quote" }), { code: "SELECTION_CHANGED" });
  await assert.rejects(s.agent.act(id, "owner", "confirm"), { code: "SELECTION_CHANGED" });
  assert.equal(s.released.length, 0);
  await s.confirm(id);
  assert.equal(s.released.length, 1);
  assert.equal(s.released[0].network?.offer.quoteId, view.selectedOffer?.quoteId);
  assert.equal((await s.evidence(id)).coordination.payments[0].state, "authorized");
  assert.ok(!JSON.stringify(await s.evidence(id)).includes(s.released[0].network!.consentId));
});

test("network recovery recommends a replacement but never spends a prior confirmation", async () => {
  const s = setup(); const id = await s.start(); await s.confirm(id);
  const replacement = await s.agent.act(id, "owner", "cancel-provider");
  assert.equal(replacement.state, "SELECTED");
  assert.equal(replacement.selectedPlan?.mode, "independent_ride");
  assert.equal(s.released.length, 1);
  assert.equal((await s.evidence(id)).coordination.requiredAction, "confirm");
  await assert.rejects(s.agent.act(id, "owner", "request"), { code: "CONFIRMATION_REQUIRED" });
  await s.confirm(id);
  await Promise.all([s.agent.act(id, "owner", "request"), s.agent.act(id, "owner", "request")]);
  assert.equal(s.released.length, 2);
  const view = (await s.evidence(id)).coordination;
  assert.deepEqual(view.payments.map(p => p.state), ["voided", "authorized"]);
  assert.equal(view.remainingBudgetMinor, 300);
});

test("an uncertain network response is reconciled without another charge or release", async () => {
  const s = setup(); const id = await s.start(); s.controls.lostResponse = true;
  await assert.rejects(s.confirm(id), { code: "BOOKING_UNCERTAIN" });
  assert.equal((await s.evidence(id)).coordination.requiredAction, "check_booking");
  assert.equal((await s.evidence(id)).coordination.payments[0].state, "unknown");
  s.controls.lostResponse = false;
  await s.agent.monitor();
  assert.equal((await s.agent.read(id, "owner")).state, "WAITING_FOR_PICKUP");
  assert.equal((await s.evidence(id)).coordination.payments[0].state, "authorized");
  assert.equal(s.released.length, 1);
});

test("unknown settlement cannot release a network budget or authorize a replacement", async () => {
  const s = setup(); s.controls.paidFirst = true;
  const id = await s.start(); await s.confirm(id); s.controls.cancellationUnknown = true;
  await assert.rejects(s.agent.act(id, "owner", "cancel-provider"), { code: "SETTLEMENT_UNCERTAIN" });
  assert.equal(s.released.length, 1);
  assert.equal((await s.evidence(id)).coordination.remainingBudgetMinor, 300);
  assert.equal((await s.evidence(id)).coordination.payments[0].state, "unknown");
  s.controls.cancellationUnknown = false; await s.agent.monitor();
  assert.equal((await s.agent.read(id, "owner")).state, "SELECTED");
  assert.equal(s.released.length, 1);
});

test("confirmed cancellation fees reduce the budget for new network offers", async () => {
  const s = setup(); s.controls.paidFirst = true; s.controls.feeMinor = 400;
  const id = await s.start(); await s.confirm(id);
  const replacement = await s.agent.act(id, "owner", "cancel-provider");
  assert.equal((await s.evidence(id)).coordination.remainingBudgetMinor, 600);
  assert.equal(replacement.candidates.some(p => p.mode === "independent_ride"), false);
  assert.equal(s.released.length, 1);
});

test("a declined simulated payment returns an explicit user action without monitoring a fictitious ride", async () => {
  const s = setup(); const id = await s.start(); s.controls.decline = true;
  const trip = await s.confirm(id);
  assert.equal(trip.state, "SELECTED");
  assert.equal(trip.alertDeadlineAt, undefined);
  assert.equal((await s.evidence(id)).coordination.requiredAction, "payment_declined");
  assert.equal((await s.evidence(id)).coordination.payments[0].state, "voided");
  assert.equal(s.released.length, 1);
});

test("network recovery remains confirmable after an overdue deadline and keeps location check-in", async () => {
  const s = setup(); const id = await s.start(); await s.confirm(id);
  await s.agent.act(id, "owner", "expire-deadline");
  // Provider cancellation arrives after the deadline, then monitor preserves overdue.
  const stored = await s.store.read(id);
  await s.agent.providerEvent(id, stored.booking!.providerId, stored.booking!.id, "provider.cancelled").catch(() => {});
  // The callback cannot establish a cancellation that the provider did not confirm.
  assert.equal(s.released.length, 1);
  await s.store.update(id, async r => { r.trip.state = "WAITING_FOR_PICKUP"; });
  await s.agent.act(id, "owner", "cancel-provider");
  await s.agent.monitor();
  assert.equal((await s.agent.read(id, "owner")).state, "OVERDUE");
  assert.equal((await s.evidence(id)).coordination.requiredAction, "confirm");
  await s.confirm(id);
  assert.equal(s.released.length, 2);
});

test("network arrival while awaiting replacement confirmation erases location and stops monitoring", async () => {
  const s = setup(); const id = await s.start(); await s.confirm(id);
  await s.agent.act(id, "owner", "cancel-provider");
  const trip = await s.agent.act(id, "owner", "arrive");
  assert.equal(trip.state, "ARRIVED");
  assert.equal((await s.store.read(id)).private, undefined);
  assert.equal(trip.alertDeadlineAt, undefined);
  assert.equal(s.released.length, 1);
});


test("final provider outcomes use the existing sanitized contract and retry the same observation", async () => {
  const s = setup(); const id = await s.start(); await s.confirm(id);
  s.controls.outcomeOffline = true;
  await s.agent.act(id, "owner", "cancel-provider");
  assert.equal(s.outcomes.length, 1);
  const first = validateProviderOutcome(s.outcomes[0]);
  assert.equal(first.source, "simulated");
  assert.equal(first.finalOutcome, "canceled");
  assert.notEqual(first.observationId, id);
  assert.notEqual(first.observationId, s.released[0].tripId);
  assert.ok(!JSON.stringify(first).includes("37.221"));
  s.controls.outcomeOffline = false; s.advance(10_001); await s.agent.monitor();
  assert.equal(s.outcomes.length, 2);
  assert.deepEqual(s.outcomes[1], first);
  await s.agent.monitor(); assert.equal(s.outcomes.length, 2);
  const reliability = calculateProviderReliability(s.outcomes, first.providerId, first.observedAt);
  assert.equal(reliability.sampleSize, 0); assert.equal(reliability.excluded, 1);
});


test("a still-active cancellation cannot fence an uncertain request or finish private cleanup", async () => {
  const s = setup(); const id = await s.start(); s.controls.lostResponse = true;
  await assert.rejects(s.confirm(id), { code: "BOOKING_UNCERTAIN" });
  s.controls.lostResponse = false; s.controls.requestMissing = true; s.controls.cancellationActive = true;
  await s.agent.monitor();
  assert.ok((await s.store.read(id)).pendingBooking);
  assert.equal(s.released.length, 1);
  assert.equal((await s.evidence(id)).coordination.requiredAction, "check_booking");
  const arrived = await s.agent.act(id, "owner", "arrive");
  assert.equal(arrived.state, "ARRIVED");
  assert.equal(arrived.sensitiveDataReleased, true);
  assert.equal((await s.store.read(id)).cleanup?.length, 1);
  s.controls.cancellationActive = false; s.advance(10_001); await s.agent.monitor();
  assert.equal((await s.agent.read(id, "owner")).sensitiveDataReleased, false);
});


test("a reconciled settled cancellation does not depend on a redundant status lookup", async () => {
  const s = setup(); const id = await s.start(); s.controls.lostResponse = true;
  await assert.rejects(s.confirm(id), { code: "BOOKING_UNCERTAIN" });
  const booking = s.bookings.get(s.released[0].tripId)!;
  booking.status = "cancelled"; booking.payment!.state = "voided";
  s.controls.lostResponse = false; s.controls.statusOffline = true;
  await s.agent.monitor();
  assert.equal((await s.agent.read(id, "owner")).state, "SELECTED");
  assert.equal((await s.evidence(id)).coordination.payments[0].state, "voided");
  assert.equal(s.released.length, 1);
});

test("accepted network bookings keep monitoring after their original quote expires", async () => {
  const s = setup(); const id = await s.start(); await s.confirm(id);
  s.advance(120_001);
  assert.equal((await s.agent.read(id, "owner")).state, "WAITING_FOR_PICKUP");
  assert.equal((await s.evidence(id)).coordination.requiredAction, "none");
  await s.agent.act(id, "owner", "request");
  assert.equal(s.released.length, 1);
});

test("every reconciliation checkpoint retains a restartable booking or replacement", async () => {
  const s = setup(); const id = await s.start(); s.controls.lostResponse = true;
  await assert.rejects(s.confirm(id), { code: "BOOKING_UNCERTAIN" });
  const booking = s.bookings.get(s.released[0].tripId)!;
  booking.status = "cancelled"; booking.payment!.state = "voided"; s.controls.lostResponse = false;
  const snapshots: Awaited<ReturnType<typeof s.store.read>>[] = [];
  const checkpoint = s.store.checkpoint.bind(s.store);
  s.store.checkpoint = async record => { snapshots.push(structuredClone(record)); await checkpoint(record); };
  await s.agent.monitor();
  assert.ok(snapshots.length);
  for (const snapshot of snapshots) {
    assert.ok(!(snapshot.trip.state === "FAILED" && snapshot.booking && !snapshot.pendingBooking && !snapshot.pendingReplacement), "crash checkpoint must retain monitor retry intent");
  }
});

test("confirmed but unbooked network offers require refresh after expiry", async () => {
  const s = setup(); const id = await s.start();
  const offer = (await s.evidence(id)).coordination.selectedOffer!;
  await s.agent.act(id, "owner", "confirm", { planId: offer.planId, quoteId: offer.quoteId });
  await s.agent.act(id, "owner", "verify"); s.advance(120_001);
  assert.equal((await s.evidence(id)).coordination.requiredAction, "refresh_quotes");
});

test("completion-only reconciliation cannot invent an acceptance time", async () => {
  const s = setup(); const id = await s.start(); s.controls.lostResponse = true;
  await assert.rejects(s.confirm(id), { code: "BOOKING_UNCERTAIN" });
  const booking = s.bookings.get(s.released[0].tripId)!;
  booking.status = "completed"; booking.payment!.state = "captured"; booking.payment!.retainedMinor = booking.payment!.amountMinor;
  s.controls.lostResponse = false; s.advance(30_000); await s.agent.monitor();
  assert.equal(s.outcomes[0].finalOutcome, "completed");
  assert.equal(s.outcomes[0].acceptedAt, null);
});

test("late network location updates cannot restore private data after arrival", async () => {
  const s = setup(); const id = await s.start(); await s.confirm(id);
  await s.agent.act(id, "owner", "arrive");
  await assert.rejects(s.agent.act(id, "owner", "location", { lat: 37.229, lng: -80.414 }), { code: "INVALID_STATE" });
  assert.equal((await s.agent.read(id, "owner")).lastKnownLocation, undefined);
  assert.equal((await s.store.read(id)).private, undefined);
});

test("started navigation does not request quote refresh when its selection expires", async () => {
  const s = setup(); s.controls.paidFirst = true; s.controls.feeMinor = 400;
  const id = await s.start(); await s.confirm(id);
  await s.agent.act(id, "owner", "cancel-provider");
  assert.equal((await s.agent.read(id, "owner")).selectedPlan!.mode, "walk");
  await s.confirm(id); s.advance(120_001);
  assert.equal((await s.agent.read(id, "owner")).state, "NAVIGATING");
  assert.equal((await s.evidence(id)).coordination.requiredAction, "none");
  await s.agent.act(id, "owner", "expire-deadline");
  assert.equal((await s.evidence(id)).coordination.requiredAction, "none");
});
