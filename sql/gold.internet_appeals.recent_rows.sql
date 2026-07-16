SELECT
    appeal_id,
    reg_number,
    district,
    settlement,
    subissue,
    status,
    overdue,
    start_date
FROM gold.internet_appeals
ORDER BY start_date DESC
LIMIT 100;
