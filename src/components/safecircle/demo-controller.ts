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
  "replanning-discovery",
  "replanning-evaluation",
  "replacement-selected",
  "verifying-replacement",
  "authorizing-replacement",
  "coordinating-replacement",
  "accepted-replacement",
  "waiting-replacement",
];

const automaticDelay: Partial<Record<DemoStage, number>> = {
  discovering: 1800,
  "collecting-quotes": 1900,
  evaluating: 2200,
  "verifying-initial": 2300,
  "authorizing-initial": 1900,
  "coordinating-initial": 2200,
  "accepted-initial": 2400,
  "waiting-initial": 4200,
  "arriving-initial": 3800,
  "in-trip-initial": 4800,
  "provider-cancelled": 2600,
  "replanning-discovery": 2500,
  "replanning-evaluation": 2700,
  "replacement-selected": 2500,
  "verifying-replacement": 2300,
  "authorizing-replacement": 1900,
  "coordinating-replacement": 2200,
  "accepted-replacement": 2500,
  "waiting-replacement": 4200,
  "arriving-replacement": 3800,
  "in-trip-replacement": 4800,
  "context-fallback": 2600,
};

export function createDemoState(profile: SavedProfile | null = null): DemoState {
  return {
    stage: profile ? "home" : "bootstrap",
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
    selectedPlanId: undefined,
    recommendation: undefined,
    providerVerified: false,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    recoveryCount: state.recoveryCount + 1,
  });
}

