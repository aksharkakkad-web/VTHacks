import type { TripState } from "@/types/trip";
import {
  campusRide,
  demoCandidates,
  eligiblePlans,
  recommendationFor,
  resolveConstraints,
  rideshare,
} from "./mock-data";
import type {
  DemoAction,
  DemoStage,
  DemoState,
  DemoViewModel,
  SavedProfile,
  TechnicalStep,
} from "./types";

const initialSequence: DemoStage[] = [
  "discovering",
  "collecting-quotes",
  "evaluating",
  "recommendation",
];

const confirmationSequence: DemoStage[] = [
  "verifying-initial",
  "authorizing-initial",
  "coordinating-initial",
  "accepted-initial",
  "waiting-initial",
];

const recoverySequence: DemoStage[] = [
  "provider-cancelled",
  "reconciling",
  "replanning-discovery",
  "replanning-evaluation",
  "replacement-selected",
  "verifying-replacement",
  "authorizing-replacement",
  "coordinating-replacement",
  "accepted-replacement",
  "waiting-replacement",
];

export function createDemoState(profile: SavedProfile | null = null): DemoState {
  return {
    stage: profile ? "home" : "bootstrap",
    paymentStatus: "not-started",
    bookingStatus: "not-started",
    attemptNumber: 0,
    cancellationFee: 0,
    profile,
    tripContext: {},
    candidates: demoCandidates,
    failedPlanIds: [],
    providerVerified: false,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    recoveryCount: 0,
    statusRevision: 0,
    paused: false,
  };
}

function withRevision(state: DemoState, patch: Partial<DemoState>): DemoState {
  return { ...state, ...patch, statusRevision: state.statusRevision + 1 };
}

function nextIn(sequence: DemoStage[], stage: DemoStage) {
  const index = sequence.indexOf(stage);
  return index >= 0 ? sequence[index + 1] : undefined;
}

function selectedFor(state: DemoState, excluded: string[] = state.failedPlanIds) {
  if (!state.profile) return undefined;
  const plans = eligiblePlans(state.profile, state.tripContext, excluded);
  const preference = state.recoveryCount > 0
    ? [rideshare.planId, "transit-017", "walk-008"]
    : [campusRide.planId, rideshare.planId, "transit-017", "walk-008"];
  return preference.map((id) => plans.find((plan) => plan.planId === id)).find(Boolean);
}

function beginTrip(state: DemoState): DemoState {
  if (!state.profile) return state;
  const cleanState = { ...createDemoState(state.profile), tripContext: state.tripContext, fallbackActive: state.fallbackActive, statusRevision: state.statusRevision };
  const selected = selectedFor(cleanState, []);
  if (!selected) return withRevision(cleanState, { stage: "no-options" });
  return withRevision(cleanState, {
    stage: "discovering",
    failedPlanIds: [],
    providerVerified: false,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    recoveryCount: 0,
  });
}

function beginRecovery(state: DemoState): DemoState {
  const failedPlanIds = state.selectedPlanId
    ? [...new Set([...state.failedPlanIds, state.selectedPlanId])]
    : state.failedPlanIds;
  return withRevision(state, {
    stage: "provider-cancelled",
    failedPlanIds,
    userApproved: false,
    bookingStatus: "unknown",
    paymentStatus: "unknown",
    recommendation: undefined,
    providerVerified: false,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    recoveryCount: state.recoveryCount + 1,
  });
}

