from __future__ import annotations

import csv
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}


def inspect_csv(path: Path) -> dict:
    raw = path.read_bytes()[:262_144]
    encoding = "utf-8-sig"
    sample = raw.decode(encoding, errors="replace")
    if sample.count("`") > sample.count(",") * 4:
        delimiter = "`"
    else:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    with path.open("r", encoding=encoding, newline="", errors="replace") as handle:
        reader = csv.reader(handle, delimiter=delimiter, quotechar='"')
        rows = [row for _, row in zip(range(6), reader)]

    return {
        "file": path.name,
        "type": "csv",
        "size": path.stat().st_size,
        "encoding": encoding,
        "delimiter": delimiter,
        "sample_rows": rows,
    }


def column_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref)
    value = 0
    for char in letters.group(0) if letters else "A":
        value = value * 26 + ord(char) - 64
    return value - 1


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.findall(".//m:t", NS))
        for item in root.findall("m:si", NS)
    ]


def load_sheet_targets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relationships.findall("r:Relationship", REL_NS)
    }
    result: list[tuple[str, str]] = []
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        rel_id = sheet.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        target = targets[rel_id].lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        result.append((sheet.attrib["name"], target))
    return result


def parse_cell(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))

    value_node = cell.find("m:v", NS)
    if value_node is None or value_node.text is None:
        return ""
    value = value_node.text
    if cell_type == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError):
            return value
    return value


def inspect_xlsx(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        sheets = []
        for sheet_name, target in load_sheet_targets(archive):
            root = ET.fromstring(archive.read(target))
            sampled_rows = []
            for row in root.findall("m:sheetData/m:row", NS)[:18]:
                cells: list[str] = []
                for cell in row.findall("m:c", NS):
                    index = column_index(cell.attrib.get("r", "A1"))
                    if index >= 80:
                        continue
                    while len(cells) <= index:
                        cells.append("")
                    cells[index] = parse_cell(cell, shared_strings)
                sampled_rows.append(cells)
            sheets.append({"name": sheet_name, "sample_rows": sampled_rows})

    return {
        "file": path.name,
        "type": "xlsx",
        "size": path.stat().st_size,
        "sheets": sheets,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sources = []
    for path in sorted(DATA_DIR.iterdir()):
        if path.suffix.lower() == ".csv":
            sources.append(inspect_csv(path))
        elif path.suffix.lower() == ".xlsx":
            sources.append(inspect_xlsx(path))
    print(json.dumps(sources, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
