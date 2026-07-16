import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "frontend", "public", "generated", "dashboard.json");
const outputDir = path.resolve(process.argv[2] || path.join(root, ".build", "clickhouse-seed"));

const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const connectivityFields = [
  "kato", "district", "settlement", "rural_county", "latitude", "longitude",
  "population", "households", "coverage", "beeline", "kcell", "tele2", "fiber",
  "satellite", "plan", "provider", "potential", "tower_count", "tower_height",
  "tower_coordinates", "tower_holder", "tower_funding", "tower_cost", "tower_power",
  "operator_count", "four_g_count", "broadband", "appeals", "is_problem",
  "critical_risk", "problem_appeals", "problem", "problem_operator", "recommendation",
  "risk_score", "risk_level",
];

const appealFields = [
  "appeal_id", "reg_number", "district", "settlement", "kato", "category", "issue",
  "subissue", "status", "overdue", "start_date", "year", "month", "month_key", "topic",
];

const districtFields = [
  "district", "settlements", "population", "connected", "broadband_share", "four_g_share",
  "risk_settlements", "problem_settlements", "critical_settlements", "ams_count",
  "settlements_with_ams", "settlements_without_ams", "satellite_settlements", "appeals",
  "overdue", "appeals_per_10k", "risk_score", "risk_level", "planned", "target_2030",
  "data_completeness", "risk_reasons",
];

const numericFields = new Set([
  "latitude", "longitude", "population", "households", "tower_count", "tower_cost",
  "operator_count", "four_g_count", "broadband", "appeals", "is_problem",
  "critical_risk", "problem_appeals", "risk_score", "overdue", "year", "month",
  "settlements", "connected", "broadband_share", "four_g_share", "risk_settlements",
  "problem_settlements", "critical_settlements", "ams_count", "settlements_with_ams",
  "settlements_without_ams", "satellite_settlements", "appeals_per_10k", "planned",
  "target_2030",
]);

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => {
    const value = row[field];
    if (field === "risk_reasons" && Array.isArray(value)) return [field, value.join("; ")];
    return [field, value ?? (numericFields.has(field) ? 0 : "")];
  }));
}

function writeJsonEachRow(filename, rows, fields) {
  const content = rows.map((row) => JSON.stringify(pick(row, fields))).join("\n") + "\n";
  fs.writeFileSync(path.join(outputDir, filename), content, "utf8");
}

fs.mkdirSync(outputDir, { recursive: true });
writeJsonEachRow("connectivity_points.jsonl", payload.settlements, connectivityFields);
writeJsonEachRow("internet_appeals.jsonl", payload.appeals, appealFields);
writeJsonEachRow("district_connectivity.jsonl", payload.districts, districtFields);

const manifest = {
  generated_at: payload.meta.generated_at,
  source: "frontend/public/generated/dashboard.json",
  tables: {
    "gold.connectivity_points": payload.settlements.length,
    "gold.internet_appeals": payload.appeals.length,
    "gold.district_connectivity": payload.districts.length,
  },
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest));
