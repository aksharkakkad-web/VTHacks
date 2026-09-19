-- Actual managed row counts; an audit row proves evaluation, never a ride booking.
SELECT 'official_scheduled_departures' AS dataset, count(*) AS row_count FROM __SCHEMA__.transit_departures
UNION ALL SELECT 'public_emergency_phone_locations', count(*) FROM __SCHEMA__.emergency_phones
UNION ALL SELECT 'selected_historical_incident_reports', count(*) FROM __SCHEMA__.incident_reports
UNION ALL SELECT 'source_manifest', count(*) FROM __SCHEMA__.source_manifest
UNION ALL SELECT 'currently_valid_corridors', count(DISTINCT corridor_id) FROM __SCHEMA__.route_context
  WHERE updated_at <= current_timestamp() AND valid_until > current_timestamp()
UNION ALL SELECT 'persisted_decision_evaluations', count(*) FROM __SCHEMA__.decision_events;
