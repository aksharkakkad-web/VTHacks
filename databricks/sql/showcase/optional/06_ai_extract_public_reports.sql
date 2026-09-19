-- OPTIONAL: excluded from automatic setup and normal ranking.
-- Requires workspace AI-function availability and approved quota/cost usage.
-- Bind enable_ai BOOLEAN=true explicitly; false returns no source rows.
-- At most 3 public, already reviewed rows are sent to the native AI function.
-- This demonstrates extraction from normalized public text, NOT automated PDF ingestion.
WITH public_sample AS (
  SELECT report_id, offense, location, reported_date, source_url, source_page,
    concat('Reported date: ', CAST(reported_date AS STRING),
      '\nOffense: ', offense, '\nReported location: ', location) AS public_text
  FROM __SCHEMA__.incident_reports
  WHERE :enable_ai = true
    AND source_url LIKE 'https://police.vt.edu/%'
  ORDER BY reported_date DESC, report_id
  LIMIT 3
)
SELECT report_id, public_text, source_url, source_page,
  offense AS reviewed_offense, location AS reviewed_location,
  ai_extract(
    public_text,
    '{"reported_date":{"type":"string","description":"Copy the reported date, not the occurrence date."},"offense":{"type":"string","description":"Copy the listed offense. Do not infer severity or guilt."},"reported_location":{"type":"string","description":"Copy the stated location. Do not guess coordinates or withheld information."}}',
    options => map(
      'version', '2.1',
      'enableCitations', 'true',
      'enableConfidenceScores', 'true',
      'instructions', 'Extract only explicitly stated facts from this public record. Leave absent facts null. Never infer danger, route safety, demographics, guilt, or identities.'
    )
  ) AS unreviewed_ai_extraction,
  'REQUIRES_SOURCE_REVIEW_NOT_USED_FOR_RANKING' AS output_status
FROM public_sample;
