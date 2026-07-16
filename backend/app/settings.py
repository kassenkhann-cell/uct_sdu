from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_local_env() -> None:
    """Load local secrets without ever logging their values."""
    env_path = ROOT / "data" / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name:
            os.environ.setdefault(name, value)


load_local_env()


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_mode: str = os.getenv("DATA_MODE", "local").strip().lower()
    clickhouse_host: str = os.getenv("CLICKHOUSE_HOST", "localhost")
    clickhouse_port: int = int(os.getenv("CLICKHOUSE_PORT", "8123"))
    clickhouse_user: str = os.getenv("CLICKHOUSE_USER", "default")
    clickhouse_password: str = os.getenv("CLICKHOUSE_PASSWORD", "")
    clickhouse_secure: bool = env_bool("CLICKHOUSE_SECURE", False)
    clickhouse_verify: bool = env_bool("CLICKHOUSE_VERIFY", True)
    cors_origins: tuple[str, ...] = tuple(
        item.strip()
        for item in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,https://kassenkhann-cell.github.io",
        ).split(",")
        if item.strip()
    )
    llm_api_key: str = field(
        default=os.getenv("LLM_API_KEY")
        or os.getenv("NITEC_API_KEY")
        or os.getenv("key", ""),
        repr=False,
    )
    llm_base_url: str = os.getenv("LLM_BASE_URL", "https://llm.nitec.kz/v1").rstrip("/")
    llm_model: str = os.getenv("LLM_MODEL", "").strip()
    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "90"))


settings = Settings()
