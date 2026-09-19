import { selectScheduledTransit, type ScheduledDeparture, type TransitRequest } from "../../lib/decision-client/transit";
import { executeStatement, qualifiedTable, type DatabricksConfig } from "./statement";

/** Read real managed GTFS departures before constructing a scheduled (not live) option. */
export async function loadScheduledTransit(
  workspace: DatabricksConfig & { transitTable: string },
  request: TransitRequest,
  options: { fetch?: typeof fetch; pollIntervalMs?: number } = {},
) {
  // Validate the request even when there are no rows.
  selectScheduledTransit([], request);
  const manifestTable=workspace.transitTable.split('.').slice(0,2).join('.')+'.source_manifest';
  const result = await executeStatement(workspace, {
    statement: `SELECT corridor_id, trip_id, route_id, route_name, CAST(service_date AS STRING) service_date,
      CAST(unix_millis(departure_at) AS STRING) departure_at,
      CAST(unix_millis(arrival_at) AS STRING) arrival_at,
      CAST(travel_minutes AS STRING) travel_minutes, from_stop_id, to_stop_id, source_id, source_version
      FROM ${qualifiedTable(workspace.transitTable)}
      WHERE corridor_id = :corridor AND departure_at > CAST(:at AS TIMESTAMP)
        AND departure_at <= timestampadd(MINUTE, :horizon, CAST(:at AS TIMESTAMP))
        AND right(source_version, 12) = (SELECT substring(sha256, 1, 12) FROM ${qualifiedTable(manifestTable)} WHERE source_id = 'bt-gtfs' LIMIT 1)
      ORDER BY arrival_at, trip_id LIMIT 32`,
    parameters: [
      { name:"corridor", value:request.corridorId, type:"STRING" },
      { name:"at", value:request.evaluatedAt, type:"STRING" },
      { name:"horizon", value:String(Math.ceil(request.accessWalkingMinutes + (request.maxWaitMinutes ?? 60))), type:"INT" },
    ],
    timeoutMs:10000,
  }, options);
  const expected = ["corridor_id","trip_id","route_id","route_name","service_date","departure_at","arrival_at","travel_minutes","from_stop_id","to_stop_id","source_id","source_version"];
  if (JSON.stringify(result.columns) !== JSON.stringify(expected)) throw new Error("Invalid Databricks transit result columns");
  const departures = result.rows.map(row => {
    if (row.some(value => value === null) || row.length !== expected.length) throw new Error("Incomplete Databricks transit record");
    const record = Object.fromEntries(expected.map((key, index) => [key, row[index]]));
    const departure = Number(record.departure_at), arrival = Number(record.arrival_at);
    if (!Number.isSafeInteger(departure) || !Number.isSafeInteger(arrival)) throw new Error("Invalid transit timestamps");
    return { ...record, departure_at:new Date(departure).toISOString(), arrival_at:new Date(arrival).toISOString(), travel_minutes:Number(record.travel_minutes) } as ScheduledDeparture;
  });
  const selected = selectScheduledTransit(departures, request);
  return selected ? { ...selected, statementId:result.statementId } : null;
}
