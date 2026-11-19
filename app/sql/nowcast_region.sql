SELECT target_next
FROM feat_region_month
WHERE geolocation = ? AND date <= CAST(? AS DATE) AND target_next IS NOT NULL
ORDER BY date DESC
LIMIT 1;
