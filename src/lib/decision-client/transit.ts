import type { CandidatePlan } from "../../types/provider";
import type { PlanSignals } from "./decision";

export type ScheduledDeparture = {
  corridor_id: string; trip_id: string; route_id: string; route_name: string;
  service_date: string; departure_at: string; arrival_at: string;
  travel_minutes: number; from_stop_id: string; to_stop_id: string;
  source_id: string; source_version: string;
};
export type TransitRequest = {
  corridorId: "newman-pritchard" | "eggleston-pritchard";
  evaluatedAt: string;
  /** Supplied by the route/provider track; not inferred from a straight line. */
  accessWalkingMinutes: number;
  egressWalkingMinutes: number;
  maxWaitMinutes?: number;
};

/** Verified direct corridors, not an arbitrary journey planner or live arrival API. */
export function selectScheduledTransit(departures: ScheduledDeparture[], request: TransitRequest): { candidate: CandidatePlan; signals: PlanSignals } | null {
  const now = Date.parse(request.evaluatedAt);
  const maxWait = request.maxWaitMinutes ?? 60;
  const fromStop = { "newman-pritchard":"1100", "eggleston-pritchard":"1143" }[request.corridorId];
  if (!Number.isFinite(now) || !fromStop ||
    ![request.accessWalkingMinutes, request.egressWalkingMinutes, maxWait].every(n => Number.isFinite(n) && n >= 0 && n <= 120)) {
    throw new Error("Invalid supported transit corridor, timestamp, or walking/waiting duration");
  }
  const accessMs = Math.round(request.accessWalkingMinutes * 60000);
  const boardingBufferMs = 60000;
  const valid = departures.filter(row => {
    const dep = Date.parse(row.departure_at), arr = Date.parse(row.arrival_at);
    return row.corridor_id === request.corridorId && row.from_stop_id === fromStop && row.to_stop_id === "1146" &&
      row.source_id === "bt-gtfs" && /^[A-Za-z0-9_-]{1,80}$/.test(row.trip_id) &&
      Number.isFinite(dep) && Number.isFinite(arr) && arr > dep && arr - dep < 120 * 60000 &&
      dep > now + accessMs + boardingBufferMs && dep - now - accessMs <= maxWait * 60000;
  }).sort((a, b) => Date.parse(a.arrival_at) - Date.parse(b.arrival_at) || a.trip_id.localeCompare(b.trip_id));
  const row = valid[0];
  if (!row) return null;
  const dep = Date.parse(row.departure_at), arr = Date.parse(row.arrival_at);
  const waitMinutes = (dep - now - accessMs) / 60000;
  const travelMinutes = (arr - dep) / 60000;
  const walkingMinutes = accessMs / 60000 + request.egressWalkingMinutes;
  return {
    candidate: {
      planId: `bt:${row.service_date}:${row.trip_id}`, providerId: "blacksburg-transit",
      providerName: `Blacksburg Transit ${row.route_id} (scheduled)`, mode: "transit", available: true,
      cost: 0, waitMinutes, travelMinutes, walkingMinutes,
      totalMinutes: waitMinutes + travelMinutes + walkingMinutes, transfers: 0,
      requiresProviderVerification: false,
    },
    signals: {
      source: "scheduled", corridorId: row.corridor_id, dataVersion: row.source_version,
      serviceAvailable: true, transfersKnown: true,
      validUntil: new Date(dep - accessMs - boardingBufferMs).toISOString(), lighting: "unknown",
    },
  };
}