export function transitionDemo(state: DemoState, action: DemoAction): DemoState {
  // ADVANCE/JUMP build explicitly applied judge fixtures. The app never schedules them.
  switch (action.type) {
    case "BOARD_TRANSIT": {
      const plan = demoCandidates.find(p => p.planId === state.selectedPlanId);
      if (!state.integration?.mobility && plan?.mode === "transit" && state.stage.startsWith("waiting")) return withRevision(state, { stage: state.recoveryCount ? "in-trip-replacement" : "in-trip-initial" });
      const m = state.integration?.mobility;
      if (!m || m.leg.kind !== "wait" || m.leg.purpose !== "transit-stop" || !state.integration || !state.stage.startsWith("waiting")) return state;
      return withRevision(state, { stage: state.recoveryCount ? "in-trip-replacement" : "in-trip-initial", integration: { ...state.integration, mobility: { ...m, leg: { ...m.leg, kind: "ride" }, ride: { providerSource: m.ride?.providerSource ?? "unknown", stage: "unknown" } } } });
    }
    case "WALK_LEG_COMPLETE": {
      const m = state.integration?.mobility;
      if (!m && demoCandidates.find(p => p.planId === state.selectedPlanId)?.mode === "walk") return transitionDemo(state, { type: "CONFIRM_ARRIVAL", now: Date.now() });
      if (!m || m.leg.kind !== "walk" || m.leg.status !== "active" || !state.integration || !/^(waiting|in-trip|arriving)-/.test(state.stage)) return state;
      if (m.leg.purpose === "home") return transitionDemo(state, { type: "CONFIRM_ARRIVAL", now: Date.now() });
      return withRevision(state, { integration: { ...state.integration, mobility: { ...m, leg: { ...m.leg, kind: "wait", status: "active" }, walkingRoute: undefined } } });
    }
    case "RESTORE_STATE": return action.state;
    case "RESET_DEMO_TRIP": return state.stage === "session-error" ? createDemoState(state.profile) : state;
    case "SELECT_PLAN": {
      if (!["recommendation", "replacement-selected"].includes(state.stage) || !state.profile) return state;
      const plan = eligiblePlans(state.profile, state.tripContext, state.failedPlanIds).find(p => p.planId === action.planId);
      return plan ? withRevision(state, { selectedPlanId: plan.planId, recommendation: recommendationFor(plan), userApproved: false, offerExpiresAt: (action.now ?? Date.now()) + 300000 }) : state;
    }
    case "EXPIRE_OFFER":
      return ["recommendation", "replacement-selected"].includes(state.stage) ? withRevision(state, { stage: "offer-changed", userApproved: false }) : state;
    case "REQUEST_CANCEL": {
      if (["offline", "reconnecting", "cancelling", "cancelled", "arrival", "session-error"].includes(state.stage)) return state;
      if ((!state.userApproved && !state.attemptId) || state.bookingStatus === "not-required") return createDemoState(state.profile);
      return withRevision(state, { stage: "cancelling", cancellationRequested: true, providerAuthorized: false, sensitiveDataReleased: false });
    }
    case "RESTORE_PROFILE":
      return { ...createDemoState(validatedProfile(action.profile)), stage: validatedProfile(action.profile) ? "home" : "setup-home" };
    case "SAVE_PROFILE": {
      const profile = validatedProfile(action.profile);
      return profile && ["home", "no-options", "setup-preferences", "setup-home"].includes(state.stage) ? { ...createDemoState(profile), tripContext: state.tripContext } : state;
    }
    case "RESET_PROFILE":
      return { ...createDemoState(null), stage: "setup-home" };
    case "SET_CONTEXT": {
      if (state.stage !== "home") return state;
      const { maxBudget, walkingPreference, note } = action.context;
      if (maxBudget !== undefined && (!Number.isFinite(maxBudget) || maxBudget < 0 || maxBudget > 100)) return state;
      if (walkingPreference !== undefined && !["normal", "minimal"].includes(walkingPreference)) return state;
      if (note !== undefined && !["none", "tired", "drinking"].includes(note)) return state;
      return withRevision(state, { tripContext: {
        ...(maxBudget !== undefined ? { maxBudget } : {}),
        ...(walkingPreference !== undefined ? { walkingPreference } : {}),
        ...(note && note !== "none" ? { note } : {}),
      } });
    }
    case "CLEAR_CONTEXT":
      return state.stage === "home" ? withRevision(state, { tripContext: {} }) : state;
    case "START_TRIP":
      return state.stage === "home" ? beginTrip(state) : state;
    case "GO": {
      if (!["recommendation", "replacement-selected"].includes(state.stage) || !state.selectedPlanId) return state;
      if (state.offerExpiresAt && (action.now ?? Date.now()) >= state.offerExpiresAt) return withRevision(state, { stage: "offer-changed", userApproved: false });
      const plan = demoCandidates.find(p => p.planId === state.selectedPlanId);
      if (!plan) return state;
      const suffix = state.recoveryCount ? "replacement" : "initial";
      const booked = plan.mode === "campus_ride" || plan.mode === "independent_ride";
      return withRevision(state, {
        stage: plan.mode === "walk" ? `in-trip-${suffix}` : plan.mode === "transit" ? `waiting-${suffix}` : `verifying-${suffix}`,
        userApproved: true, providerVerified: false, providerAuthorized: false, sensitiveDataReleased: false,
        paymentStatus: booked ? "not-started" : "not-required", bookingStatus: booked ? "not-started" : "not-required",
        attemptNumber: state.attemptNumber + 1,
        attemptId: booked ? `demo-attempt-${state.attemptNumber + 1}` : undefined,
        cancellationRequested: false, lastTripUpdateAt: action.now ?? Date.now(),
      });
    }
    case "ADVANCE": {
      if (state.paused || state.stage === "offline") return state;
      if (state.stage === "replacement-selected") return state;
      if (state.stage === "cancelling") return withRevision(state, { stage: "cancelled", bookingStatus: state.bookingStatus === "not-required" ? "not-required" : "cancelled", paymentStatus: state.paymentStatus === "not-required" ? "not-required" : "voided", providerAuthorized: false, sensitiveDataReleased: false });
      if (state.stage === "reconnecting") return withRevision(state, { stage: state.offlineResume?.stage ?? "home", previousStage: state.offlineResume?.previousStage, paused: state.offlineResume?.paused ?? false, offlineResume: undefined });
      const selectedMode = demoCandidates.find(p => p.planId === state.selectedPlanId)?.mode;
      if (state.stage.startsWith("waiting") && selectedMode === "transit") return withRevision(state, { stage: state.recoveryCount ? "in-trip-replacement" : "in-trip-initial", lastTripUpdateAt: action.now });
      const initialNext = nextIn(initialSequence, state.stage);
      if (initialNext === "recommendation") {
        const selected = selectedFor(state);
        return selected
          ? withRevision(state, { stage: "recommendation", selectedPlanId: selected.planId, recommendation: recommendationFor(selected), offerExpiresAt: (action.now ?? Date.now()) + 300000 })
          : withRevision(state, { stage: "no-options" });
      }
      if (initialNext) return withRevision(state, { stage: initialNext });

      const confirmationNext = nextIn(confirmationSequence, state.stage);
      if (confirmationNext) {
        return withRevision(state, {
          stage: confirmationNext,
          paymentStatus: confirmationNext.startsWith("authorizing") ? "pending" : "approved",
          bookingStatus: confirmationNext.startsWith("authorizing") ? "not-started" : confirmationNext.startsWith("coordinating") ? "pending" : "accepted",
          ...(confirmationNext === "waiting-initial" ? { lastTripUpdateAt: action.now } : {}),
          providerVerified: state.providerVerified || state.stage === "verifying-initial",
          providerAuthorized: state.providerAuthorized || (state.stage === "authorizing-initial" && state.providerVerified && !!state.userApproved),
          sensitiveDataReleased: state.sensitiveDataReleased || (state.stage === "authorizing-initial" && state.providerVerified && !!state.userApproved),
        });
      }

      if (state.stage === "waiting-initial") return withRevision(state, { stage: "arriving-initial", lastTripUpdateAt: action.now });
      if (state.stage === "arriving-initial") return withRevision(state, { stage: "in-trip-initial", lastTripUpdateAt: action.now });
      if (state.stage === "in-trip-initial") {
        return withRevision(state, {
          stage: "arrival",
          providerAuthorized: false,
          sensitiveDataReleased: false,
          completedAt: action.now,
        });
      }

      if (state.stage === "replanning-evaluation") {
        const replacement = selectedFor(state);
        if (!replacement) return withRevision(state, { stage: "no-options", selectedPlanId: undefined, recommendation: undefined });
        return withRevision(state, {
          stage: "replacement-selected",
          selectedPlanId: replacement.planId,
          recommendation: recommendationFor(replacement),
          userApproved: false,
          offerExpiresAt: (action.now ?? Date.now()) + 300000,
        });
      }

      const recoveryNext = nextIn(recoverySequence, state.stage);
      if (recoveryNext) {
        return withRevision(state, {
          stage: recoveryNext,
          ...(state.stage === "reconciling" ? { bookingStatus: "cancelled" as const, paymentStatus: "voided" as const } : {}),
          ...(state.stage === "verifying-replacement" ? { paymentStatus: "pending" as const, bookingStatus: "not-started" as const } : {}),
          ...(state.stage === "authorizing-replacement" ? { paymentStatus: "approved" as const, bookingStatus: "pending" as const } : {}),
          ...(state.stage === "coordinating-replacement" ? { bookingStatus: "accepted" as const } : {}),
          ...(recoveryNext === "waiting-replacement" ? { lastTripUpdateAt: action.now } : {}),
          providerVerified: state.providerVerified || state.stage === "verifying-replacement",
          providerAuthorized: state.providerAuthorized || (state.stage === "authorizing-replacement" && state.providerVerified && !!state.userApproved),
          sensitiveDataReleased: state.sensitiveDataReleased || (state.stage === "authorizing-replacement" && state.providerVerified && !!state.userApproved),
        });
      }

      if (state.stage === "waiting-replacement") return withRevision(state, { stage: "arriving-replacement", lastTripUpdateAt: action.now });
      if (state.stage === "arriving-replacement") return withRevision(state, { stage: "in-trip-replacement", lastTripUpdateAt: action.now });
      if (state.stage === "in-trip-replacement") {
        return withRevision(state, {
          stage: "arrival",
          providerAuthorized: false,
          sensitiveDataReleased: false,
          completedAt: action.now,
        });
      }
      if (state.stage === "context-fallback") return beginTrip(state);
      return state;
    }
    case "CANCEL_PROVIDER":
      return demoCandidates.find(plan => plan.planId === state.selectedPlanId)?.requiresProviderVerification && new Set<DemoStage>([
        "coordinating-initial",
        "accepted-initial",
        "waiting-initial",
        "arriving-initial",
        "in-trip-initial",
        "coordinating-replacement",
        "accepted-replacement",
        "waiting-replacement",
        "arriving-replacement",
        "in-trip-replacement",
      ]).has(state.stage)
        ? beginRecovery(state)
        : state;
    case "SIMULATE": {
      if (action.scenario === "offline") {
        if (state.stage === "offline") return state;
        return withRevision(state, { stage: "offline", previousStage: state.stage, paused: true, offlineResume: { stage: state.stage, previousStage: state.previousStage, paused: state.paused } });
      }
      if (!state.profile || state.stage === "offline" || state.stage === "reconnecting") return state;
      if (["payment-declined", "payment-unknown", "booking-unknown"].includes(action.scenario)) {
        if (!state.attemptId) return state;
        return withRevision(state, { stage: action.scenario, previousStage: state.stage,
          paymentStatus: action.scenario === "payment-declined" ? "declined" : action.scenario === "payment-unknown" ? "unknown" : state.paymentStatus,
          bookingStatus: action.scenario === "payment-declined" ? "not-started" : "unknown",
          providerAuthorized: false, sensitiveDataReleased: false });
      }
      if (["slow-request", "session-error", "location-error", "offer-changed"].includes(action.scenario)) return withRevision(state, { stage: action.scenario, previousStage: state.stage, ...(action.scenario === "offer-changed" ? { userApproved: false } : {}) });
      if (action.scenario === "context-fallback") {
        return withRevision(beginTrip(state), { stage: "context-fallback", fallbackActive: true });
      }
      if (action.scenario === "overdue") {
        if (!state.stage.startsWith("in-trip")) return state;
        return withRevision(state, { stage: "overdue", previousStage: state.stage });
      }
      if (action.scenario === "verification-failed" && !state.stage.startsWith("verifying")) return state;
      return withRevision(state, {
        stage: action.scenario,
        previousStage: state.stage,
        selectedPlanId: action.scenario === "no-options" ? undefined : state.selectedPlanId,
        recommendation: action.scenario === "no-options" ? undefined : state.recommendation,
        providerVerified: false,
        providerAuthorized: false,
        sensitiveDataReleased: false,
      });
    }
    case "RETRY":
      if (state.stage === "context-fallback") return beginTrip(state);
      // A retry requests reconciliation; only a provider response can resolve an unknown outcome.
      if (["booking-unknown", "payment-unknown"].includes(state.stage)) return state;
      if (state.stage === "session-error") return state.previousStage ? withRevision(state, { stage: state.previousStage }) : state;
      if (state.stage === "location-error") return withRevision(state, { stage: "home" });
      if (state.stage === "slow-request") return withRevision(state, { stage: state.previousStage ?? "discovering" });
      if (state.stage === "offer-changed" || state.stage === "payment-declined") return withRevision(state, { stage: state.recoveryCount ? "replanning-discovery" : "discovering", userApproved: false, providerVerified: false, providerAuthorized: false, sensitiveDataReleased: false });
      if (state.stage === "verification-failed") {
        return withRevision(state, {
          stage: state.recoveryCount > 0 ? "verifying-replacement" : "verifying-initial",
        });
      }
      if (state.stage === "no-options") return state.recoveryCount > 0
        ? withRevision(state, { stage: "replanning-discovery" }) : beginTrip(state);
      return state;
    case "RECONNECT":
      return state.stage === "offline" ? withRevision(state, { stage: "reconnecting", paused: false }) : state;
    case "CONFIRM_ARRIVAL":
      return state.stage === "overdue" || state.stage.startsWith("in-trip") ? withRevision(state, {
        stage: "arrival",
        providerAuthorized: false,
        sensitiveDataReleased: false,
        completedAt: action.now,
      }) : state;
    case "STILL_TRAVELLING":
      return state.stage === "overdue" ? withRevision(state, {
        stage: state.previousStage ?? (state.recoveryCount > 0 ? "in-trip-replacement" : "in-trip-initial"),
        previousStage: undefined,
      }) : state;
    case "FINISH":
      return ["home", "arrival", "cancelled", "no-options", "discovering", "collecting-quotes", "evaluating", "recommendation", "replacement-selected", "replanning-discovery", "replanning-evaluation", "offer-changed", "location-error", "verification-failed", "payment-declined"].includes(state.stage) ? createDemoState(state.profile) : state;
    case "TOGGLE_PAUSE":
      return withRevision(state, { paused: !state.paused });
    case "JUMP":
      return snapshotForStage(state, action.stage, action.now);
  }
}

