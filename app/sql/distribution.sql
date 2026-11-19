WITH sample AS (
  SELECT inflation_yoy_pct AS v,
         CASE WHEN date >= DATE '2018-01-01' THEN 'recent' ELSE 'full' END AS sample
  FROM fact_cpi_history
  WHERE inflation_yoy_pct IS NOT NULL
)
SELECT sample,
       floor(v / 2) * 2 AS bin_start,
       count(*) AS n
FROM sample
GROUP BY sample, bin_start
ORDER BY sample, bin_start;
