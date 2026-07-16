from __future__ import annotations

import json
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .clickhouse import query_rows


GENERATED_PATH = Path(__file__).resolve().parent / "generated" / "dashboard.json"


def load_local_payload() -> dict[str, Any]:
    if not GENERATED_PATH.exists():
        raise RuntimeError(
            "Generated dashboard data is missing. Run `npm run prepare:data`."
        )
    return json.loads(GENERATED_PATH.read_text(encoding="utf-8"))


def _recommendations(districts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    priority_districts = sorted(
        districts,
        key=lambda item: (
            -int(int(item.get("problem_settlements", 0) or 0) > 0),
            -int(item.get("critical_settlements", 0) or 0),
            -int(item.get("problem_settlements", 0) or 0),
            -float(item.get("risk_score", 0) or 0),
        ),
    )
    for index, district in enumerate(priority_districts[:8]):
        priority = str(district.get("risk_level", "Средний"))
        settlements = int(district.get("settlements", 0) or 0)
        four_g_share = float(district.get("four_g_share", 0) or 0)
        weak_coverage = max(0, settlements - round(four_g_share / 100 * settlements))
        problem_count = int(district.get("problem_settlements", 0) or 0)
        critical_count = int(district.get("critical_settlements", 0) or 0)
        if problem_count:
            action = (
                f"Утвердить отдельную дорожную карту по {problem_count} проблемным "
                "СНП с владельцами, сроками и ежемесячным контролем."
            )
        elif four_g_share < 70:
            action = (
                f"Сформировать адресный план модернизации {weak_coverage} СНП "
                "до 4G с привязкой к операторам и срокам."
            )
        elif float(district.get("broadband_share", 0) or 0) < 85:
            action = (
                "Ускорить подключение оптики/МШПД и проверить устойчивость "
                "магистральных каналов."
            )
        else:
            action = (
                "Провести совместный drive-test операторов по точкам с "
                "максимальным числом обращений."
            )
        result.append(
            {
                "id": f"{district.get('district', 'district')}-{index}",
                "priority": "Высокий" if problem_count else priority,
                "district": district.get("district", "Не указан"),
                "title": (
                    "Приоритетный список проблемных населённых пунктов"
                    if problem_count
                    else "Требуется управленческое вмешательство"
                    if priority == "Высокий"
                    else "Нужен превентивный контроль качества"
                ),
                "rationale": (
                    f"{problem_count} проблемных СНП, из них {critical_count} "
                    f"критических; {district.get('appeals', 0)} обращений; 4G есть в "
                    f"{district.get('four_g_share', 0)}% СНП; индекс риска "
                    f"{district.get('risk_score', 0)}/100."
                ),
                "settlements": "группа СНП района",
                "problem": "; ".join(district.get("risk_reasons", []))
                or "инфраструктурный риск",
                "reason": "; ".join(district.get("risk_reasons", []))
                or "низкая доступность инфраструктуры",
                "action": action,
                "owner": "Управление цифровых технологий + операторы связи",
                "horizon": "30 дней" if priority == "Высокий" else "90 дней",
                "target": (
                    "Снизить индекс риска минимум на "
                    f"{15 if priority == 'Высокий' else 8} п.п."
                ),
                "expected_effect": "Повысить доступность 4G и снизить индекс риска района.",
                "assignee": "Управление цифровизации и операторы связи",
                "decision_group": (
                    "Критично"
                    if critical_count
                    else "Высокий приоритет"
                    if problem_count
                    else "Средний приоритет"
                ),
            }
        )
    return result


def load_clickhouse_payload() -> dict[str, Any]:
    settlements = query_rows(
        """
        SELECT *
        FROM gold.connectivity_points
        ORDER BY risk_score DESC, population DESC
        """
    )
    appeals = query_rows(
        """
        SELECT *
        FROM gold.internet_appeals
        ORDER BY start_date DESC
        """
    )
    districts = query_rows(
        """
        SELECT *
        FROM gold.district_connectivity
        ORDER BY risk_score DESC
        """
    )

    month_counter: Counter[str] = Counter()
    overdue_counter: Counter[str] = Counter()
    issue_counter: Counter[str] = Counter()
    for appeal in appeals:
        month_key = str(appeal.get("month_key", ""))
        if month_key:
            month_counter[month_key] += 1
            overdue_counter[month_key] += int(appeal.get("overdue", 0) or 0)
        issue_counter[str(appeal.get("topic", "Связь и интернет"))] += 1

    coverage_counter: Counter[str] = Counter()
    for settlement in settlements:
        coverage = str(settlement.get("coverage", "") or "")
        label = next(
            (f"{generation}G" for generation in (5, 4, 3, 2) if f"{generation}G" in coverage.upper()),
            "Без подтверждённого покрытия",
        )
        coverage_counter[label] += 1

    payload = deepcopy(load_local_payload())
    payload["meta"] = {
        **payload["meta"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_mode": "clickhouse",
        "warnings": [],
    }
    payload["settlements"] = settlements
    payload["appeals"] = appeals
    payload["districts"] = districts
    payload["monthly_trend"] = [
        {
            "month": month,
            "appeals": month_counter[month],
            "overdue": overdue_counter[month],
        }
        for month in sorted(month_counter)
    ]
    payload["issue_breakdown"] = [
        {"name": name, "value": value}
        for name, value in issue_counter.most_common()
    ]
    payload["coverage_breakdown"] = [
        {"name": name, "value": value}
        for name, value in coverage_counter.most_common()
    ]
    payload["recommendations"] = _recommendations(districts)
    payload["kpis"] = {
        "settlements": len(settlements),
        "population": sum(int(item.get("population", 0) or 0) for item in settlements),
        "broadband_share": round(
            100
            * sum(int(item.get("broadband", 0) or 0) for item in settlements)
            / max(len(settlements), 1),
            1,
        ),
        "four_g_share": round(
            100
            * sum(int(item.get("four_g_count", 0) or 0) > 0 for item in settlements)
            / max(len(settlements), 1),
            1,
        ),
        "appeals": len(appeals),
        "high_risk_districts": sum(
            item.get("risk_level") == "Высокий" for item in districts
        ),
        "high_risk_settlements": sum(
            item.get("risk_level") == "Высокий" for item in settlements
        ),
        "problem_settlements": sum(
            int(item.get("is_problem", 0) or 0) for item in settlements
        ),
        "critical_settlements": sum(
            int(item.get("critical_risk", 0) or 0) for item in settlements
        ),
        "ams_total": sum(
            int(item.get("tower_count", 0) or 0) for item in settlements
        ),
        "settlements_with_ams": sum(
            int(item.get("tower_count", 0) or 0) > 0 for item in settlements
        ),
    }
    payload["problem_settlements"] = sorted(
        [item for item in settlements if int(item.get("is_problem", 0) or 0)],
        key=lambda item: (
            -int(item.get("critical_risk", 0) or 0),
            -int(item.get("population", 0) or 0),
        ),
    )
    return payload
