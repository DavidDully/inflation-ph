WITH latest AS (
  SELECT max(date) AS d FROM fact_inflation WHERE date <= CAST(? AS DATE)
), s AS (
  SELECT commodity_code AS code, commodity AS name, weight_pct
  FROM dim_commodity
  WHERE depth = 1 AND commodity_code <> '0'
)
SELECT s.code, s.name, s.weight_pct,
       i.inflation_yoy_pct AS value,
       s.weight_pct * i.inflation_yoy_pct AS contribution
FROM s
LEFT JOIN fact_inflation i
  ON i.commodity_code = s.code
 AND i.geolocation = ?
 AND i.date = (SELECT d FROM latest)
ORDER BY contribution DESC NULLS LAST;
