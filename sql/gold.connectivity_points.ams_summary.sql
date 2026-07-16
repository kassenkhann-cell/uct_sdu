SELECT
    district,
    sum(tower_count) AS ams_count,
    countIf(tower_count > 0) AS settlements_with_ams,
    countIf(tower_count = 0) AS settlements_without_ams
FROM gold.connectivity_points
GROUP BY district
ORDER BY ams_count DESC;
