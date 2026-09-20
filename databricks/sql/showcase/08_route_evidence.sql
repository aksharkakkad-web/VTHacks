-- Public source snapshots only: no student GPS, inferred crime risk or invented lighting.
SELECT corridor_id,
  get_json_object(payload_json, '$.status') AS coverage,
  CAST(get_json_object(payload_json, '$.distance_meters') AS DOUBLE) AS mapped_meters,
  json_array_length(get_json_object(payload_json, '$.nearby_phones')) AS phones_within_50m,
  CAST(get_json_object(payload_json, '$.lighting.unknown_meters') AS DOUBLE) AS lighting_unknown_meters,
  json_array_length(get_json_object(payload_json, '$.historical_reports')) AS selected_endpoint_reports,
  captured_at, source_version,
  get_json_object(payload_json, '$.source_url') AS source_url,
  'Snapshot geometry, not doorstep navigation; resource access/operation unknown; historical sample is not crime risk' AS limits
FROM __SCHEMA__.route_evidence
ORDER BY corridor_id;
