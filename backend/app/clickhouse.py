from __future__ import annotations

from functools import lru_cache
from typing import Any

from .settings import settings


@lru_cache(maxsize=1)
def get_client() -> Any:
    try:
        import clickhouse_connect
    except ImportError as exc:  # pragma: no cover - local npm-only mode
        raise RuntimeError("clickhouse-connect is not installed") from exc

    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        secure=settings.clickhouse_secure,
        verify=settings.clickhouse_verify,
        connect_timeout=5,
        send_receive_timeout=20,
    )


def query_rows(sql: str) -> list[dict[str, Any]]:
    result = get_client().query(sql)
    return [dict(zip(result.column_names, row, strict=True)) for row in result.result_rows]
