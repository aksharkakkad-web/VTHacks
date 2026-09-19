-- Run through: node databricks/run.mjs setup --apply
-- __SCHEMA__ is replaced only with validated catalog/schema identifiers.
CREATE SCHEMA IF NOT EXISTS __SCHEMA__ COMMENT 'Beacon hackathon public campus data and sanitized decision evidence';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.public_snapshots (
  dataset STRING NOT NULL,
  snapshot_hash STRING NOT NULL,
  payload STRING NOT NULL,
  imported_at TIMESTAMP NOT NULL
) USING DELTA COMMENT 'Bronze: public-source snapshots only; never student location or identity';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.source_manifest (
  source_id STRING, title STRING, source_url STRING, captured_at TIMESTAMP,
  sha256 STRING, source_kind STRING, coverage STRING, license_note STRING,
  limitations STRING, row_count BIGINT
) USING DELTA COMMENT 'Public source provenance and explicit coverage limitations';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.incident_reports (
  report_id STRING, reported_date DATE, offense STRING, location STRING,
  occurrence_start STRING, occurrence_end STRING, disposition STRING,
  source_id STRING, source_url STRING, source_page INT,
  extraction_method STRING, coverage_note STRING
) USING DELTA COMMENT 'Selected public reported incidents: not crime probabilities, current alerts, or a complete safety map';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.emergency_phones (
  phone_id STRING, location STRING, longitude DOUBLE, latitude DOUBLE,
  operational_status STRING, source_id STRING
) USING DELTA COMMENT 'Public infrastructure locations; operational status unknown';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.transit_departures (
  corridor_id STRING, trip_id STRING, route_id STRING, route_name STRING,
  service_date DATE, departure_at TIMESTAMP, arrival_at TIMESTAMP,
  travel_minutes DOUBLE, from_stop_id STRING, to_stop_id STRING,
  source_id STRING, source_version STRING
) USING DELTA COMMENT 'Official scheduled departures, not live vehicle predictions; agency calendar and timezone applied';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.route_context (
  corridor_id STRING, context_version STRING, updated_at TIMESTAMP,
  valid_until TIMESTAMP, weather STRING, lighting STRING,
  walking_path_closed BOOLEAN, active_official_alert BOOLEAN,
  historical_report_count BIGINT, history_lookback_days INT, source_url STRING
) USING DELTA COMMENT 'Current evidence only; null and unknown never mean safe or clear';
-- COMMAND --
CREATE TABLE IF NOT EXISTS __SCHEMA__.decision_events (
  evaluation_id STRING, objective_version BIGINT, evaluated_at TIMESTAMP,
  policy_version STRING, engine STRING, result_json STRING, statement_id STRING
) USING DELTA COMMENT 'Sanitized decision evidence; no precise pickup, person, contact, or user free text';
