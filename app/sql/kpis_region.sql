WITH h AS (
  SELECT date, inflation_yoy_pct AS headline
  FROM fact_inflation
  WHERE geolocation = ? AND commodity_code = '0' AND date <= CAST(? AS DATE)
  ORDER BY date DESC LIMIT 1
), p AS (
  SELECT inflation_yoy_pct AS prev
  FROM fact_inflation
  WHERE geolocation = ? AND commodity_code = '0'
    AND date < (SELECT date FROM h)
  ORDER BY date DESC LIMIT 1
), c AS (
  SELECT cpi FROM fact_cpi
  WHERE geolocation = ? AND commodity_code = '0'
    AND date = (SELECT date FROM h)
)
SELECT h.date, c.cpi, h.headline, p.prev
FROM h LEFT JOIN p ON TRUE LEFT JOIN c ON TRUE;
