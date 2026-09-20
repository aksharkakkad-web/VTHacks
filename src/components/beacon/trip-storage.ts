import { parseMobility } from "../../lib/client/beacon/response-adapter";
import { createDemoState, validatedProfile } from "../safecircle/demo-controller";
import { demoCandidates } from "../safecircle/mock-data";
import type { DemoStage, DemoState, SavedProfile } from "../safecircle/types";

// Only local simulation state. Never treat this as authority for a real provider booking.
// Session storage survives refresh; closing the tab ends this simulated trip.
export const TRIP_STORAGE_KEY = "beacon.demo-trip.v2";
const stages: DemoStage[] = ["home", "discovering", "collecting-quotes", "evaluating", "recommendation", "verifying-initial", "authorizing-initial", "coordinating-initial", "accepted-initial", "waiting-initial", "arriving-initial", "in-trip-initial", "provider-cancelled", "reconciling", "replanning-discovery", "replanning-evaluation", "replacement-selected", "verifying-replacement", "authorizing-replacement", "coordinating-replacement", "accepted-replacement", "waiting-replacement", "arriving-replacement", "in-trip-replacement", "arrival", "no-options", "verification-failed", "offline", "reconnecting", "context-fallback", "overdue", "offer-changed", "payment-declined", "payment-unknown", "booking-unknown", "session-error", "location-error", "slow-request", "cancelling", "cancelled"];
export function validateSnapshot(value: unknown, profile: SavedProfile): DemoState | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as { version?: number; mode?: string; state?: DemoState };
  const s = saved.state;
  if (saved.version !== 2 || saved.mode !== "local-simulation" || !s || !stages.includes(s.stage)) return null;
  if (!validatedProfile(s.profile) || JSON.stringify(s.profile) !== JSON.stringify(profile)) return null;
  if (![s.providerVerified, s.providerAuthorized, s.sensitiveDataReleased, s.paused].every(v => typeof v === "boolean")) return null;
  if ([s.userApproved, s.cancellationRequested, s.fallbackActive].some(v => v !== undefined && typeof v !== "boolean")) return null;
  if ([s.offerExpiresAt, s.completedAt, s.lastTripUpdateAt].some(v => v !== undefined && (!Number.isFinite(v) || v < 0 || v > 8.64e15))) return null;
  if (!Number.isFinite(s.cancellationFee) || s.cancellationFee < 0) return null;
  if (s.attemptId !== undefined && (typeof s.attemptId !== "string" || !s.attemptId)) return null;
  if (s.recommendation) {
    const r = s.recommendation;
    if (!Array.isArray(r.reasonCodes) || r.reasonCodes.some(code => typeof code !== "string")) return null;
    if (typeof r.explanation !== "string" || typeof r.evaluatedAt !== "string") return null;
    if (!demoCandidates.some(plan => plan.planId === r.selectedPlanId)) return null;
  }

  if (!Number.isInteger(s.statusRevision) || !Number.isInteger(s.recoveryCount) || !Number.isInteger(s.attemptNumber) || s.attemptNumber < 0) return null;
  if (!Array.isArray(s.failedPlanIds) || s.failedPlanIds.some(id => !demoCandidates.some(p => p.planId === id))) return null;
  if (s.selectedPlanId && !demoCandidates.some(p => p.planId === s.selectedPlanId)) return null;
  if (!["not-required", "not-started", "pending", "approved", "declined", "unknown", "voided"].includes(s.paymentStatus)) return null;
  if (!["not-required", "not-started", "pending", "accepted", "unknown", "cancelled"].includes(s.bookingStatus)) return null;
  if (s.providerAuthorized && (!s.providerVerified || !s.userApproved)) return null;
  if (s.sensitiveDataReleased && (!s.providerVerified || !s.providerAuthorized || !s.userApproved)) return null;
  if (s.previousStage && !stages.includes(s.previousStage)) return null;
  if (s.offlineResume && (!stages.includes(s.offlineResume.stage) || (s.offlineResume.previousStage && !stages.includes(s.offlineResume.previousStage)))) return null;
  if (!s.tripContext || typeof s.tripContext !== "object") return null;
  const c = s.tripContext;
  if (c.maxBudget !== undefined && (!Number.isFinite(c.maxBudget) || c.maxBudget < 0 || c.maxBudget > 100)) return null;
  if (c.walkingPreference && !["minimal", "normal"].includes(c.walkingPreference)) return null;
  if (c.note && !["none", "tired", "drinking"].includes(c.note)) return null;
  if (s.integration) {
    const i = s.integration;
    if (typeof i.tripId !== "string" || !i.tripId || !Number.isSafeInteger(i.responseRevision) || i.responseRevision < 0 || (i.responseSource !== undefined && !["sample", "backend", "demo"].includes(i.responseSource))) return null;
    if (i.mobility !== undefined) {
      const mobility = parseMobility(i.mobility);
      if (!mobility) return null;
      s.integration = { ...i, mobility };
    }
  }
  return { ...s, candidates: demoCandidates, profile, paused: false };
}
export function readTrip(profile: SavedProfile): { state: DemoState; failed: boolean } {
  try {
    const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
    if (!raw) return { state: createDemoState(profile), failed: false };
    const state = validateSnapshot(JSON.parse(raw), profile);
    if (state) return { state: ["backend", "demo"].includes(state.integration?.responseSource ?? "") && Boolean(state.integration?.tripId) && !["home", "arrival", "cancelled"].includes(state.stage)
      ? { ...state, stage: "reconnecting", offlineResume: { stage: state.stage, paused: false }, integration: { ...state.integration!, mobility: undefined } }
      : state, failed: false };
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") return { state: createDemoState(profile), failed: false };
  }
  return { state: { ...createDemoState(profile), stage: "session-error" }, failed: true };
}
export function saveTrip(state: DemoState): boolean {
  if (!state.profile || ["bootstrap", "setup-home", "setup-preferences", "session-error"].includes(state.stage)) return true;
  try {
    if (state.stage === "home") sessionStorage.removeItem(TRIP_STORAGE_KEY);
    else sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify({ version: 2, mode: "local-simulation", state: state.integration?.responseSource === "backend" ? { ...state, integration: { ...state.integration, mobility: undefined } } : state }));
    return true;
  } catch { return false; }
}
export function clearTrip() { try { sessionStorage.removeItem(TRIP_STORAGE_KEY); } catch { /* Session only. */ } }
