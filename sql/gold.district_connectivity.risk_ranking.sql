SELECT
    district,
    settlements,
    population,
    broadband_share,
    four_g_share,
    risk_settlements,
    problem_settlements,
    critical_settlements,
    ams_count,
    settlements_with_ams,
    settlements_without_ams,
    satellite_settlements,
    appeals,
    appeals_per_10k,
    risk_score,
    risk_level,
    planned,
    data_completeness,
    risk_reasons
FROM gold.district_connectivity
ORDER BY risk_score DESC;
