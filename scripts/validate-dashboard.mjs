import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(
  root,
  "frontend",
  "public",
  "generated",
  "dashboard.json",
);
const payload = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
const errors = [];

if (payload.meta?.source_mode !== "local-files") {
  errors.push("использован резервный набор вместо исходных файлов");
}
if (payload.meta?.warnings?.length) {
  errors.push(`предупреждения источников: ${payload.meta.warnings.join("; ")}`);
}
if (!payload.settlements?.length) errors.push("нет населённых пунктов");
if (!payload.appeals?.length) errors.push("нет обращений");
if (!payload.districts?.length) errors.push("нет районных итогов");

const settlementKatos = payload.settlements.map((item) => item.kato);
if (new Set(settlementKatos).size !== settlementKatos.length) {
  errors.push("обнаружены повторяющиеся КАТО");
}
const appealIds = payload.appeals.map((item) => item.appeal_id).filter(Boolean);
if (new Set(appealIds).size !== appealIds.length) {
  errors.push("обнаружены повторяющиеся обращения");
}
const towerIds = payload.tower_points.map((item) => item.id);
if (new Set(towerIds).size !== towerIds.length) {
  errors.push("обнаружены повторяющиеся точки АМС");
}

if (errors.length) {
  console.error(`Публикация остановлена:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Проверка пройдена: ${payload.settlements.length} СНП, ${payload.appeals.length} обращений, ${payload.tower_points.length} точек АМС.`,
);
