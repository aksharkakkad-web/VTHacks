import type { CandidatePlan } from "../../types/provider";
import type { PlanSignals } from "../../lib/decision-client/decision";
import { executeStatement, qualifiedTable, type DatabricksConfig } from "./statement";

export type FullTransitRequest = {
  fromStopId: string;
  toStopId: string;
  /** Timezone-qualified instant; local clock strings without an offset are rejected. */
  evaluatedAt: string;
  /** Explicit route/provider inputs, never inferred from a straight-line stop distance. */
  accessWalkingMinutes: number;
  egressWalkingMinutes: number;
  maxWaitMinutes: number;
  walkingSource: "estimated" | "mapped";
};

export type FullTransitSource = {
  sourceSha256: string;
  capturedAt: string;
  serviceDate: string;
  tripId: string;
  routeId: string;
  fromStopId: string;
  toStopId: string;
  departureAt: string;
  arrivalAt: string;
  walkingSource: FullTransitRequest["walkingSource"];
};

export type FullTransitOption = {
  candidate: CandidatePlan;
  signals: PlanSignals;
  source: FullTransitSource;
  statementId: string;
  warnings: string[];
};

const columns = ["source_sha256", "captured_at", "service_date", "trip_id", "route_id", "route_short_name", "route_long_name", "from_stop_id", "to_stop_id", "board_sequence", "alight_sequence", "departure_at", "arrival_at", "transfers", "source_kind"];
const stopId = /^[A-Za-z0-9_.:-]{1,80}$/;
const tripId = /^[A-Za-z0-9_.:-]{1,80}$/;
const sourceHash = /^[a-f0-9]{64}$/;
const strictInt = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
const invalidResult = (): never => { throw new Error("Invalid full transit result"); };

