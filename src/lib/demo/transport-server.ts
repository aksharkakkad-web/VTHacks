import { createDemoState, transitionDemo } from "../../components/safecircle/demo-controller";
import { defaultProfile, demoCandidates } from "../../components/safecircle/mock-data";
import type { DemoState } from "../../components/safecircle/types";
import type { TripCommand, TripResponse } from "../client/beacon/trip-response";
import type { MobilityReadModel } from "../client/beacon/read-models";
import { contractRoute } from "../client/beacon/sample-responses";

type Session = { state: DemoState; revision: number; changedAt: number; touchedAt: number; walked: boolean; replies: Map<string, TripResponse> };
const automatic = new Set(["discovering", "collecting-quotes", "evaluating", "verifying-initial", "authorizing-initial", "coordinating-initial", "accepted-initial", "waiting-initial", "arriving-initial", "in-trip-initial", "provider-cancelled", "reconciling", "replanning-discovery", "replanning-evaluation", "verifying-replacement", "authorizing-replacement", "coordinating-replacement", "accepted-replacement", "waiting-replacement", "arriving-replacement", "in-trip-replacement", "cancelling"]);

/** Server-owned deterministic simulator; it never contacts a real provider or charges money.
 * Server time paces fixture events. Polling retrieves them; the browser cannot assert status.
 * Sessions are ephemeral and contain only coarse preferences, never exact location/contact.
 */
