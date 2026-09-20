/** Temporary FRONTEND adapter contracts, not signed-off src/types backend contracts.
 * Mahin's response must be normalized/validated here; no provider or Routes secrets.
 */
export type RoutePoint = { lat: number; lng: number };
export type WalkingRouteReadModel = {
  routeId: string;
  status: "loading" | "available" | "unavailable" | "stale";
  source: "google-routes" | "fixture" | "unknown";
  geometry?: { format: "encoded-polyline"; value: string } | { format: "coordinates"; points: RoutePoint[] };
  distanceMeters?: number;
  durationSeconds?: number;
  steps?: Array<{ instruction: string; distanceMeters?: number; durationSeconds?: number }>;
  originLabel?: string;
  destinationLabel?: string;
  updatedAt?: string;
  warning?: string;
};
export type RideStatusReadModel = {
  providerSource: "simulated-rideshare" | "connected-provider" | "unknown";
  stage: "accepted" | "waiting" | "driver-assigned" | "approaching" | "arrived" | "riding" | "completed" | "cancelled" | "unknown";
  pickupEtaSeconds?: number;
  arrivalEtaSeconds?: number;
  pickupLocation?: string;
  meetingInstructions?: string;
  driver?: { firstName?: string; photoUrl?: string };
  vehicle?: { color?: string; make?: string; model?: string; plate?: string };
  bookingReference?: string;
  driverLocationLabel?: string;
  updatedAt?: string;
  stale?: boolean;
};
export type JourneyLegReadModel = {
  id: string;
  instruction?: string;
  kind: "walk" | "wait" | "ride" | "none";
  purpose: "home" | "pickup" | "transit-stop";
  status: "active" | "complete";
};
export type MobilityReadModel = {
  leg: JourneyLegReadModel;
  walkingRoute?: WalkingRouteReadModel;
  ride?: RideStatusReadModel;
};
export function providerSourceLabel(ride?: RideStatusReadModel): string {
  return ride?.providerSource === "simulated-rideshare" ? "Simulated rideshare · Demo data"
    : ride?.providerSource === "connected-provider" ? "Ride provider"
    : "Provider source not confirmed";
}
