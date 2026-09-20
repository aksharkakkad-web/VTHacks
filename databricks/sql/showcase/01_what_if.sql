-- Read-only, frozen SIMULATED quotes. Not current transport availability.
-- This is a transparent sensitivity demo, not an alternate runtime evaluator.
-- Scores are weighted minutes, never crime probabilities or safety guarantees.
WITH candidates AS (
  SELECT * FROM VALUES
    ('campus', 'Campus Ride',       0.00,  8, 11,  1, 0.98),
    ('independent', 'Independent Ride', 7.00, 5, 10, 1, 0.94),
    ('transit', 'Transit',         0.00, 15, 14,  5, 0.94),
    ('walk', 'Walk',               0.00,  0,  0, 22, 1.00)
  AS q(plan_id, plan_name, cost, wait_minutes, travel_minutes, walking_minutes, reliability)
), scenarios AS (
  SELECT * FROM VALUES
    (1, 'Initial: $10, prefer less walking', 10.00, 4, false, false, 30),
    (2, 'Campus Ride canceled',             10.00, 4, true,  false, 30),
    (3, 'Then budget drops to $6',           6.00, 4, true,  false, 30),
    (4, 'Instead prioritize lowest cost',   10.00, 4, true,  true,  30),
    (5, 'Instead relax walking preference', 10.00, 1, true,  false, 30),
    (6, 'Hard walking cap of zero',         10.00, 4, true,  false,  0)
  AS s(scenario_order, scenario, budget, walking_weight, campus_canceled, lowest_cost, walking_cap)
), scored AS (
  SELECT s.*, q.*,
    CAST(wait_minutes + travel_minutes + walking_weight * walking_minutes
      + 2 * cost + 20 * (1 - reliability) AS DECIMAL(12, 2)) AS policy_score
  FROM scenarios s CROSS JOIN candidates q
  WHERE q.cost <= s.budget
    AND q.walking_minutes <= s.walking_cap
    AND NOT (s.campus_canceled AND q.plan_id = 'campus')
), ranked AS (
  SELECT *, row_number() OVER (
    PARTITION BY scenario_order
    ORDER BY CASE WHEN lowest_cost THEN cost ELSE 0 END,
      policy_score, walking_minutes, cost,
      wait_minutes + travel_minutes + walking_minutes, plan_id
  ) AS choice_rank
  FROM scored
)
SELECT s.scenario_order, s.scenario,
  'SIMULATED_QUOTES_NOT_A_BOOKING' AS evidence_kind,
  s.budget, s.walking_weight, s.walking_cap,
  CASE WHEN r.plan_id IS NULL THEN 'NO_FEASIBLE_PLAN' ELSE 'RECOMMENDED' END AS status,
  r.plan_name AS selected_plan, r.cost, r.walking_minutes,
  r.wait_minutes + r.travel_minutes + r.walking_minutes AS total_minutes,
  r.policy_score AS weighted_minutes_not_a_safety_score
FROM scenarios s
LEFT JOIN ranked r ON s.scenario_order = r.scenario_order AND r.choice_rank = 1
ORDER BY s.scenario_order;