/** Direct official GTFS trip only. A null means there is no supported eligible journey, not a transfer search. */
export async function loadFullTransit(
  workspace: DatabricksConfig & { transitSchema: string },
  request: FullTransitRequest,
  options: { fetch?: typeof fetch; pollIntervalMs?: number } = {},
): Promise<FullTransitOption | null> {
  const at = Date.parse(request?.evaluatedAt);
  const localDay = typeof request?.evaluatedAt === "string" ? request.evaluatedAt.slice(0, 10) : "";
  if (!request || !stopId.test(request.fromStopId) || !stopId.test(request.toStopId) || request.fromStopId === request.toStopId ||
      typeof request.evaluatedAt !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(request.evaluatedAt) || !Number.isFinite(at) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(localDay) || !Number.isFinite(Date.parse(`${localDay}T00:00:00Z`)) ||
      new Date(`${localDay}T00:00:00Z`).toISOString().slice(0, 10) !== localDay ||
      ![request.accessWalkingMinutes, request.egressWalkingMinutes, request.maxWaitMinutes].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 120 && Number.isSafeInteger(Math.round(n * 60))) ||
      !["estimated", "mapped"].includes(request.walkingSource)) throw new Error("Invalid full transit request");

  // Identifiers only come from validated deployment config; student/request fields are bound.
  const table = (name: string) => qualifiedTable(`${workspace.transitSchema}.${name}`);
  const imports = table("transit_imports"), stops = table("transit_stops"), services = table("transit_service_trips");
  const trips = table("transit_trips"), routes = table("transit_routes"), times = table("transit_stop_times");
  const accessSeconds = Math.round(request.accessWalkingMinutes * 60);
  const maxWaitSeconds = Math.round(request.maxWaitMinutes * 60);
  const result = await executeStatement(workspace, {
    statement: `WITH args AS (
      SELECT CAST(:from_stop_id AS STRING) AS from_stop_id, CAST(:to_stop_id AS STRING) AS to_stop_id,
             CAST(:access_seconds AS BIGINT) AS access_seconds, CAST(:max_wait_seconds AS BIGINT) AS max_wait_seconds,
             CAST(:evaluated_at AS TIMESTAMP) AS evaluated_at
    ), version AS (
      SELECT i.source_sha256, i.captured_at, i.service_start, i.service_end
      FROM ${imports} i CROSS JOIN args a
      WHERE i.source_kind = 'scheduled' AND i.captured_at <= a.evaluated_at
        AND i.captured_at >= a.evaluated_at - INTERVAL 7 DAYS
      ORDER BY i.captured_at DESC, i.source_sha256 DESC LIMIT 1
    ), rides AS (
      SELECT v.source_sha256, v.captured_at, st.service_date, t.trip_id, t.route_id,
             r.route_short_name, r.route_long_name, board.stop_id AS from_stop_id, alight.stop_id AS to_stop_id,
             board.stop_sequence AS board_sequence, alight.stop_sequence AS alight_sequence,
             timestampadd(SECOND, board.departure_seconds, st.service_start_at) AS departure_at,
             timestampadd(SECOND, alight.arrival_seconds, st.service_start_at) AS arrival_at
      FROM args a CROSS JOIN version v
      JOIN ${stops} origin ON origin.source_sha256 = v.source_sha256 AND origin.stop_id = a.from_stop_id
      JOIN ${stops} destination ON destination.source_sha256 = v.source_sha256 AND destination.stop_id = a.to_stop_id
      JOIN ${services} st ON st.source_sha256 = v.source_sha256 AND st.service_date BETWEEN v.service_start AND v.service_end
      JOIN ${trips} t ON t.source_sha256 = st.source_sha256 AND t.trip_id = st.trip_id
      JOIN ${routes} r ON r.source_sha256 = t.source_sha256 AND r.route_id = t.route_id
      JOIN ${times} board ON board.source_sha256 = st.source_sha256 AND board.trip_id = st.trip_id
        AND board.stop_id = a.from_stop_id AND board.pickup_type = 0
      JOIN ${times} alight ON alight.source_sha256 = st.source_sha256 AND alight.trip_id = st.trip_id
        AND alight.stop_id = a.to_stop_id AND alight.stop_sequence > board.stop_sequence AND alight.drop_off_type = 0
      WHERE a.from_stop_id <> a.to_stop_id AND a.access_seconds BETWEEN 0 AND 7200
        AND timestampadd(SECOND, board.departure_seconds, st.service_start_at)
            > timestampadd(SECOND, a.access_seconds + 60, a.evaluated_at)
        AND timestampadd(SECOND, board.departure_seconds, st.service_start_at)
            <= timestampadd(SECOND, a.access_seconds + a.max_wait_seconds, a.evaluated_at)
        AND timestampadd(SECOND, alight.arrival_seconds, st.service_start_at) <= a.evaluated_at + INTERVAL 3 HOURS
    )
    SELECT source_sha256, CAST(unix_millis(captured_at) AS STRING) AS captured_at,
           CAST(service_date AS STRING) AS service_date, trip_id, route_id, route_short_name, route_long_name,
           from_stop_id, to_stop_id, CAST(board_sequence AS STRING) AS board_sequence,
           CAST(alight_sequence AS STRING) AS alight_sequence, CAST(unix_millis(departure_at) AS STRING) AS departure_at,
           CAST(unix_millis(arrival_at) AS STRING) AS arrival_at, '0' AS transfers, 'scheduled' AS source_kind
    FROM rides ORDER BY arrival_at ASC, departure_at ASC, trip_id ASC, board_sequence ASC LIMIT 1`,
    parameters: [
      { name: "from_stop_id", value: request.fromStopId, type: "STRING" },
      { name: "to_stop_id", value: request.toStopId, type: "STRING" },
      { name: "access_seconds", value: String(accessSeconds), type: "BIGINT" },
      { name: "evaluated_at", value: new Date(at).toISOString(), type: "STRING" },
      { name: "max_wait_seconds", value: String(maxWaitSeconds), type: "BIGINT" },
    ], timeoutMs: 10000,
  }, options);
  if (JSON.stringify(result.columns) !== JSON.stringify(columns) || result.rows.length > 1) return invalidResult();
  if (result.rows.length === 0) return null;
  const cells = result.rows[0];
  if (cells.length !== columns.length || cells.some(value => typeof value !== "string")) return invalidResult();
  const record = Object.fromEntries(columns.map((column, index) => [column, cells[index]])) as Record<string, string>;
  if (!sourceHash.test(record.source_sha256) || !/^\d{4}-\d{2}-\d{2}$/.test(record.service_date) ||
      !Number.isFinite(Date.parse(`${record.service_date}T00:00:00Z`)) ||
      new Date(`${record.service_date}T00:00:00Z`).toISOString().slice(0, 10) !== record.service_date ||
      !tripId.test(record.trip_id) || !tripId.test(record.route_id) ||
      record.route_short_name.length > 80 || record.route_long_name.length > 120 ||
      !strictInt(record.board_sequence) || !strictInt(record.alight_sequence) ||
      Number(record.alight_sequence) <= Number(record.board_sequence) ||
      ![record.captured_at, record.departure_at, record.arrival_at].every(strictInt) ||
      record.transfers !== "0" || record.source_kind !== "scheduled") return invalidResult();
  if (record.from_stop_id !== request.fromStopId || record.to_stop_id !== request.toStopId) return null;
  const captured = Number(record.captured_at), departure = Number(record.departure_at), arrival = Number(record.arrival_at);
  if (arrival <= departure) return invalidResult();
  if (captured > at || at - captured > 7 * 86400000 ||
      departure <= at + accessSeconds * 1000 + 60000 ||
      departure - at - accessSeconds * 1000 > maxWaitSeconds * 1000 ||
      arrival > at + 3 * 3600000) return null;
  const departureAt = new Date(departure).toISOString();
  const source: FullTransitSource = {
    sourceSha256: record.source_sha256, capturedAt: new Date(captured).toISOString(), serviceDate: record.service_date,
    tripId: record.trip_id, routeId: record.route_id, fromStopId: record.from_stop_id, toStopId: record.to_stop_id,
    departureAt, arrivalAt: new Date(arrival).toISOString(), walkingSource: request.walkingSource,
  };
  const waitMinutes = (departure - at - accessSeconds * 1000) / 60000;
  const travelMinutes = (arrival - departure) / 60000;
  const walkingMinutes = accessSeconds / 60 + request.egressWalkingMinutes;
  const candidate: CandidatePlan = {
    planId: `bt:${record.source_sha256.slice(0, 12)}:${record.service_date}:${record.trip_id}`,
    providerId: "blacksburg-transit", providerName: `Blacksburg Transit ${record.route_id} (scheduled)`,
    mode: "transit", available: true, cost: 0, waitMinutes, travelMinutes, walkingMinutes,
    totalMinutes: waitMinutes + travelMinutes + walkingMinutes, transfers: 0, requiresProviderVerification: false,
  };
  const signals: PlanSignals = {
    source: "scheduled", collectedAt: source.capturedAt, validUntil: new Date(departure - accessSeconds * 1000 - 60000).toISOString(),
    dataVersion: source.sourceSha256, serviceAvailable: true, transfersKnown: true, lighting: "unknown",
  };
  return { candidate, signals, source, statementId: result.statementId,
    warnings: request.walkingSource === "estimated" ? ["Stop access and egress walks are estimated for this POC, not verified routes."] : [] };
}
