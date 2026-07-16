import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const dataDir = path.resolve("data");
const source = fs
  .readdirSync(dataDir)
  .filter((name) => name.toLowerCase().endsWith(".xlsx"))
  .map((name) => ({ name, size: fs.statSync(path.join(dataDir, name)).size }))
  .sort((a, b) => b.size - a.size)[0];

const workbook = XLSX.readFile(path.join(dataDir, source.name), {
  cellStyles: true,
  cellFormula: true,
  cellNF: true,
  sheetRows: 0,
});

const result = workbook.SheetNames.map((name) => {
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const rowMeta = sheet["!rows"] || [];
  const hiddenRows = rowMeta
    .map((meta, index) => (meta?.hidden ? index + 1 : null))
    .filter(Boolean);

  const styleCounts = new Map();
  for (const [ref, cell] of Object.entries(sheet)) {
    if (ref.startsWith("!")) continue;
    const styleId = cell?.s?.fill?.fgColor?.rgb
      ? `fill:${cell.s.fill.fgColor.rgb}`
      : cell?.s?.fill?.fgColor?.indexed !== undefined
        ? `indexed:${cell.s.fill.fgColor.indexed}`
        : cell?.s?.fill?.patternType
          ? `pattern:${cell.s.fill.patternType}`
          : "no-fill";
    styleCounts.set(styleId, (styleCounts.get(styleId) || 0) + 1);
  }

  return {
    name,
    ref: sheet["!ref"],
    autofilter: sheet["!autofilter"] || null,
    row_count: rows.length,
    non_empty_rows: rows.filter((row) => row.some((value) => String(value).trim())).length,
    hidden_row_count: hiddenRows.length,
    hidden_rows: hiddenRows.slice(0, 300),
    style_counts: [...styleCounts.entries()],
    first_rows: rows.slice(0, 5),
    last_rows: rows.slice(-5),
  };
});

console.log(JSON.stringify({ file: source.name, sheets: result }, null, 2));
