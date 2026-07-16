SELECT
    month_key AS month,
    count() AS appeals,
    sum(overdue) AS overdue
FROM gold.internet_appeals
GROUP BY month
ORDER BY month;
