SELECT h.date, h.inflation_yoy_pct AS headline, h.cpi,
       c.core_inflation_yoy_pct AS core,
       avg(h.inflation_yoy_pct) OVER (
         ORDER BY h.date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
       ) AS ma12
FROM fact_cpi_history h
LEFT JOIN fact_core c
  ON c.date = h.date AND c.commodity_code = '0'
WHERE h.date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
ORDER BY h.date;
