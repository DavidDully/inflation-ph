WITH months AS (
  SELECT date
  FROM dim_date
  WHERE date <= CAST(? AS DATE)
    AND date > CAST(? AS DATE) - INTERVAL 36 MONTH
), s AS (
  SELECT commodity_code, commodity, sector_code, weight_pct
  FROM dim_commodity
  WHERE depth = 1 AND commodity_code <> '0'
)
SELECT s.commodity AS sector, m.date,
       round(sum(i.inflation_yoy_pct * s.weight_pct) / sum(s.weight_pct), 3) AS value
FROM months m
CROSS JOIN s
LEFT JOIN fact_inflation i
  ON i.date = m.date
 AND i.commodity_code = s.commodity_code
 AND i.geolocation = 'PHILIPPINES'
GROUP BY s.commodity, m.date
ORDER BY s.commodity, m.date;
