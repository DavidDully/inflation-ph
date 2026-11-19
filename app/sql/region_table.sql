WITH base AS (
  SELECT g.geolocation AS region, i.date, i.inflation_yoy_pct AS infl
  FROM fact_inflation i
  JOIN dim_geolocation g USING (geolocation)
  WHERE g.geo_type = 'region' AND i.commodity_code = '0'
), ranked AS (
  SELECT region, date, infl,
         lag(infl) OVER (PARTITION BY region ORDER BY date) AS prev,
         row_number() OVER (PARTITION BY region ORDER BY date DESC) AS rn,
         rank() OVER (PARTITION BY date ORDER BY infl DESC) AS rank
  FROM base
)
SELECT region, infl, prev, infl - prev AS mom_change, rank, date
FROM ranked
WHERE rn = 1
ORDER BY rank;
