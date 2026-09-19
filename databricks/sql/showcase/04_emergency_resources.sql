-- Public campus reference only. Never insert a student's precise GPS here.
-- ST_DistanceSphere returns meters; ST_Distance on lon/lat would return degrees.
-- Straight-line distance is NOT walking distance or proof that a phone works.
WITH public_reference AS (
  SELECT st_point(-80.4139, 37.2296, 4326) AS reference_point
), measured AS (
  SELECT p.phone_id, p.location, p.longitude, p.latitude,
    p.operational_status, p.source_id,
    h3_longlatash3string(p.longitude, p.latitude, 9) AS resource_h3_cell,
    st_distancesphere(st_point(p.longitude, p.latitude, 4326), r.reference_point) AS meters
  FROM __SCHEMA__.emergency_phones p CROSS JOIN public_reference r
  WHERE p.longitude BETWEEN -180 AND 180 AND p.latitude BETWEEN -90 AND 90
)
SELECT phone_id, location, longitude, latitude, resource_h3_cell,
  round(meters, 0) AS straight_line_meters_from_demo_reference,
  operational_status, source_id,
  'PUBLIC_GIS_RESOURCE_LOCATION_ONLY' AS evidence_kind
FROM measured
WHERE meters <= 1000
ORDER BY meters, phone_id
LIMIT 20;