export function snapshotForStage(state: DemoState, stage: DemoStage, now?: number): DemoState {
  // Judge shortcuts replay the same transitions instead of inventing trust flags.
  let cursor = { ...createDemoState(state.profile), tripContext: state.tripContext };
  if (!state.profile && !["bootstrap", "setup-home", "setup-preferences"].includes(stage)) return { ...cursor, stage: "setup-home" };
  if (["home", "setup-home", "setup-preferences", "bootstrap"].includes(stage)) return { ...cursor, stage };
  if (stage === "offline") return transitionDemo(state, { type: "SIMULATE", scenario: "offline" });
  const recovering = stage.includes("replacement") || stage.startsWith("replanning") || stage === "provider-cancelled" || stage === "reconciling" || (stage === "arrival" && state.recoveryCount > 0);
  cursor = beginTrip(cursor);
  for (let step = 0; step < 40; step++) {
    if (cursor.stage === stage) return cursor;
    if (stage === "context-fallback") return transitionDemo(cursor, { type: "SIMULATE", scenario: "context-fallback" });
    if (stage === "no-options") return transitionDemo(cursor, { type: "SIMULATE", scenario: "no-options" });
    if (stage === "verification-failed" && cursor.stage === "verifying-initial") return transitionDemo(cursor, { type: "SIMULATE", scenario: "verification-failed" });
    if (stage === "overdue" && cursor.stage.startsWith("in-trip")) return transitionDemo(cursor, { type: "SIMULATE", scenario: "overdue" });
    if (["payment-declined", "payment-unknown", "booking-unknown", "cancelling", "cancelled"].includes(stage) && cursor.stage === "coordinating-initial") {
      if (stage === "cancelling" || stage === "cancelled") { const pending = transitionDemo(cursor, { type: "REQUEST_CANCEL" }); return stage === "cancelled" ? transitionDemo(pending, { type: "ADVANCE", now }) : pending; }
      return transitionDemo(cursor, { type: "SIMULATE", scenario: stage as "payment-declined" });
    }
    if (["session-error", "location-error", "slow-request", "offer-changed"].includes(stage)) return transitionDemo(cursor, { type: "SIMULATE", scenario: stage as "session-error" });
    if (stage === "reconnecting") return transitionDemo(transitionDemo(cursor, { type: "SIMULATE", scenario: "offline" }), { type: "RECONNECT" });
    const next = cursor.stage === "recommendation" || cursor.stage === "replacement-selected"
      ? transitionDemo(cursor, { type: "GO", now })
      : recovering && cursor.stage === "waiting-initial"
        ? transitionDemo(cursor, { type: "CANCEL_PROVIDER" })
        : transitionDemo(cursor, { type: "ADVANCE", now });
    if (next === cursor) return cursor;
    cursor = next;
  }
  return cursor;
}

