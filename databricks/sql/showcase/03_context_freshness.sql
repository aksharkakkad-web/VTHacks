-- A source timestamp and unknown values are part of the product, not hidden defects.
-- Historical counts are partial contextual evidence, not route risk predictions.
SELECT corridor_id, context_version, updated_at, valid_from, valid_until,
  CASE
    WHEN updated_at > current_timestamp() THEN 'FUTURE_TIMESTAMP_REJECT'
    WHEN context_version LIKE 'nws-%' AND NOT coalesce(startswith(context_version, concat(
      'nws-', (SELECT substring(sha256,1,12) FROM __SCHEMA__.source_manifest WHERE source_id='nws-hourly' LIMIT 1),
      '-', (SELECT substring(sha256,1,12) FROM __SCHEMA__.source_manifest WHERE source_id='nws-alerts' LIMIT 1), '-')), false) THEN 'SUPERSEDED_SOURCE'
    WHEN valid_until IS NULL OR valid_until <= current_timestamp() OR updated_at < current_timestamp() - INTERVAL 24 HOURS THEN 'STALE_OR_UNBOUNDED'
    WHEN valid_from > current_timestamp() THEN 'FUTURE_PERIOD'
    ELSE 'WITHIN_DECLARED_VALIDITY'
  END AS freshness,
  weather, lighting, walking_path_closed, active_official_alert,
  historical_report_count, history_lookback_days, source_url,
  'Verify coverage; no reports does not mean no crime' AS interpretation_limit
FROM __SCHEMA__.route_context
ORDER BY CASE WHEN valid_from <= current_timestamp() AND valid_until > current_timestamp() THEN 0 ELSE 1 END,
  corridor_id, updated_at DESC, valid_from
LIMIT 30;
