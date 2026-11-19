SELECT year(date) AS year, month(date) AS month,
       round(avg(inflation_yoy_pct), 3) AS value
FROM fact_cpi_history
WHERE date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
  AND inflation_yoy_pct IS NOT NULL
GROUP BY year(date), month(date)
ORDER BY year, month;
