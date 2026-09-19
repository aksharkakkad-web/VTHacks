-- Map resource distribution, NOT crime or the safety of a neighborhood.
WITH cells AS (
  SELECT h3_longlatash3string(longitude, latitude, 9) AS h3_cell,
    count(*) AS mapped_phone_count,
    sum(CASE WHEN operational_status = 'unknown' THEN 1 ELSE 0 END) AS unverified_status_count
  FROM __SCHEMA__.emergency_phones
  WHERE longitude BETWEEN -180 AND 180 AND latitude BETWEEN -90 AND 90
  GROUP BY h3_longlatash3string(longitude, latitude, 9)
)
SELECT h3_cell, mapped_phone_count, unverified_status_count,
  h3_boundaryasgeojson(h3_cell) AS cell_boundary_geojson,
  'Phone locations only; coverage and operational status unverified' AS interpretation_limit
FROM cells
ORDER BY mapped_phone_count DESC, h3_cell;