export function transitionDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "RESTORE_PROFILE":
      return { ...createDemoState(validatedProfile(action.profile)), stage: validatedProfile(action.profile) ? "home" : "setup-home" };
    case "SAVE_PROFILE": {
      const profile = validatedProfile(action.profile);
      return profile ? { ...createDemoState(profile), tripContext: state.tripContext } : state;
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
      return beginTrip(state);
    case "GO":
      return state.stage === "recommendation"
        ? withRevision(state, {
            stage: demoCandidates.find(plan => plan.planId === state.selectedPlanId)?.requiresProviderVerification ? "verifying-initial" : "in-trip-initial",
            userApproved: true,
            providerVerified: false,
            providerAuthorized: false,
            sensitiveDataReleased: false,
          })
        : state;
    case "ADVANCE": {
      if (state.paused || state.stage === "offline") return state;
      const initialNext = nextIn(initialSequence, state.stage);
      if (initialNext === "recommendation") {
        const selected = selectedFor(state);
        return selected
          ? withRevision(state, { stage: "recommendation", selectedPlanId: selected.planId, recommendation: recommendationFor(selected) })
          : withRevision(state, { stage: "no-options" });
      }
      if (initialNext) return withRevision(state, { stage: initialNext });

      const confirmationNext = nextIn(confirmationSequence, state.stage);
      if (confirmationNext) {
        return withRevision(state, {
          stage: confirmationNext,
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
        });
      }

      const recoveryNext = nextIn(recoverySequence, state.stage);
      if (recoveryNext) {
        if (state.stage === "replacement-selected" && !demoCandidates.find(plan => plan.planId === state.selectedPlanId)?.requiresProviderVerification) {
          return withRevision(state, { stage: "in-trip-replacement" });
        }
        return withRevision(state, {
          stage: recoveryNext,
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
        "coordinating-replacement",
        "accepted-replacement",
        "waiting-replacement",
        "arriving-replacement",
      ]).has(state.stage)
        ? beginRecovery(state)
        : state;
    case "SIMULATE": {
      if (action.scenario === "offline") {
        if (state.stage === "offline") return state;
        return withRevision(state, { stage: "offline", previousStage: state.stage, paused: true, offlineResume: { stage: state.stage, previousStage: state.previousStage, paused: state.paused } });
      }
      if (!state.profile) return state;
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
      if (state.stage === "verification-failed") {
        return withRevision(state, {
          stage: state.recoveryCount > 0 ? "verifying-replacement" : "verifying-initial",
        });
      }
      if (state.stage === "no-options") return state.recoveryCount > 0
        ? withRevision(state, { stage: "replanning-discovery" }) : beginTrip(state);
      return state;
    case "RECONNECT":
      return state.stage === "offline"
        ? withRevision(state, {
            stage: state.offlineResume?.stage ?? state.previousStage ?? "home",
            previousStage: state.offlineResume?.previousStage,
            paused: state.offlineResume?.paused ?? false,
            offlineResume: undefined,
          })
        : state;
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
      return createDemoState(state.profile);
    case "TOGGLE_PAUSE":
      return withRevision(state, { paused: !state.paused });
    case "JUMP":
      return snapshotForStage(state, action.stage, action.now);
  }
}

function snapshotForStage(state: DemoState, stage: DemoStage, now?: number): DemoState {
  // Judge shortcuts replay the same transitions instead of inventing trust flags.
  let cursor = { ...createDemoState(state.profile), tripContext: state.tripContext };
  if (!state.profile && !["bootstrap", "setup-home", "setup-preferences"].includes(stage)) return { ...cursor, stage: "setup-home" };
  if (["home", "setup-home", "setup-preferences", "bootstrap"].includes(stage)) return { ...cursor, stage };
  if (stage === "offline") return transitionDemo(state, { type: "SIMULATE", scenario: "offline" });
  const recovering = stage.includes("replacement") || stage.startsWith("replanning") || stage === "provider-cancelled" || (stage === "arrival" && state.recoveryCount > 0);
  cursor = beginTrip(cursor);
  for (let step = 0; step < 40; step++) {
    if (cursor.stage === stage) return cursor;
    if (stage === "context-fallback") return transitionDemo(cursor, { type: "SIMULATE", scenario: "context-fallback" });
    if (stage === "no-options") return transitionDemo(cursor, { type: "SIMULATE", scenario: "no-options" });
    if (stage === "verification-failed" && cursor.stage === "verifying-initial") return transitionDemo(cursor, { type: "SIMULATE", scenario: "verification-failed" });
    if (stage === "overdue" && cursor.stage.startsWith("in-trip")) return transitionDemo(cursor, { type: "SIMULATE", scenario: "overdue" });
    const next = cursor.stage === "recommendation"
      ? transitionDemo(cursor, { type: "GO" })
      : recovering && cursor.stage === "waiting-initial"
        ? transitionDemo(cursor, { type: "CANCEL_PROVIDER" })
        : transitionDemo(cursor, { type: "ADVANCE", now });
    if (next === cursor) return cursor;
    cursor = next;
  }
  return cursor;
}

export function getAutomaticAdvanceDelay(stage: DemoStage) {
  return automaticDelay[stage] ?? null;
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
  if (stage === "provider-cancelled") return "PROVIDER_FAILED";
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
      detail: "Original budget and preferences remain binding during recovery",
      state: state.userApproved ? "done" : effectiveStage === "recommendation" ? "active" : "pending",
    },
    {
      id: "identity",
      title: "ANS identity verified",
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
      detail: "Pickup coordination confirmed",
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
  return selected && !selected.requiresProviderVerification
    ? steps.filter(step => !["identity", "authorization", "release", "accepted"].includes(step.id))
    : steps;
}

export function deriveViewModel(state: DemoState): DemoViewModel {
  const selectedPlan = demoCandidates.find((plan) => plan.planId === state.selectedPlanId);
  const profile = state.profile;
  const interruptedStage = state.stage === "offline" ? state.offlineResume?.stage ?? state.previousStage ?? "home" : state.stage;
  const effectiveStage = interruptedStage === "overdue" ? state.offlineResume?.previousStage ?? state.previousStage ?? "in-trip-initial" : interruptedStage;
  const progressStep = progressFor(effectiveStage);
  const isReplacement = replacementStages.has(state.stage) || (state.stage === "arrival" && state.recoveryCount > 0);
  const isActiveTrip = activeInitial.has(state.stage) || activeReplacement.has(state.stage);

  return {
    stage: state.stage,
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
  const homeName = candidate.homeName.trim();
  const homeAddress = candidate.homeAddress.trim();
  const maxBudget = candidate.maxBudget;
  const contact = candidate.trustedContact?.trim() ?? "";
  if (contact && (!/^\+?[\d()\s.-]+$/.test(contact) || contact.replace(/\D/g, "").length < 7 || contact.replace(/\D/g, "").length > 15)) return null;
  if (homeName.length < 2 || homeName.length > 60 || homeAddress.length < 5 || homeAddress.length > 160) return null;
  if (!Number.isFinite(maxBudget) || maxBudget < 0 || maxBudget > 100) return null;
  return {
    homeName,
    homeAddress,
    maxBudget,
    walkingPreference: candidate.walkingPreference,
    avoidTransfers: candidate.avoidTransfers,
    trustedContact: contact,
  };
}
