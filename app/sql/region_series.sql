SELECT date, inflation_yoy_pct AS value
FROM fact_inflation
WHERE geolocation = ? AND commodity_code = '0'
  AND date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
ORDER BY date;
