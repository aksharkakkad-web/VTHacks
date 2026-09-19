import type { CandidatePlan } from "@/types/provider";
import type { Recommendation } from "@/types/recommendation";
import type { SavedProfile, TripContext } from "./types";

export const campusRide: CandidatePlan = {
  planId: "campus-ride-042",
  providerId: "campusride.beacon.dev",
  providerName: "Campus Shuttle",
  mode: "campus_ride",
  available: true,
  cost: 2,
  waitMinutes: 8,
  travelMinutes: 11,
  walkingMinutes: 1,
  totalMinutes: 20,
  reliability: 0.96,
  transfers: 0,
  historicalExposure: 0.08,
  weatherPenalty: 0,
  requiresProviderVerification: true,
};

export const rideshare: CandidatePlan = {
  planId: "independent-ride-023",
  providerId: "ride.beacon.dev",
  providerName: "Rideshare",
  mode: "independent_ride",
  available: true,
  cost: 8.4,
  waitMinutes: 6,
  travelMinutes: 10,
  walkingMinutes: 1,
  totalMinutes: 17,
  reliability: 0.92,
  transfers: 0,
  historicalExposure: 0.1,
  weatherPenalty: 0,
  requiresProviderVerification: true,
};

export const transit: CandidatePlan = {
  planId: "transit-017",
  providerId: "transit.beacon.dev",
  providerName: "Blacksburg Transit",
  mode: "transit",
  available: true,
  cost: 0,
  waitMinutes: 15,
  travelMinutes: 14,
  walkingMinutes: 5,
  totalMinutes: 34,
  reliability: 0.86,
  transfers: 1,
  requiresProviderVerification: true,
};

export const walk: CandidatePlan = {
  planId: "walk-008",
  providerId: null,
  providerName: "Walk",
  mode: "walk",
  available: true,
  cost: 0,
  waitMinutes: 0,
  travelMinutes: 22,
  walkingMinutes: 22,
  totalMinutes: 22,
  reliability: 1,
  transfers: 0,
  requiresProviderVerification: false,
};

export const demoCandidates: CandidatePlan[] = [campusRide, rideshare, transit, walk];

export const defaultProfile: SavedProfile = {
  homeName: "Home",
  homeAddress: "Pritchard Hall",
  maxBudget: 10,
  walkingPreference: "minimal",
  avoidTransfers: true,
  trustedContact: "",
};

export function resolveConstraints(profile: SavedProfile, context: TripContext) {
  const reducedAttention = context.note === "tired" || context.note === "drinking";
  return {
    maxBudget: context.maxBudget ?? profile.maxBudget,
    walkingPreference: reducedAttention
      ? "minimal" as const
      : context.walkingPreference ?? profile.walkingPreference,
    avoidTransfers: reducedAttention || profile.avoidTransfers,
  };
}

export function eligiblePlans(
  profile: SavedProfile,
  context: TripContext,
  excludedPlanIds: string[] = [],
) {
  const constraints = resolveConstraints(profile, context);
  return demoCandidates.filter((plan) => {
    if (!plan.available || excludedPlanIds.includes(plan.planId)) return false;
    if (plan.cost > constraints.maxBudget) return false;
    if (constraints.walkingPreference === "minimal" && plan.walkingMinutes > 5) return false;
    if (constraints.avoidTransfers && (plan.transfers ?? 0) > 0) return false;
    return true;
  });
}

export function recommendationFor(plan: CandidatePlan): Recommendation {
  const reasonCodes =
    plan.planId === campusRide.planId
      ? ["WITHIN_BUDGET", "LOW_WALKING", "HIGH_RELIABILITY"]
      : plan.planId === rideshare.planId
        ? ["FASTEST_AVAILABLE", "WITHIN_BUDGET", "LOW_WALKING"]
        : ["WITHIN_BUDGET", "AVAILABLE_NOW"];

  return {
    selectedPlanId: plan.planId,
    reasonCodes,
    explanation:
      plan.planId === campusRide.planId
        ? "Campus Shuttle stays within your budget and keeps walking to one minute."
        : plan.planId === rideshare.planId
          ? "Rideshare keeps walking to one minute and stays within your approved budget."
          : `${plan.providerName} is available within your approved trip constraints.`,
    evaluatedAt: "2026-09-19T21:41:18-04:00",
  };
}
