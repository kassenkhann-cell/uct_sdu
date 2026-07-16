from __future__ import annotations

import csv
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

from inspect_sources import DATA_DIR, NS, load_shared_strings, load_sheet_targets, parse_cell


INTERNET_TERMS = (
    "интернет",
    "мобильн",
    "сотов",
    "качество связи",
    "услуг связи",
    "телефонной связи",
    "покрыти",
    "перебо",
    "широкополос",
    "3g",
    "4g",
    "5g",
    "байланыс",
)

EXCLUDED_TERMS = (
    "egov",
    "электронн",
    "цифровизац",
    "информационн",
    "государственн услуг",
    "интеграц",
)


def xlsx_rows(path: Path, sheet_name: str) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        target = dict(load_sheet_targets(archive))[sheet_name]
        root = ET.fromstring(archive.read(target))
        rows: list[list[str]] = []
        for row in root.findall("m:sheetData/m:row", NS):
            cells: list[str] = []
            for cell in row.findall("m:c", NS):
                ref = cell.attrib.get("r", "A1")
                letters = "".join(char for char in ref if char.isalpha())
                index = 0
                for char in letters:
                    index = index * 26 + ord(char.upper()) - 64
                index -= 1
                while len(cells) <= index:
                    cells.append("")
                cells[index] = parse_cell(cell, shared_strings)
            rows.append(cells)
        return rows


def analyze_appeals() -> dict:
    path = next(DATA_DIR.glob("*.csv"))
    category = Counter()
    issue = Counter()
    subissue = Counter()
    connectivity_category_issue = Counter()
    connectivity_category_subissue = Counter()
    district = Counter()
    matched = 0
    total = 0

    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="`", quotechar='"')
        for row in reader:
            total += 1
            category_value = (row.get("category") or "").strip()
            issue_value = (row.get("issue") or "").strip()
            subissue_value = (row.get("subissue") or "").strip()
            category[category_value] += 1
            issue[issue_value] += 1
            subissue[subissue_value] += 1
            if "СВЯЗЬ" in category_value.upper():
                connectivity_category_issue[issue_value] += 1
                connectivity_category_subissue[subissue_value] += 1

            topic = f"{issue_value} {subissue_value}".lower()
            is_match = any(term in topic for term in INTERNET_TERMS)
            is_excluded = any(term in topic for term in EXCLUDED_TERMS)
            if is_match and not is_excluded:
                matched += 1
                district[(row.get("raion") or row.get("loc_name") or "").strip()] += 1

    keyword_issues = [
        (name, count)
        for name, count in issue.most_common()
        if any(term in name.lower() for term in INTERNET_TERMS)
    ]
    keyword_subissues = [
        (name, count)
        for name, count in subissue.most_common()
        if any(term in name.lower() for term in INTERNET_TERMS)
    ]

    return {
        "total_rows": total,
        "matched_rows": matched,
        "top_categories": category.most_common(12),
        "keyword_issues": keyword_issues[:50],
        "keyword_subissues": keyword_subissues[:80],
        "connectivity_category_issues": connectivity_category_issue.most_common(),
        "connectivity_category_subissues": connectivity_category_subissue.most_common(),
        "matched_districts": district.most_common(),
    }


def analyze_workbooks() -> list[dict]:
    result = []
    for path in DATA_DIR.glob("*.xlsx"):
        with zipfile.ZipFile(path) as archive:
            sheet_names = [name for name, _ in load_sheet_targets(archive)]
        sheets = []
        for sheet_name in sheet_names:
            rows = xlsx_rows(path, sheet_name)
            sheets.append(
                {
                    "name": sheet_name,
                    "rows": len(rows),
                    "columns": max((len(row) for row in rows), default=0),
                    "header_candidates": rows[:3],
                }
            )
        result.append({"file": path.name, "sheets": sheets})
    return result


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    print(
        json.dumps(
            {"appeals": analyze_appeals(), "workbooks": analyze_workbooks()},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