export class DemoTransportServer {
  private sessions = new Map<string, Session>();
  request(raw: unknown, now = Date.now()): TripResponse {
    if (!raw || typeof raw !== "object") throw new Error("Invalid command");
    const c = raw as TripCommand;
    if (typeof c.tripId !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(c.tripId) || !Number.isSafeInteger(c.revision) || c.revision < 0) throw new Error("Invalid trip correlation");
    if (!["discover", "confirm", "retry", "cancel", "refresh", "walk-complete", "arrive", "board", "judge"].includes(c.kind)) throw new Error("Invalid operation");
    if (c.attemptId !== undefined && (typeof c.attemptId !== "string" || !/^demo-attempt-\d+$/.test(c.attemptId))) throw new Error("Invalid attempt");
    for (const [key, entry] of this.sessions) if (now - entry.touchedAt > 3_600_000) this.sessions.delete(key);
    let s = this.sessions.get(c.tripId);
    if (!s) {
      if (c.kind !== "discover") throw new Error("Demo session expired; start a new trip");
      const p = c.constraints;
      if (!p || !Number.isFinite(p.maxBudget) || p.maxBudget < 0 || p.maxBudget > 100 || !["normal", "minimal"].includes(p.walkingPreference) || typeof p.avoidTransfers !== "boolean") throw new Error("Invalid coarse preferences");
      if (this.sessions.size >= 1000) throw new Error("Demo capacity reached");
      s = { state: transitionDemo(createDemoState({
        ...defaultProfile,
        maxBudget: p.maxBudget,
        walkingPreference: p.walkingPreference,
        avoidTransfers: p.avoidTransfers,
      }), { type: "START_TRIP" }), revision: 1, changedAt: now, touchedAt: now, walked: false, replies: new Map() };
      this.sessions.set(c.tripId, s);
      return this.response(c.tripId, s);
    }
    s.touchedAt = now;
    const key = JSON.stringify([c.kind, c.revision, c.attemptId, c.planId, c.fixture]);
    if (c.kind !== "refresh" && s.replies.has(key)) return s.replies.get(key)!;
    let next = s.state;
    if (c.kind === "confirm") {
      if (!["recommendation", "replacement-selected"].includes(next.stage) || c.revision !== s.revision || now >= (next.offerExpiresAt ?? 0)) return this.response(c.tripId, s);
      next = transitionDemo(next, { type: "SELECT_PLAN", planId: c.planId ?? "", now });
      if (next.selectedPlanId !== c.planId) throw new Error("Offer not available");
      next = transitionDemo(next, { type: "GO", now });
      if (next.attemptId !== c.attemptId) throw new Error("Attempt mismatch");
    } else if (c.kind === "cancel") {
      if (c.attemptId !== next.attemptId) throw new Error("Attempt mismatch");
      next = transitionDemo(next, { type: "REQUEST_CANCEL" });
    } else if (c.kind === "judge") {
      const a = c.fixture;
      if (!a || !["JUMP", "SIMULATE", "CANCEL_PROVIDER", "ADVANCE"].includes(a.type)) throw new Error("Invalid judge fixture");
      next = transitionDemo(next, a);
    } else if (c.kind === "retry") {
      if (["booking-unknown", "payment-unknown"].includes(next.stage)) next = { ...next, stage: "reconciling" };
      else next = transitionDemo(next, { type: "RETRY" });
    } else if (c.kind === "walk-complete") {
      s.walked = true;
      if (demoCandidates.find(p => p.planId === next.selectedPlanId)?.mode === "walk") next = transitionDemo(next, { type: "CONFIRM_ARRIVAL", now });
      else next = { ...next };
    } else if (c.kind === "arrive") next = transitionDemo(next, { type: "CONFIRM_ARRIVAL", now });
    else if (c.kind === "board") next = transitionDemo(next, { type: "BOARD_TRANSIT" });
    else if (c.kind === "refresh" && automatic.has(next.stage) && now - s.changedAt >= this.delay(next)) {
      const mode = demoCandidates.find(p => p.planId === next.selectedPlanId)?.mode;
      if (mode === "walk" || (mode === "transit" && next.stage.startsWith("waiting"))) return this.response(c.tripId, s);
      if (next.stage.startsWith("verifying")) next = { ...transitionDemo(next, { type: "ADVANCE", now }), paymentStatus: "not-started" };
      else if (next.stage.startsWith("authorizing") && next.paymentStatus === "not-started") next = { ...next, providerAuthorized: true, sensitiveDataReleased: true, paymentStatus: "pending" };
      else if (next.stage === "reconciling" && next.userApproved) next = { ...next, stage: next.recoveryCount ? "accepted-replacement" : "accepted-initial", providerVerified: true, providerAuthorized: true, sensitiveDataReleased: true, paymentStatus: "approved", bookingStatus: "accepted" };
      else next = transitionDemo(next, { type: "ADVANCE", now });
    }
    if (next !== s.state) { s.state = next; s.revision++; s.changedAt = now; }
    const response = this.response(c.tripId, s);
    if (c.kind !== "refresh") s.replies.set(key, response);
    return response;
  }
  private delay(s: DemoState) { return /^(waiting|arriving|in-trip)-/.test(s.stage) ? 6000 : 1500; }
  private response(tripId: string, s: Session): TripResponse {
    const v = s.state;
    const updatedAt = new Date(s.changedAt).toISOString();
    const plan = demoCandidates.find(p => p.planId === v.selectedPlanId);
    let mobility: MobilityReadModel | undefined;
    if (/^(accepted|waiting|arriving|in-trip)-/.test(v.stage) && plan) {
      const walk = plan.mode === "walk";
      mobility = { leg: { id: `${tripId}-${walk ? "walk" : "provider"}`, kind: walk ? "walk" : v.stage.startsWith("in-trip") ? "ride" : "wait", purpose: plan.mode === "walk" ? "home" : plan.mode === "transit" ? "transit-stop" : "pickup", status: "active" } };
      if (walk) mobility.walkingRoute = { ...contractRoute, updatedAt, steps: [{ instruction: "Follow the displayed example from Example start to Example end. This is a route display example, not campus navigation." }] };
      if (plan.mode === "campus_ride" || plan.mode === "independent_ride") mobility.ride = { providerSource: "simulated-rideshare", stage: v.stage.startsWith("in-trip") ? "riding" : v.stage.startsWith("arriving") ? "arrived" : "waiting", pickupLocation: "Downtown Blacksburg demo pickup", meetingInstructions: "Meet at the marked demo pickup point. This is a simulation; no vehicle will arrive.", pickupEtaSeconds: v.stage.startsWith("arriving") ? 0 : plan.waitMinutes * 60, bookingReference: `DEMO-${v.attemptId}`, updatedAt };
    }
    return { source: "demo", tripId, revision: s.revision, attemptId: v.attemptId, stage: v.stage, providerVerified: v.providerVerified, providerAuthorized: v.providerAuthorized, sensitiveDataReleased: v.sensitiveDataReleased, paymentStatus: v.paymentStatus, bookingStatus: v.bookingStatus, selectedPlanId: v.selectedPlanId, offerExpiresAt: v.offerExpiresAt, updatedAt, ...(mobility ? { mobility } : {}) };
  }
}
