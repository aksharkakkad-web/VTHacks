import type { DemoStage, DemoState, PaymentStatus, BookingStatus } from "@/components/safecircle/types";
import type { MobilityReadModel } from "./read-models";
/** Frontend adapter envelope. Mahin maps his authoritative response into this shape.
 * It is not a new shared backend API contract. Consent is intentionally absent.
 */
export type TripResponse = {
  source: "backend" | "sample" | "demo";
  tripId: string;
  revision: number;
  attemptId?: string;
  stage: DemoStage;
  providerVerified: boolean;
  providerAuthorized: boolean;
  sensitiveDataReleased: boolean;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  selectedPlanId?: string;
  offerExpiresAt?: number;
  updatedAt?: string;
  mobility?: MobilityReadModel;
};
export type TripCommand = {
  kind: "discover" | "confirm" | "retry" | "cancel" | "refresh" | "walk-complete" | "arrive" | "board" | "judge";
  tripId: string;
  attemptId?: string;
  planId?: string;
  revision: number;
  constraints?: { maxBudget: number; walkingPreference: "normal" | "minimal"; avoidTransfers: boolean };
  fixture?: import("@/components/safecircle/types").DemoAction;
};
/** Inject a backend adapter here when endpoints exist. No provider/Routes browser calls. */
export interface TripTransport {
  request(command: TripCommand): Promise<unknown>;
  subscribe?(tripId: string, onResponse: (value: unknown) => void): () => void;
}
export type IntegrationState = {
  tripId: string;
  responseRevision: number;
  responseSource?: "backend" | "sample" | "demo";
  mobility?: MobilityReadModel;
};
export type IntegrationDemoState = DemoState & IntegrationState;
