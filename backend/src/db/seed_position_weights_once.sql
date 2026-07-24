-- One-off manual seed/refresh of oc_position_weights from currently cached
-- crime history (mirrors ocController.js's syncPositionWeights logic), so
-- the Config tab has real data without waiting for the nightly cron.

INSERT OR IGNORE INTO oc_position_weights (crime_name, position, position_number, position_label, weight, auto_computed)
SELECT DISTINCT c.name, s.position, s.position_number, s.position_label, 0, 1
FROM oc_crime_slots s
JOIN oc_crimes c ON c.id = s.crime_id
WHERE s.position_number IS NOT NULL;

WITH stats AS (
  SELECT c.name AS crime_name, s.position, s.position_number,
         SUM(CASE WHEN s.outcome = 'Successful' AND c.status = 'Successful' THEN 1 ELSE 0 END) AS pos_succ_crime_succ,
         SUM(CASE WHEN s.outcome = 'Successful' THEN 1 ELSE 0 END) AS pos_succ_total,
         SUM(CASE WHEN s.outcome != 'Successful' AND c.status = 'Successful' THEN 1 ELSE 0 END) AS pos_fail_crime_succ,
         SUM(CASE WHEN s.outcome != 'Successful' THEN 1 ELSE 0 END) AS pos_fail_total
  FROM oc_crime_slots s
  JOIN oc_crimes c ON c.id = s.crime_id
  WHERE c.status IN ('Successful','Failure')
    AND s.torn_user_id IS NOT NULL AND s.outcome IS NOT NULL AND s.position_number IS NOT NULL
  GROUP BY c.name, s.position, s.position_number
)
UPDATE oc_position_weights
SET weight = (
  SELECT ROUND(MAX(0.0, (
      (CAST(st.pos_succ_crime_succ AS REAL) / st.pos_succ_total) -
      (CAST(st.pos_fail_crime_succ AS REAL) / st.pos_fail_total)
    ) * 100.0), 1)
  FROM stats st
  WHERE st.crime_name = oc_position_weights.crime_name
    AND st.position = oc_position_weights.position
    AND st.position_number = oc_position_weights.position_number
    AND st.pos_succ_total >= 3 AND st.pos_fail_total >= 3
),
updated_at = CURRENT_TIMESTAMP
WHERE auto_computed = 1
  AND EXISTS (
    SELECT 1 FROM stats st
    WHERE st.crime_name = oc_position_weights.crime_name
      AND st.position = oc_position_weights.position
      AND st.position_number = oc_position_weights.position_number
      AND st.pos_succ_total >= 3 AND st.pos_fail_total >= 3
  );
