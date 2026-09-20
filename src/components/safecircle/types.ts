import type { IntegrationState } from "../../lib/client/beacon/trip-response";
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
  | "reconciling"
  | "offer-changed"
  | "payment-declined"
  | "payment-unknown"
  | "booking-unknown"
  | "session-error"
  | "location-error"
  | "slow-request"
  | "cancelling"
  | "cancelled"
  | "reconnecting"
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

export type PaymentStatus = "not-required" | "not-started" | "pending" | "approved" | "declined" | "unknown" | "voided";
export type BookingStatus = "not-required" | "not-started" | "pending" | "accepted" | "unknown" | "cancelled";

export type DemoScenario =
  | "offer-changed"
  | "payment-declined"
  | "payment-unknown"
  | "booking-unknown"
  | "session-error"
  | "location-error"
  | "slow-request"
  | "no-options"
  | "verification-failed"
  | "offline"
  | "context-fallback"
  | "overdue";

export type BackendDetails = {
  destinationName?: string;
  expectedArrivalAt?: string;
  pickupInstructions?: string;
  payments?: {state: string; amount: number; retained: number}[];
  quoteId?: string;
  operatorName?: string;
  operatorVerification?: string;
  cancellationFee?: number;
  remainingBudget?: number;
  previousOfferCost?: number;
  previousRetainedFee?: number;
  notificationState?: string;
  simulated?: boolean;
};

export type DemoState = {
  backendDetails?: BackendDetails;
  integration?: IntegrationState;
  stage: DemoStage;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  attemptId?: string;
  attemptNumber: number;
  offerExpiresAt?: number;
  cancellationFee: number;
  cancellationRequested?: boolean;
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
  lastTripUpdateAt?: number;
  userApproved?: boolean;
  fallbackActive?: boolean;
  offlineResume?: { stage: DemoStage; previousStage?: DemoStage; paused: boolean };
};

export type DemoAction =
  | { type: "WALK_LEG_COMPLETE" }
  | { type: "BOARD_TRANSIT" }
  | { type: "RESTORE_PROFILE"; profile: SavedProfile | null }
  | { type: "SAVE_PROFILE"; profile: SavedProfile }
  | { type: "RESET_PROFILE" }
  | { type: "RESET_DEMO_TRIP" }
  | { type: "SET_CONTEXT"; context: TripContext }
  | { type: "CLEAR_CONTEXT" }
  | { type: "RESTORE_STATE"; state: DemoState }
  | { type: "SELECT_PLAN"; planId: string; now?: number }
  | { type: "REQUEST_CANCEL" }
  | { type: "EXPIRE_OFFER" }
  | { type: "START_TRIP" }
  | { type: "GO"; now?: number }
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
  backendDetails?: BackendDetails;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  attemptId?: string;
  offerExpiresAt?: number;
  cancellationFee: number;
  cancellationRequested?: boolean;
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
  lastTripUpdateAt?: number;
  progressStep: "none" | "waiting" | "arriving" | "in-trip" | "arrived";
  timeline: TechnicalStep[];
  paused: boolean;
  completedAt?: number;
};
