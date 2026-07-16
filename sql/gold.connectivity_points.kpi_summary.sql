SELECT
    count() AS settlements,
    countIf(four_g_count = 0) AS settlements_without_4g,
    countIf(operator_count = 0) AS settlements_without_mobile,
    countIf(tower_count = 0) AS settlements_without_ams,
    countIf(is_problem = 1) AS problem_settlements,
    countIf(appeals > 0) AS settlements_with_appeals,
    countIf(critical_risk = 1) AS critical_settlements,
    sumIf(population, risk_level = 'Высокий') AS risk_population,
    sum(population) AS population,
    sum(tower_count) AS ams_total
FROM gold.connectivity_points;