const activeInitial = new Set<DemoStage>(["waiting-initial", "arriving-initial", "in-trip-initial"]);
const activeReplacement = new Set<DemoStage>(["waiting-replacement", "arriving-replacement", "in-trip-replacement"]);
const replacementStages = new Set<DemoStage>([...recoverySequence.slice(3), ...activeReplacement]);

function tripStateFor(stage: DemoStage): TripState {
  if (stage === "home" || stage.startsWith("setup") || stage === "bootstrap") return "IDLE";
  if (stage === "discovering") return "DISCOVERING";
  if (stage === "collecting-quotes") return "COLLECTING_QUOTES";
  if (stage === "evaluating" || stage === "replanning-evaluation") return "EVALUATING";
  if (stage === "recommendation" || stage === "replacement-selected") return "SELECTED";
  if (stage.startsWith("verifying")) return "VERIFYING_PROVIDER";
  if (stage.startsWith("authorizing") || stage.startsWith("coordinating")) return "COORDINATING";
  if (stage.startsWith("accepted") || stage.startsWith("waiting") || stage.startsWith("arriving")) return "WAITING_FOR_PICKUP";
  if (stage.startsWith("in-trip")) return "IN_TRIP";
  if (stage === "provider-cancelled" || stage === "reconciling") return "PROVIDER_FAILED";
  if (stage === "replanning-discovery") return "REPLANNING";
  if (stage === "arrival") return "ARRIVED";
  if (stage === "overdue") return "OVERDUE";
  return "FAILED";
}

