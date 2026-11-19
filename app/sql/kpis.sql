WITH h AS (
  SELECT date, cpi, inflation_yoy_pct AS headline
  FROM fact_cpi_history
  WHERE date <= CAST(? AS DATE)
  ORDER BY date DESC
  LIMIT 1
), p AS (
  SELECT inflation_yoy_pct AS prev
  FROM fact_cpi_history
  WHERE date < (SELECT date FROM h)
  ORDER BY date DESC
  LIMIT 1
)
SELECT h.date, h.cpi, h.headline, p.prev,
       (SELECT core_inflation_yoy_pct
        FROM fact_core
        WHERE commodity_code = '0' AND date <= h.date
        ORDER BY date DESC LIMIT 1) AS core
FROM h LEFT JOIN p ON TRUE;
