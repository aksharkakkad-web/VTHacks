import type { CandidatePlan } from "./provider";
import type { Recommendation } from "./recommendation";

export type TripState =
  | "IDLE"
  | "OBJECTIVE_RECEIVED"
  | "DISCOVERING"
  | "COLLECTING_QUOTES"
  | "EVALUATING"
  | "SELECTED"
  | "VERIFYING_PROVIDER"
  | "COORDINATING"
  | "NAVIGATING"
  | "WAITING_FOR_PICKUP"
  | "IN_TRIP"
  | "PROVIDER_FAILED"
  | "REPLANNING"
  | "OVERDUE"
  | "ARRIVED"
  | "FAILED";

export type Trip = {
  id: string;
  state: TripState;
  candidates: CandidatePlan[];
  recommendation?: Recommendation;
  selectedPlan?: CandidatePlan;
  providerVerified?: boolean;
  sensitiveDataReleased?: boolean;
  expectedArrivalAt?: string;
  alertDeadlineAt?: string;
  lastKnownLocation?: {
    lat: number;
    lng: number;
    recordedAt: string;
  };
  alertSent?: boolean;
  statusMessage?: string;
};