function progressFor(stage: DemoStage): DemoViewModel["progressStep"] {
  if (stage.startsWith("waiting") || stage.startsWith("accepted")) return "waiting";
  if (stage.startsWith("arriving")) return "arriving";
  if (stage.startsWith("in-trip")) return "in-trip";
  if (stage === "arrival") return "arrived";
  return "none";
}

function timelineFor(state: DemoState): TechnicalStep[] {
  const selected = demoCandidates.find((plan) => plan.planId === state.selectedPlanId);
  const initialRank = [
    "home",
    "discovering",
    "collecting-quotes",
    "evaluating",
    "recommendation",
    "verifying-initial",
    "authorizing-initial",
    "coordinating-initial",
    "accepted-initial",
    "waiting-initial",
    "arriving-initial",
    "in-trip-initial",
    "arrival",
  ] as DemoStage[];
  const effectiveStage = state.stage === "offline" || state.stage === "overdue" || state.stage === "verification-failed"
    ? state.previousStage ?? state.stage
    : state.stage;
  const rank = initialRank.indexOf(effectiveStage);
  const hasTrip = rank > 0 || state.recoveryCount > 0;
  const recovering = state.recoveryCount > 0;
  const recoveryPastEvaluation = new Set<DemoStage>([
    "replacement-selected",
    "verifying-replacement",
    "authorizing-replacement",
    "coordinating-replacement",
    "accepted-replacement",
    "waiting-replacement",
    "arriving-replacement",
    "in-trip-replacement",
    "arrival",
  ]).has(effectiveStage);

  const steps: TechnicalStep[] = [
    {
      id: "objective",
      title: "Objective received",
      detail: "Saved trip constraints applied",
      state: hasTrip ? "done" : "pending",
    },
    {
      id: "discovery",
      title: "Providers discovered",
      detail: "4 candidate fixtures available",
      state: effectiveStage === "discovering" || effectiveStage === "replanning-discovery"
        ? "active"
        : rank >= 2 || recovering
          ? "done"
          : "pending",
    },
    {
      id: "quotes",
      title: "Coarse quotes collected",
      detail: "Exact pickup and student identity withheld",
      state: effectiveStage === "collecting-quotes"
        ? "active"
        : rank >= 3 || recovering
          ? "done"
          : "pending",
    },
    {
      id: "evaluation",
      title: recovering ? "Replacement plans evaluated" : "Plans evaluated",
      detail: state.fallbackActive ? "Basic local ranking · context unavailable" : "Simulated Databricks evaluation · budget, walking and time",
      state: effectiveStage === "evaluating" || effectiveStage === "replanning-evaluation"
        ? "active"
        : rank >= 4 || recoveryPastEvaluation
          ? "done"
          : "pending",
    },
    {
      id: "selection",
      title: selected ? `${selected.providerName} selected` : "Plan selection",
      detail: state.recommendation?.reasonCodes.join(" · ") ?? "Pending",
      state: effectiveStage === "recommendation" || effectiveStage === "replacement-selected"
        ? "active"
        : rank >= 5 || (recovering && recoveryPastEvaluation)
          ? "done"
          : "pending",
    },
  ];

  if (recovering) {
    steps.splice(3, 0, {
      id: "provider-failure",
      title: "Previous provider unavailable",
      detail: `${state.failedPlanIds.map(id => demoCandidates.find(plan => plan.planId === id)?.providerName).filter(Boolean).join(", ")} · access revoked`,
      state: effectiveStage === "provider-cancelled" ? "active" : "done",
    });
  }

  steps.push(
    {
      id: "approval",
      title: "User approved GO",
      detail: "This exact offer needs its own confirmation",
      state: state.userApproved ? "done" : effectiveStage === "recommendation" ? "active" : "pending",
    },
    {
      id: "identity",
      title: "Demo provider identity checked",
      detail: selected?.providerId ?? "Provider operator pending",
      state: state.stage === "verification-failed"
        ? "failed"
        : effectiveStage.startsWith("verifying")
          ? "active"
          : state.providerVerified
            ? "done"
            : "pending",
    },
    {
      id: "authorization",
      title: "Provider authorized",
      detail: "Policy permits minimum trip data",
      state: effectiveStage.startsWith("authorizing")
        ? "active"
        : state.providerAuthorized || state.sensitiveDataReleased || state.stage === "arrival"
          ? "done"
          : "pending",
    },
    {
      id: "release",
      title: "Precise pickup released",
      detail: "Authorized provider only",
      state: effectiveStage.startsWith("coordinating")
        ? "active"
        : state.sensitiveDataReleased || state.stage === "arrival"
          ? "done"
          : "pending",
    },
    {
      id: "accepted",
      title: "Provider accepted",
      detail: "Simulated booking response; pickup instructions unavailable",
      state: effectiveStage.startsWith("accepted")
        ? "active"
        : activeInitial.has(effectiveStage) || activeReplacement.has(effectiveStage) || state.stage === "arrival"
          ? "done"
          : state.stage === "provider-cancelled"
            ? "failed"
            : "pending",
    },
    {
      id: "progress",
      title: "Trip progress",
      detail: effectiveStage.startsWith("waiting") ? "Waiting for pickup" : effectiveStage.startsWith("arriving") ? "Provider arriving" : effectiveStage.startsWith("in-trip") ? "On the way home" : state.stage === "arrival" ? "Arrived home" : "Awaiting trip start",
      state: activeInitial.has(effectiveStage) || activeReplacement.has(effectiveStage) ? "active" : state.stage === "arrival" ? "done" : "pending",
    },
    {
      id: "arrival",
      title: "Trip completed",
      detail: "Sharing ended and provider access expired",
      state: state.stage === "arrival" ? "done" : "pending",
    },
  );
  return selected && (selected.mode === "walk" || selected.mode === "transit")
    ? steps.filter(step => !["identity", "authorization", "release", "accepted"].includes(step.id))
    : steps;
}

