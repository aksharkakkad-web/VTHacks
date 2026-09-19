-- __SCHEMA__ is replaced by the trusted setup runner with a quoted catalog.schema.
-- Audit events are evaluation attempts, not people, bookings or completed trips.
WITH deduplicated AS (
  SELECT *, row_number() OVER (
    PARTITION BY evaluation_id
    ORDER BY evaluated_at DESC, statement_id DESC, result_json DESC
  ) AS attempt_rank
  FROM __SCHEMA__.decision_events
  WHERE evaluated_at >= current_timestamp() - INTERVAL 7 DAYS
)
SELECT evaluation_id, objective_version, evaluated_at, policy_version, engine,
  get_json_object(result_json, '$.status') AS decision_status,
  get_json_object(result_json, '$.selectedPlanId') AS selected_plan_id,
  get_json_object(result_json, '$.ranked') AS ranked_evidence_json,
  statement_id,
  CASE WHEN engine = 'databricks' AND statement_id IS NOT NULL
    THEN 'Databricks statement recorded: inspect its query history'
    ELSE 'Not proof of a live Databricks ranking'
  END AS evidence_note
FROM deduplicated
WHERE attempt_rank = 1
ORDER BY evaluated_at DESC, evaluation_id
LIMIT 30;
