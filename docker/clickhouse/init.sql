CREATE DATABASE IF NOT EXISTS gold;

CREATE TABLE IF NOT EXISTS gold.connectivity_points
(
    kato String,
    district String,
    settlement String,
    rural_county String,
    latitude Float64,
    longitude Float64,
    population UInt32,
    households UInt32,
    coverage String,
    beeline String,
    kcell String,
    tele2 String,
    fiber String,
    satellite String,
    plan String,
    provider String,
    potential String,
    tower_count UInt16,
    tower_height String,
    tower_coordinates String,
    tower_holder String,
    tower_funding String,
    tower_cost Float64,
    tower_power String,
    operator_count UInt8,
    four_g_count UInt8,
    broadband UInt8,
    appeals UInt32,
    is_problem UInt8,
    critical_risk UInt8,
    problem_appeals UInt32,
    problem String,
    problem_operator String,
    recommendation String,
    risk_score Float64,
    risk_level String
)
ENGINE = MergeTree
ORDER BY (district, kato);

CREATE TABLE IF NOT EXISTS gold.internet_appeals
(
    appeal_id String,
    reg_number String,
    district String,
    settlement String,
    kato String,
    category String,
    issue String,
    subissue String,
    status String,
    overdue UInt8,
    start_date String,
    year UInt16,
    month UInt8,
    month_key String,
    topic String
)
ENGINE = MergeTree
ORDER BY (month_key, district, appeal_id);

CREATE TABLE IF NOT EXISTS gold.district_connectivity
(
    district String,
    settlements UInt16,
    population UInt32,
    connected UInt16,
    broadband_share Float64,
    four_g_share Float64,
    risk_settlements UInt16,
    problem_settlements UInt16,
    critical_settlements UInt16,
    ams_count UInt16,
    settlements_with_ams UInt16,
    settlements_without_ams UInt16,
    satellite_settlements UInt16,
    appeals UInt32,
    overdue UInt32,
    appeals_per_10k Float64,
    risk_score Float64,
    risk_level String,
    planned UInt16,
    target_2030 UInt16,
    data_completeness String
    ,risk_reasons String
)
ENGINE = MergeTree
ORDER BY district;

TRUNCATE TABLE gold.connectivity_points;
TRUNCATE TABLE gold.internet_appeals;
TRUNCATE TABLE gold.district_connectivity;

INSERT INTO gold.connectivity_points
SELECT *
FROM file(
    'derived/gold.connectivity_points.csv',
    CSVWithNames,
    'kato String, district String, settlement String, rural_county String, latitude Float64, longitude Float64, population UInt32, households UInt32, coverage String, beeline String, kcell String, tele2 String, fiber String, satellite String, plan String, provider String, potential String, tower_count UInt16, tower_height String, tower_coordinates String, tower_holder String, tower_funding String, tower_cost Float64, tower_power String, operator_count UInt8, four_g_count UInt8, broadband UInt8, appeals UInt32, is_problem UInt8, critical_risk UInt8, problem_appeals UInt32, problem String, problem_operator String, recommendation String, risk_score Float64, risk_level String'
);

INSERT INTO gold.internet_appeals
SELECT *
FROM file(
    'derived/gold.internet_appeals.csv',
    CSVWithNames,
    'appeal_id String, reg_number String, district String, settlement String, kato String, category String, issue String, subissue String, status String, overdue UInt8, start_date String, year UInt16, month UInt8, month_key String, topic String'
);

INSERT INTO gold.district_connectivity
SELECT *
FROM file(
    'derived/gold.district_connectivity.csv',
    CSVWithNames,
    'district String, settlements UInt16, population UInt32, connected UInt16, broadband_share Float64, four_g_share Float64, risk_settlements UInt16, problem_settlements UInt16, critical_settlements UInt16, ams_count UInt16, settlements_with_ams UInt16, settlements_without_ams UInt16, satellite_settlements UInt16, appeals UInt32, overdue UInt32, appeals_per_10k Float64, risk_score Float64, risk_level String, planned UInt16, target_2030 UInt16, data_completeness String, risk_reasons String'
);
