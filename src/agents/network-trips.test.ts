import { test } from "node:test";
import { strict as assert } from "node:assert";
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
  const bookings = new Map<string, ProviderTrip>();
  const controls = { lostResponse: false, cancellationUnknown: false, decline: false, feeMinor: 0, paidFirst: false };
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
      getStatus: async id => structuredClone(bookings.get(id)!),
      getRequestStatus: async id => { if (controls.lostResponse) throw new Error("Offline"); return structuredClone(bookings.get(id)); },
      cancelTrip: async id => {
        const result = bookings.get(id)!; result.status = "cancelled";
        const payment = { ...result.payment!, state: controls.feeMinor ? "captured" as const : "voided" as const, retainedMinor: controls.feeMinor };
        result.payment = payment;
        return controls.cancellationUnknown ? { id, status: "cancelled" } : structuredClone(result);
      },
      cancelRequest: async id => {
        const result = bookings.get(id) ?? { id, status: "cancelled" as const };
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
  return { agent, store, released, controls, evidence, confirm, start, advance: (ms: number) => { now += ms; } };
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
