-- A source timestamp and unknown values are part of the product, not hidden defects.
-- Historical counts are partial contextual evidence, not route risk predictions.
SELECT corridor_id, context_version, updated_at, valid_until,
  CASE
    WHEN updated_at > current_timestamp() THEN 'FUTURE_TIMESTAMP_REJECT'
    WHEN valid_until IS NULL OR valid_until <= current_timestamp() THEN 'STALE_OR_UNBOUNDED'
    ELSE 'WITHIN_DECLARED_VALIDITY'
  END AS freshness,
  weather, lighting, walking_path_closed, active_official_alert,
  historical_report_count, history_lookback_days, source_url,
  'Verify coverage; no reports does not mean no crime' AS interpretation_limit
FROM __SCHEMA__.route_context
ORDER BY corridor_id, updated_at DESC
LIMIT 30;
