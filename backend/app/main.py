from __future__ import annotations

from pathlib import Path

from collections import defaultdict, deque
from time import monotonic
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .chat_service import answer_question
from .clickhouse import get_client
from .data_service import load_clickhouse_payload, load_local_payload
from .settings import settings


app = FastAPI(
    title="Цифровой радар Актюбинской области",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

chat_requests: dict[str, deque[float]] = defaultdict(deque)


def enforce_chat_rate_limit(client_id: str) -> None:
    now = monotonic()
    recent = chat_requests[client_id]
    while recent and recent[0] < now - 60:
        recent.popleft()
    if len(recent) >= 12:
        raise HTTPException(
            status_code=429,
            detail="Слишком много запросов. Повторите через минуту.",
        )
    recent.append(now)


def dashboard_payload():
    try:
        if settings.data_mode == "clickhouse":
            return load_clickhouse_payload()
        return load_local_payload()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Dashboard data unavailable") from exc


@app.get("/health")
def health():
    clickhouse_status = "not_requested"
    if settings.data_mode == "clickhouse":
        try:
            get_client().query("SELECT 1")
            clickhouse_status = "ok"
        except Exception:
            clickhouse_status = "unavailable"

    return {
        "status": "ok" if clickhouse_status != "unavailable" else "degraded",
        "data_mode": settings.data_mode,
        "clickhouse": clickhouse_status,
    }


@app.get("/api/meta")
def meta():
    return dashboard_payload()["meta"]


@app.get("/api/dashboard/summary")
def dashboard_summary():
    return dashboard_payload()


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    district: str | None = Field(default=None, max_length=120)
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)


@app.post("/api/chat")
def chat(payload: ChatRequest, request: Request):
    enforce_chat_rate_limit(request.client.host if request.client else "unknown")
    try:
        answer, model, scope = answer_question(
            dashboard_payload(),
            payload.message.strip(),
            payload.district,
            [item.model_dump() for item in payload.history],
        )
        return {"answer": answer, "model": model, "scope": scope}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Выбран неизвестный район") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Аналитик временно недоступен. Попробуйте ещё раз позже.",
        ) from exc


ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = ROOT / "frontend" / "dist"

if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(DIST_DIR / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        requested = DIST_DIR / path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(DIST_DIR / "index.html")
