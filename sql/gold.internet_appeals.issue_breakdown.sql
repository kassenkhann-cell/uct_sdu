SELECT
    topic AS name,
    count() AS value
FROM gold.internet_appeals
GROUP BY name
ORDER BY value DESC;
