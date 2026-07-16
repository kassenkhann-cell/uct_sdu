SELECT
    district,
    settlement,
    population,
    problem,
    problem_operator,
    fiber,
    satellite,
    recommendation,
    critical_risk,
    problem_appeals,
    latitude,
    longitude
FROM gold.connectivity_points
WHERE is_problem = 1
ORDER BY critical_risk DESC, population DESC, district, settlement;
