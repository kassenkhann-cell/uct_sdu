import type { RiskLevel } from "../types";

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(value));

export const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;

export const formatMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "2-digit",
  }).format(new Date(year, month - 1, 1));
};

export const riskColor = (risk: RiskLevel) => {
  if (risk === "Высокий") return "#ef4444";
  if (risk === "Средний") return "#f59e0b";
  return "#22c55e";
};

export const riskClass = (risk: RiskLevel) => {
  if (risk === "Высокий") return "risk-high";
  if (risk === "Средний") return "risk-medium";
  return "risk-low";
};

export const operatorAvailable = (value: string) =>
  Boolean(value && value !== "-" && /[2-5]\s*G/i.test(value));

export const cleanDisplay = (value: unknown) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (/^(нет данных|требует уточнения|undefined|null)$/i.test(text)) return "";
  return text;
};

export const hasDisplayValue = (value: unknown) => Boolean(cleanDisplay(value));

export const yesNo = (condition: boolean) => (condition ? "есть" : "отсутствует");

export const operatorList = (item: {
  beeline: string;
  kcell: string;
  tele2: string;
}) =>
  [
    cleanDisplay(item.beeline) && `Beeline ${cleanDisplay(item.beeline)}`,
    cleanDisplay(item.kcell) && `Kcell ${cleanDisplay(item.kcell)}`,
    cleanDisplay(item.tele2) && `Tele2 / Altel ${cleanDisplay(item.tele2)}`,
  ]
    .filter(Boolean)
    .join(", ");
