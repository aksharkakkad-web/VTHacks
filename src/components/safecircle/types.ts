import type { CandidatePlan } from "@/types/provider";
import type { Recommendation } from "@/types/recommendation";
import type { Trip } from "@/types/trip";

export type WalkingPreference = "normal" | "minimal";

export type SavedProfile = {
  homeName: string;
  homeAddress: string;
  maxBudget: number;
  walkingPreference: WalkingPreference;
  avoidTransfers: boolean;
  trustedContact?: string;
};

export type TripContext = {
  maxBudget?: number;
  walkingPreference?: WalkingPreference;
  note?: "tired" | "drinking" | "none";
};

export type DemoStage =
  | "bootstrap"
  | "setup-home"
  | "setup-preferences"
  | "home"
  | "discovering"
  | "collecting-quotes"
  | "evaluating"
  | "recommendation"
  | "verifying-initial"
  | "authorizing-initial"
  | "coordinating-initial"
  | "accepted-initial"
  | "waiting-initial"
  | "arriving-initial"
  | "in-trip-initial"
  | "provider-cancelled"
  | "replanning-discovery"
  | "replanning-evaluation"
  | "replacement-selected"
  | "verifying-replacement"
  | "authorizing-replacement"
  | "coordinating-replacement"
  | "accepted-replacement"
  | "waiting-replacement"
  | "arriving-replacement"
  | "in-trip-replacement"
  | "arrival"
  | "no-options"
  | "verification-failed"
  | "offline"
  | "context-fallback"
  | "overdue";

export type DemoScenario =
  | "no-options"
  | "verification-failed"
  | "offline"
  | "context-fallback"
  | "overdue";

export type DemoState = {
  stage: DemoStage;
  profile: SavedProfile | null;
  tripContext: TripContext;
  candidates: CandidatePlan[];
  recommendation?: Recommendation;
  selectedPlanId?: string;
  failedPlanIds: string[];
  previousStage?: DemoStage;
  providerVerified: boolean;
  providerAuthorized: boolean;
  sensitiveDataReleased: boolean;
  recoveryCount: number;
  statusRevision: number;
  paused: boolean;
  completedAt?: number;
  userApproved?: boolean;
  fallbackActive?: boolean;
  offlineResume?: { stage: DemoStage; previousStage?: DemoStage; paused: boolean };
};

export type DemoAction =
  | { type: "RESTORE_PROFILE"; profile: SavedProfile | null }
  | { type: "SAVE_PROFILE"; profile: SavedProfile }
  | { type: "RESET_PROFILE" }
  | { type: "SET_CONTEXT"; context: TripContext }
  | { type: "CLEAR_CONTEXT" }
  | { type: "START_TRIP" }
  | { type: "GO" }
  | { type: "ADVANCE"; now?: number }
  | { type: "CANCEL_PROVIDER" }
  | { type: "SIMULATE"; scenario: DemoScenario }
  | { type: "RETRY" }
  | { type: "RECONNECT" }
  | { type: "CONFIRM_ARRIVAL"; now?: number }
  | { type: "STILL_TRAVELLING" }
  | { type: "FINISH" }
  | { type: "TOGGLE_PAUSE" }
  | { type: "JUMP"; stage: DemoStage; now?: number };

export type TechnicalStep = {
  id: string;
  title: string;
  detail: string;
  state: "done" | "active" | "pending" | "failed";
};

export type DemoViewModel = {
  stage: DemoStage;
  profile: SavedProfile | null;
  constraints: {
    maxBudget: number;
    walkingPreference: WalkingPreference;
    avoidTransfers: boolean;
  } | null;
  trip: Trip;
  selectedPlan?: CandidatePlan;
  recommendation?: Recommendation;
  providerVerified: boolean;
  providerAuthorized: boolean;
  sensitiveDataReleased: boolean;
  isReplacement: boolean;
  isActiveTrip: boolean;
  isRouteVisible: boolean;
  isStale: boolean;
  progressStep: "none" | "waiting" | "arriving" | "in-trip" | "arrived";
  timeline: TechnicalStep[];
  paused: boolean;
  completedAt?: number;
};
