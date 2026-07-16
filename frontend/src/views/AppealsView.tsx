import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Clock3, MessageSquareText } from "lucide-react";
import type { Appeal } from "../types";
import { Panel } from "../components/Panel";
import { formatMonth, formatNumber } from "../lib/format";

interface AppealsViewProps {
  appeals: Appeal[];
  trend: Array<{ month: string; appeals: number; overdue: number }>;
  issues: Array<{ name: string; value: number }>;
  years: number[];
  year: string;
  onYearChange: (year: string) => void;
}

const tooltipStyle = {
  backgroundColor: "var(--card-elevated)",
  border: "1px solid var(--glass-border)",
  borderRadius: 12,
  color: "var(--text-main)",
};

export function AppealsView({
  appeals,
  trend,
  issues,
  years,
  year,
  onYearChange,
}: AppealsViewProps) {
  const overdue = appeals.filter((item) => item.overdue).length;
  const completed = appeals.filter((item) => /заверш|finished/i.test(item.status)).length;
  const active = appeals.length - completed;
  const recent = [...appeals]
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 12);
  const districtData = Object.entries(
    appeals.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.district] = (accumulator[item.district] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([district, value]) => ({ district, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="view-stack">
      <div className="appeals-local-filter">
        <div>
          <span className="eyebrow">Локальный фильтр</span>
          <strong>Период обращений</strong>
        </div>
        <select value={year} onChange={(event) => onYearChange(event.target.value)}>
          <option>Все годы</option>
          {years.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className="mini-stat-grid">
        <div className="mini-stat">
          <MessageSquareText size={19} />
          <span>Обращений по связи</span>
          <strong>{formatNumber(appeals.length)}</strong>
        </div>
        <div className="mini-stat">
          <Clock3 size={19} />
          <span>В работе / иной статус</span>
          <strong>{formatNumber(active)}</strong>
        </div>
        <div className="mini-stat">
          <AlertTriangle size={19} />
          <span>Просрочено</span>
          <strong>{formatNumber(overdue)}</strong>
        </div>
        <div className="mini-stat">
          <CheckCircle2 size={19} />
          <span>Завершено</span>
          <strong>{formatNumber(completed)}</strong>
        </div>
      </div>

      <div className="chart-grid">
        <Panel title="Помесячная динамика" eyebrow="2025–2026">
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="appealArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  stroke="var(--text-muted)"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={22}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => formatMonth(String(value))}
                />
                <Area
                  type="monotone"
                  dataKey="appeals"
                  name="Обращения"
                  fill="url(#appealArea)"
                  stroke="#60a5fa"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="overdue"
                  name="Просрочено"
                  fill="transparent"
                  stroke="#ef4444"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Основные темы" eyebrow="Классификация обращений">
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={issues.slice(0, 7)} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--text-muted)"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  stroke="var(--text-muted)"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="value"
                  name="Обращения"
                  fill="#3b82f6"
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title="Где население жалуется чаще"
        eyebrow="ТОП-10 районов по профильным обращениям"
      >
        <div className="appeals-district-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={districtData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
              <XAxis
                type="number"
                stroke="var(--text-muted)"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="district"
                width={125}
                stroke="var(--text-muted)"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="value"
                name="Обращения"
                fill="#2563eb"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Последние обращения" eyebrow="Персональные данные не отображаются">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Рег. номер</th>
                <th>Дата</th>
                <th>Район / локация</th>
                <th>Тема</th>
                <th>Подтема</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.appeal_id}>
                  <td>
                    <strong>{item.reg_number || item.appeal_id}</strong>
                  </td>
                  <td>{item.start_date.slice(0, 10) || "—"}</td>
                  <td>
                    {item.district}
                    <small>{item.settlement}</small>
                  </td>
                  <td>
                    <span className="topic-chip">{item.topic}</span>
                  </td>
                  <td className="cell-wide">{item.subissue}</td>
                  <td>
                    <span className={item.overdue ? "status-overdue" : "status-ok"}>
                      {item.overdue ? "Просрочено" : item.status || "Без статуса"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!recent.length && <div className="empty-state">По выбранному периоду обращения не найдены</div>}
      </Panel>
    </div>
  );
}