export function deriveViewModel(state: DemoState): DemoViewModel {
  const selectedPlan = demoCandidates.find((plan) => plan.planId === state.selectedPlanId);
  const profile = state.profile;
  const interruptedStage = state.stage === "offline" ? state.offlineResume?.stage ?? state.previousStage ?? "home" : state.stage;
  const effectiveStage = interruptedStage === "overdue" ? state.offlineResume?.previousStage ?? state.previousStage ?? "in-trip-initial" : interruptedStage;
  const progressStep = progressFor(effectiveStage);
  const isReplacement = state.recoveryCount > 0 || replacementStages.has(state.stage) || (state.stage === "arrival" && state.recoveryCount > 0);
  const isActiveTrip = activeInitial.has(state.stage) || activeReplacement.has(state.stage);

  return {
    stage: state.stage,
    paymentStatus: state.paymentStatus, bookingStatus: state.bookingStatus, attemptId: state.attemptId,
    offerExpiresAt: state.offerExpiresAt, cancellationFee: state.cancellationFee, cancellationRequested: state.cancellationRequested,
    profile,
    constraints: profile ? resolveConstraints(profile, state.tripContext) : null,
    trip: {
      id: "trip-demo-2409",
      state: tripStateFor(state.stage === "offline" ? state.previousStage ?? "home" : state.stage === "context-fallback" ? "evaluating" : state.stage),
      candidates: state.candidates,
      recommendation: state.recommendation,
      selectedPlan,
      providerVerified: state.providerVerified,
      sensitiveDataReleased: state.sensitiveDataReleased,
      statusMessage: state.stage.replaceAll("-", " "),
    },
    selectedPlan,
    recommendation: state.recommendation,
    providerVerified: state.providerVerified,
    providerAuthorized: state.providerAuthorized,
    sensitiveDataReleased: state.sensitiveDataReleased,
    isReplacement,
    isActiveTrip,
    isRouteVisible: activeInitial.has(effectiveStage) || activeReplacement.has(effectiveStage),
    isStale: state.stage === "offline" || state.stage === "overdue",
    lastTripUpdateAt: state.lastTripUpdateAt,
    progressStep,
    timeline: timelineFor(state),
    paused: state.paused,
    completedAt: state.completedAt,
  };
}

