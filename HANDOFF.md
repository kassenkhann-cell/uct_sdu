# Передача проекта коллеге

Проект: **Цифровой радар Актюбинской области**.

## Что внутри архива

- `frontend/` — React + Vite + TypeScript интерфейс.
- `backend/` — FastAPI backend и локальный API fallback.
- `scripts/` — подготовка данных из CSV/XLSX и локальный сервер.
- `data/` — исходные CSV/XLSX и сгенерированные CSV-срезы.
- `sql/` — SELECT-запросы под ClickHouse-контракт.
- `docker/`, `docker-compose.yml`, `backend/Dockerfile` — контейнеризация.
- `README.md` — подробное описание проекта.
- `Запустить дашборд.cmd` — быстрый запуск на Windows.

В архив специально не включаются `node_modules`, логи, `.git`, `.codex`, `.agents`, Docker image tar и временные файлы.

## Быстрый запуск

Требуется Node.js 20+.

```bash
npm install
npm run dev
```

После запуска открыть:

```text
http://localhost:5173
```

На Windows можно просто дважды нажать:

```text
Запустить дашборд.cmd
```

## Проверка сборки

```bash
npm run build
```

Команда заново читает файлы из `data/`, формирует JSON/CSV срезы и собирает frontend.

## Полный dev-режим с FastAPI

Если нужен отдельный FastAPI сервер:

```bash
python -m pip install -r backend/requirements.txt
npm run dev:full
```

FastAPI будет доступен на:

```text
http://localhost:8000
```

Документация API:

```text
http://localhost:8000/api/docs
```

## Основные данные

- `data/eobr_internet_aktob_2025_2026.csv`
- `data/Копия МШПД в СНП 2025- последний ).xlsx`
- `data/районам по 213v2.xlsx`

Если эти файлы заменить новыми версиями, нужно снова выполнить:

```bash
npm run build
```

