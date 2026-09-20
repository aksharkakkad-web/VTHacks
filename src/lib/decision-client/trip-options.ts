import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CandidatePlan } from "../../types/provider";
import type { PlanSignals } from "./decision";
import { getRouteEvidence, type RouteEvidence } from "./route-evidence";
import type { TransitRequest } from "./transit";

export const publicCorridors = ["newman-pritchard", "eggleston-pritchard"] as const;
export type PublicCorridor = typeof publicCorridors[number];
type Point = { lat: number; lng: number };
export type WalkingAlternative = { route: RouteEvidence; source: "databricks" | "local_snapshot"; statementId?: string };
export type PublicTripOptions = {
  candidates: CandidatePlan[];
  signals: Record<string, PlanSignals>;
  walkingAlternative?: WalkingAlternative;
  transit: { status: "scheduled" | "unavailable" | "access_unverified"; walkingSource?: "demo_estimate"; accessWalkingMinutes?: number; egressWalkingMinutes?: number; statementId?: string };
  warnings: string[];
};
export type TripOptionEvidence = Omit<PublicTripOptions, "candidates" | "signals">;
export function isPublicCorridor(id: unknown): id is PublicCorridor {
  return typeof id === "string" && (publicCorridors as readonly string[]).includes(id);
}
/** Fixed checked-in public geometry; no address or coordinate goes to a data service. */
export function readPublicRoute(corridorId: string): RouteEvidence | null {
  if (!isPublicCorridor(corridorId)) return null;
  return getRouteEvidence(corridorId, JSON.parse(readFileSync(join(process.cwd(), "data/campus/route-evidence.json"), "utf8")));
}
export function publicCorridorEndpoints(id: PublicCorridor) {
  const route = readPublicRoute(id);
  if (!route?.geometry) throw new Error("Public route unavailable");
  const point = ([lng, lat]: [number, number]) => ({ lat, lng });
  return { origin: point(route.geometry.coordinates[0]), home: point(route.geometry.coordinates.at(-1)!) };
}
export function matchesPublicCorridor(id: PublicCorridor, origin: Point, home: Point) {
  const endpoints = publicCorridorEndpoints(id);
  const distance = (a: Point, b: Point) => {
    const rad = Math.PI / 180;
    const h = Math.sin((a.lat - b.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((a.lng - b.lng) * rad / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  // Includes the documented 42 m Newman map offset; not an arbitrary-address router.
  return distance(origin, endpoints.origin) <= 50 && distance(home, endpoints.home) <= 50;
}

type Readers = {
  walking: (id: string, at: string) => Promise<({ candidate: CandidatePlan; signals: PlanSignals } & WalkingAlternative) | null>;
  transit: (request: TransitRequest) => Promise<{ candidate: CandidatePlan; signals: PlanSignals; statementId?: string } | null>;
};
/** The timetable is real; door-to-stop walks are demo estimates until verified paths exist. */
export async function collectPublicTripOptions(id: PublicCorridor, demo: boolean, at: string, readers: Readers): Promise<PublicTripOptions> {
  const result: PublicTripOptions = { candidates: [], signals: {}, transit: { status: demo ? "unavailable" : "access_unverified" }, warnings: [] };
  const request: TransitRequest = { corridorId: id, evaluatedAt: at, accessWalkingMinutes: 3, egressWalkingMinutes: 3 };
  const [walk, bus] = await Promise.allSettled([readers.walking(id, at), demo ? readers.transit(request) : Promise.resolve(null)]);
  if (walk.status === "fulfilled" && walk.value) {
    const option = walk.value;
    result.candidates.push(option.candidate); result.signals[option.candidate.planId] = option.signals;
    result.walkingAlternative = { route: option.route, source: option.source, ...(option.statementId ? { statementId: option.statementId } : {}) };
    if (option.source === "local_snapshot") result.warnings.push("Walking geometry comes from a dated checked-in public snapshot; a matching managed Databricks route was unavailable.");
  } else result.warnings.push("Mapped walking is unavailable for this request; no replacement path was invented.");
  if (bus.status === "fulfilled" && bus.value) {
    const option = bus.value;
    result.candidates.push({ ...option.candidate, providerName: `${option.candidate.providerName}; demo stop walks` });
    result.signals[option.candidate.planId] = option.signals;
    result.transit = { status: "scheduled", walkingSource: "demo_estimate", accessWalkingMinutes: 3, egressWalkingMinutes: 3, ...(option.statementId ? { statementId: option.statementId } : {}) };
    result.warnings.push("Bus departures use an actual timetable, not live vehicle tracking. The 3-minute walk to the stop and 3-minute walk from the stop are explicit demo estimates, not verified access paths.");
  } else result.warnings.push(demo ? "No catchable managed timetable departure is available; simulated provider offers remain labeled separately." : "Scheduled bus omitted: walking paths to and from its stops have not been verified for this trip.");
  return result;
}