export function validatedProfile(input: unknown): SavedProfile | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<SavedProfile>;
  if (typeof candidate.homeName !== "string" || typeof candidate.homeAddress !== "string") return null;
  if (typeof candidate.maxBudget !== "number") return null;
  if (candidate.walkingPreference !== "normal" && candidate.walkingPreference !== "minimal") return null;
  if (typeof candidate.avoidTransfers !== "boolean") return null;
  if (candidate.trustedContact !== undefined && typeof candidate.trustedContact !== "string") return null;
  if (candidate.telegramContact !== undefined) {
    if (!candidate.telegramContact || typeof candidate.telegramContact !== "object") return null;
    const telegram = candidate.telegramContact;
    if (typeof telegram.name !== "string" || typeof telegram.chatId !== "string" || typeof telegram.consent !== "boolean" || typeof telegram.shareLocation !== "boolean") return null;
  }
  const homeName = candidate.homeName.trim();
  const homeAddress = candidate.homeAddress.trim();
  const maxBudget = candidate.maxBudget;
  const contact = candidate.trustedContact?.trim() ?? "";
  const telegram = candidate.telegramContact ? {
    name: candidate.telegramContact.name.trim(),
    chatId: candidate.telegramContact.chatId.trim(),
    consent: candidate.telegramContact.consent,
    shareLocation: candidate.telegramContact.shareLocation,
  } : undefined;
  if (contact && (!/^\+?[\d()\s.-]+$/.test(contact) || contact.replace(/\D/g, "").length < 7 || contact.replace(/\D/g, "").length > 15)) return null;
  if (telegram && (telegram.name.length < 2 || telegram.name.length > 80 || !/^[1-9]\d{0,15}$/.test(telegram.chatId) || !Number.isSafeInteger(Number(telegram.chatId)))) return null;
  if (homeName.length < 2 || homeName.length > 60 || homeAddress.length < 5 || homeAddress.length > 160) return null;
  if (!Number.isFinite(maxBudget) || maxBudget < 0 || maxBudget > 100) return null;
  return {
    homeName,
    homeAddress,
    maxBudget,
    walkingPreference: candidate.walkingPreference,
    avoidTransfers: candidate.avoidTransfers,
    trustedContact: contact,
    ...(telegram ? { telegramContact: telegram } : {}),
  };
}
