import { createDemoState, transitionDemo } from "./demo-controller";
import { defaultProfile, rideshare, transit } from "./mock-data";
import { fallbackMobility, sampleResponse } from "../../lib/client/beacon/sample-responses";
import { applyTripResponse } from "../../lib/client/beacon/response-adapter";
import type { DemoAction, DemoState } from "./types";

export type LocalDemoMode = "transit" | "rideshare";

/** Isolated, in-memory presentation state. Never changes a saved profile or live trip. */
export function createLocalDemo(): DemoState {
  return createDemoState({ ...defaultProfile, homeName: "Pritchard Hall", homeAddress: "630 Washington St", maxBudget: 10, walkingPreference: "normal", avoidTransfers: false, trustedContact: "" });
}

export function localNextLabel(state: DemoState): string | null {
  if (["home", "recommendation", "replacement-selected", "arrival", "overdue", "cancelled"].includes(state.stage)) return null;
  if (state.stage.startsWith("waiting") && state.selectedPlanId === transit.planId) return "Bus is here — board";
  if (state.stage.startsWith("waiting")) return "Ride is approaching";
  if (state.stage.startsWith("arriving")) return state.integration?.mobility?.ride?.stage === "arrived" ? "I’m in the ride" : "Ride is here";
  if (state.stage.startsWith("in-trip")) return state.integration?.mobility?.ride?.stage === "completed" || state.integration?.mobility?.leg.purpose === "home" ? null : state.selectedPlanId === transit.planId ? "Bus reached my stop" : "Ride reached drop-off";
  return "Next step";
}

export function localDemoAction(state: DemoState, action: DemoAction, mode: LocalDemoMode, now = Date.now()): DemoState {
  let next: DemoState;
  const currentMobility = state.integration?.mobility;
  if (action.type === "ADVANCE" && state.stage.startsWith("arriving") && currentMobility?.ride?.stage === "approaching") {
    return { ...state, statusRevision: state.statusRevision + 1, integration: { ...state.integration!, mobility: { ...currentMobility, ride: { ...currentMobility.ride, stage: "arrived" } } } };
  }
  if (action.type === "ADVANCE" && state.stage.startsWith("in-trip")) {
    if (state.selectedPlanId === transit.planId) return { ...state, statusRevision: state.statusRevision + 1, integration: { tripId: "trip-demo-2409", responseRevision: (state.integration?.responseRevision ?? 0) + 1, responseSource: "sample", mobility: { leg: { id: "demo-walk-home", kind: "walk", purpose: "home", status: "active" }, walkingRoute: { routeId: "demo-walk-home", status: "unavailable", source: "fixture", destinationLabel: state.profile?.homeName, warning: "Simulated final walk. No live route or location tracking." } } } };
    if (currentMobility?.ride) return { ...state, statusRevision: state.statusRevision + 1, integration: { ...state.integration!, mobility: { ...currentMobility, ride: { ...currentMobility.ride, stage: "completed" } } } };
  }
  if (action.type === "ADVANCE") next = applyTripResponse(state, sampleResponse(state, { ...action, now }), true);
  else next = transitionDemo(state, action);
  if (next.stage === "recommendation" && state.stage !== "recommendation") next = transitionDemo(next, { type: "SELECT_PLAN", planId: mode === "transit" ? transit.planId : rideshare.planId, now });
  if (next === state || ["overdue", "arrival", "home", "cancelled"].includes(next.stage)) return next;
  if (action.type === "WALK_LEG_COMPLETE" || action.type === "STILL_TRAVELLING") return next;
  const mobility = fallbackMobility(next);
  if (mobility?.ride) mobility.ride = { providerSource: "simulated-rideshare", stage: next.stage.startsWith("in-trip") ? "riding" : next.stage.startsWith("arriving") ? "approaching" : "waiting", pickupLocation: "Demo pickup · Newman Library", meetingInstructions: "Simulation only — no vehicle will arrive.", driver: { firstName: "Demo Driver" }, vehicle: { color: "Blue", make: "Demo", model: "Sedan", plate: "DEMO-01" } };
  return { ...next, integration: { tripId: "trip-demo-2409", responseRevision: (next.integration?.responseRevision ?? 0) + 1, responseSource: "sample", ...(mobility ? { mobility } : {}) } };
}
