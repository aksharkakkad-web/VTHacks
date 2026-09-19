/** A normalized, non-sensitive plan returned by a provider agent. */
export type CandidatePlan = {
  planId: string;
  providerId: string | null;
  providerName: string;
  mode: "walk" | "transit" | "campus_ride" | "independent_ride";
  available: boolean;
  cost: number;
  waitMinutes: number;
  travelMinutes: number;
  walkingMinutes: number;
  totalMinutes: number;
  transfers?: number;
  reliability?: number;
  historicalExposure?: number;
  weatherPenalty?: number;
  requiresProviderVerification: boolean;
};
