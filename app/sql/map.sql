WITH d AS (
  SELECT date
  FROM dim_date
  WHERE date <= CAST(? AS DATE)
  ORDER BY date DESC
  LIMIT 2
), cur AS (
  SELECT f.geolocation AS geo_id, f.inflation_yoy_pct AS value
  FROM fact_inflation f
  JOIN dim_geolocation g USING (geolocation)
  WHERE g.geo_type = 'region' AND f.commodity_code = '0'
    AND f.date = (SELECT max(date) FROM d)
), prev AS (
  SELECT f.geolocation AS geo_id, f.inflation_yoy_pct AS prev
  FROM fact_inflation f
  JOIN dim_geolocation g USING (geolocation)
  WHERE g.geo_type = 'region' AND f.commodity_code = '0'
    AND f.date = (SELECT min(date) FROM d)
)
SELECT c.geo_id,
       c.value,
       p.prev,
       c.value - p.prev AS mom_change,
       rank() OVER (ORDER BY c.value DESC) AS rank
FROM cur c
LEFT JOIN prev p USING (geo_id)
ORDER BY rank;
