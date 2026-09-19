import type { CandidatePlan } from "@/types/provider";
import type { Recommendation } from "@/types/recommendation";
import type { Trip } from "@/types/trip";
import type { DemoScreen, TechnicalStep } from "./types";

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

export const initialRecommendation: Recommendation = {
  selectedPlanId: campusRide.planId,
  runnerUpPlanId: rideshare.planId,
  reasonCodes: ["WITHIN_BUDGET", "LOW_WALKING", "HIGH_RELIABILITY"],
  explanation:
    "Campus Shuttle is within your budget and gets you home with almost no walking.",
  evaluatedAt: "2026-09-19T21:41:18-04:00",
};

export const replacementRecommendation: Recommendation = {
  selectedPlanId: rideshare.planId,
  runnerUpPlanId: transit.planId,
  reasonCodes: ["FASTEST_AVAILABLE", "WITHIN_BUDGET", "LOW_WALKING"],
  explanation:
    "Rideshare is the fastest available replacement and stays within your $10 budget.",
  evaluatedAt: "2026-09-19T21:49:05-04:00",
};

export const demoTrip: Trip = {
  id: "trip-demo-2409",
  state: "IDLE",
  candidates: [campusRide, rideshare, transit, walk],
  recommendation: initialRecommendation,
  selectedPlan: campusRide,
  providerVerified: false,
  sensitiveDataReleased: false,
  expectedArrivalAt: "2026-09-19T22:01:00-04:00",
  lastKnownLocation: {
    lat: 37.2294,
    lng: -80.4139,
    recordedAt: "2026-09-19T21:41:00-04:00",
  },
  statusMessage: "Ready when you are",
};

const progressIndex: Record<DemoScreen, number> = {
  home: 0,
  searching: 2,
  recommendation: 4,
  verifying: 5,
  active: 7,
  cancelled: 7,
  replanning: 4,
  replacement: 7,
  "replacement-active": 7,
  arrival: 9,
};

const baseSteps = [
  ["objective", "Objective received", "Home · under $10 · minimize walking"],
  ["discovery", "Providers discovered", "3 provider agents + walking route"],
  ["quotes", "Coarse quotes collected", "No exact location or student identity shared"],
  ["evaluation", "Databricks evaluated plans", "Cost, wait, walking, reliability, exposure"],
  ["selection", "Best plan selected", "Campus Shuttle · LOW_WALKING · WITHIN_BUDGET"],
  ["identity", "ANS identity verified", "campusride.beacon.dev · operator resolved"],
  ["release", "Precise location released", "Authorized provider only · minimum data"],
  ["accepted", "Trip accepted", "Pickup coordinated · access is temporary"],
  ["expired", "Provider access expired", "Location sharing ended at arrival"],
] as const;

export function getTechnicalSteps(screen: DemoScreen): TechnicalStep[] {
  const current = progressIndex[screen];
  return baseSteps.map(([id, title, detail], index) => {
    let state: TechnicalStep["state"] =
      index < current ? "complete" : index === current ? "active" : "waiting";

    if (screen === "cancelled" && id === "accepted") state = "blocked";
    if ((screen === "replanning" || screen === "replacement") && id === "selection") {
      state = index === current ? "active" : "complete";
    }
    if (
      ["replacement", "replacement-active", "arrival"].includes(screen) &&
      id === "selection"
    ) {
      return {
        id,
        title: "Replacement selected",
        detail: "Rideshare · FASTEST_AVAILABLE · WITHIN_BUDGET",
        state,
      };
    }
    if (
      ["replacement", "replacement-active", "arrival"].includes(screen) &&
      id === "identity"
    ) {
      return {
        id,
        title: "Replacement ANS verified",
        detail: "ride.beacon.dev · operator resolved",
        state,
      };
    }
    return { id, title, detail, state };
  });
}

export const demoScreens: { id: DemoScreen; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "searching", label: "Search" },
  { id: "recommendation", label: "Plan" },
  { id: "verifying", label: "Verify" },
  { id: "active", label: "Active" },
  { id: "cancelled", label: "Cancel" },
  { id: "replanning", label: "Replan" },
  { id: "replacement", label: "New ride" },
  { id: "arrival", label: "Arrival" },
];
