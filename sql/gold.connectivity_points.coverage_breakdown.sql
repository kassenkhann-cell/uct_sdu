SELECT
    multiIf(
        positionCaseInsensitive(coverage, '5G') > 0, '5G',
        positionCaseInsensitive(coverage, '4G') > 0, '4G',
        positionCaseInsensitive(coverage, '3G') > 0, '3G',
        positionCaseInsensitive(coverage, '2G') > 0, '2G',
        'Без подтверждённого покрытия'
    ) AS coverage_group,
    count() AS settlements
FROM gold.connectivity_points
GROUP BY coverage_group
ORDER BY settlements DESC;
