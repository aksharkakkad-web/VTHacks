-- Parameterized Databricks SQL: one scheduled, direct, same-trip journey or no row.
-- Required bindings: :from_stop_id STRING, :to_stop_id STRING,
-- :access_seconds BIGINT (explicitly verified, nonnegative), :evaluated_at TIMESTAMP UTC.
-- Capture may be at most seven days old; service date must be in the captured window.
WITH args AS (
  SELECT CAST(:from_stop_id AS STRING) AS from_stop_id,
         CAST(:to_stop_id AS STRING) AS to_stop_id,
         CAST(:access_seconds AS BIGINT) AS access_seconds,
         CAST(:evaluated_at AS TIMESTAMP) AS evaluated_at
),
version AS (
  SELECT i.source_sha256, i.captured_at, i.service_start, i.service_end
  FROM workspace.beacon.transit_imports i CROSS JOIN args a
  WHERE i.source_kind = 'scheduled'
    AND i.captured_at <= a.evaluated_at
    AND i.captured_at >= a.evaluated_at - INTERVAL 7 DAYS
  ORDER BY i.captured_at DESC, i.source_sha256 DESC
  LIMIT 1
),
rides AS (
  SELECT v.source_sha256, st.service_date, t.trip_id, t.route_id,
         r.route_short_name, r.route_long_name,
         board.stop_sequence AS board_sequence,
         alight.stop_sequence AS alight_sequence,
         timestampadd(SECOND, board.departure_seconds, st.service_start_at) AS departure_at,
         timestampadd(SECOND, alight.arrival_seconds, st.service_start_at) AS arrival_at
  FROM args a CROSS JOIN version v
  JOIN workspace.beacon.transit_service_trips st ON st.source_sha256 = v.source_sha256
    AND st.service_date BETWEEN v.service_start AND v.service_end
  JOIN workspace.beacon.transit_trips t ON t.source_sha256 = st.source_sha256 AND t.trip_id = st.trip_id
  JOIN workspace.beacon.transit_routes r ON r.source_sha256 = t.source_sha256 AND r.route_id = t.route_id
  JOIN workspace.beacon.transit_stop_times board ON board.source_sha256 = st.source_sha256
    AND board.trip_id = st.trip_id AND board.stop_id = a.from_stop_id AND board.pickup_type = 0
  JOIN workspace.beacon.transit_stop_times alight ON alight.source_sha256 = st.source_sha256
    AND alight.trip_id = st.trip_id AND alight.stop_id = a.to_stop_id
    AND alight.stop_sequence > board.stop_sequence AND alight.drop_off_type = 0
  WHERE a.from_stop_id <> a.to_stop_id AND a.access_seconds BETWEEN 0 AND 10800
    AND timestampadd(SECOND, board.departure_seconds, st.service_start_at)
        >= timestampadd(SECOND, a.access_seconds, a.evaluated_at)
    AND timestampadd(SECOND, alight.arrival_seconds, st.service_start_at)
        <= a.evaluated_at + INTERVAL 3 HOURS
)
SELECT source_sha256, service_date, trip_id, route_id, route_short_name, route_long_name,
       board_sequence, alight_sequence, departure_at, arrival_at,
       0 AS transfers, 'scheduled' AS source_kind
FROM rides
ORDER BY arrival_at ASC, departure_at ASC, trip_id ASC, board_sequence ASC
LIMIT 1;
