-- Actual managed row counts; an audit row proves evaluation, never a ride booking.
SELECT 'official_scheduled_departures' AS dataset, count(*) AS row_count FROM __SCHEMA__.transit_departures
UNION ALL SELECT 'public_emergency_phone_locations', count(*) FROM __SCHEMA__.emergency_phones
UNION ALL SELECT 'selected_historical_incident_reports', count(*) FROM __SCHEMA__.incident_reports
UNION ALL SELECT 'source_manifest', count(*) FROM __SCHEMA__.source_manifest
UNION ALL SELECT 'currently_valid_corridors', count(DISTINCT corridor_id) FROM __SCHEMA__.route_context
  WHERE updated_at BETWEEN current_timestamp() - INTERVAL 24 HOURS AND current_timestamp()
    AND (valid_from IS NULL OR valid_from <= current_timestamp()) AND valid_until > current_timestamp()
    AND (context_version NOT LIKE 'nws-%' OR startswith(context_version, concat(
      'nws-', (SELECT substring(sha256,1,12) FROM __SCHEMA__.source_manifest WHERE source_id='nws-hourly' LIMIT 1),
      '-', (SELECT substring(sha256,1,12) FROM __SCHEMA__.source_manifest WHERE source_id='nws-alerts' LIMIT 1), '-')))
UNION ALL SELECT 'mapped_route_evidence', count(*) FROM __SCHEMA__.route_evidence
UNION ALL SELECT 'persisted_decision_evaluations', count(*) FROM __SCHEMA__.decision_events;
