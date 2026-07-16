FROM clickhouse/clickhouse-server:24.8

LABEL org.opencontainers.image.title="SDU UCT ClickHouse with embedded dashboard data" \
      org.opencontainers.image.source="https://github.com/kassenkhann-cell/uct_sdu"

COPY --chown=clickhouse:clickhouse .build/clickhouse-data/ /var/lib/clickhouse/
