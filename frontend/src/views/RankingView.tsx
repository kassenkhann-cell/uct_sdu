import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { District } from "../types";
import { Panel } from "../components/Panel";
import {
  formatNumber,
  formatPercent,
  riskClass,
  riskColor,
} from "../lib/format";

interface RankingViewProps {
  districts: District[];
  selectedDistrict: string;
  onDistrictSelect: (district: string) => void;
}

interface DistrictAxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
  selectedDistrict: string;
  onSelect: (district: string) => void;
}

function DistrictAxisTick({
  x = 0,
  y = 0,
  payload,
  selectedDistrict,
  onSelect,
}: DistrictAxisTickProps) {
  const district = String(payload?.value || "");
  const active = district === selectedDistrict;
  return (
    <g
      transform={`translate(${x},${y})`}
      role="button"
      tabIndex={0}
      aria-label={`Выбрать район ${district}`}
      onClick={() => onSelect(district)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(district);
      }}
      style={{ cursor: "pointer" }}
    >
      <text
        x={-8}
        y={0}
        dy="0.32em"
        textAnchor="end"
        fill={active ? "var(--primary-blue)" : "var(--text-muted)"}
        fontSize={12}
        fontWeight={active ? 750 : 500}
      >
        {district}
      </text>
    </g>
  );
}

export function RankingView({
  districts,
  selectedDistrict,
  onDistrictSelect,
}: RankingViewProps) {
  const sorted = useMemo(
    () => [...districts].sort((a, b) => b.risk_score - a.risk_score),
    [districts],
  );
  const visibleDistricts = sorted.slice(0, 12);
  const selected = sorted.find((item) => item.district === selectedDistrict) || sorted[0];
  const chooseDistrict = (district: string) => {
    if (district) onDistrictSelect(district);
  };

  const explanation = selected
    ? [
        `${selected.problem_settlements} проблемных СНП`,
        `${selected.appeals} обращений по связи`,
        `${selected.settlements_without_ams} СНП без АМС`,
        `${formatPercent(100 - selected.four_g_share)} СНП без подтверждённого 4G`,
        `${selected.satellite_settlements} спутниковых решений`,
      ]
    : [];

  return (
    <div className="view-stack">
      <Panel
        title="Какой район хуже и почему"
        eyebrow="Индекс объясняется факторами риска, а не только цифрой"
      >
        <div className="ranking-layout">
          <div className="ranking-chart-column">
            <div className="ranking-picker">
              <label>
                <span>Выберите район</span>
                <select
                  value={selected?.district || ""}
                  onChange={(event) => chooseDistrict(event.target.value)}
                >
                  {visibleDistricts.map((item) => (
                    <option key={item.district} value={item.district}>
                      {item.district}
                    </option>
                  ))}
                </select>
              </label>
              <small>Или нажмите прямо на полосу графика</small>
            </div>

            <div className="ranking-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visibleDistricts}
                  layout="vertical"
                  margin={{ left: 16, right: 20 }}
                >
                  <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    stroke="var(--text-muted)"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="district"
                    width={120}
                    stroke="var(--text-muted)"
                    axisLine={false}
                    tickLine={false}
                    tick={(props) => (
                      <DistrictAxisTick
                        {...props}
                        selectedDistrict={selected?.district || ""}
                        onSelect={chooseDistrict}
                      />
                    )}
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in srgb, var(--primary-blue) 7%, transparent)" }}
                    contentStyle={{
                      backgroundColor: "var(--card-elevated)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: 12,
                      color: "var(--text-main)",
                    }}
                  />
                  <Bar
                    dataKey="risk_score"
                    name="Индекс риска"
                    radius={[0, 8, 8, 0]}
                    onClick={(_, index) => chooseDistrict(visibleDistricts[index]?.district || "")}
                  >
                    {visibleDistricts.map((item) => {
                      const isSelected = selected?.district === item.district;
                      return (
                        <Cell
                          key={item.district}
                          fill={riskColor(item.risk_level)}
                          opacity={isSelected ? 1 : 0.78}
                          stroke={isSelected ? "var(--primary-blue)" : "transparent"}
                          strokeWidth={isSelected ? 3 : 0}
                          style={{ cursor: "pointer" }}
                          onClick={() => chooseDistrict(item.district)}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {selected && (
            <aside className="ranking-explanation">
              <span className="eyebrow">Выбранный район</span>
              <h3>{selected.district}</h3>
              <span className={`risk-badge ${riskClass(selected.risk_level)}`}>
                индекс {selected.risk_score}
              </span>
              <p>Почему такой индекс риска:</p>
              <ul>
                {explanation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {selected.risk_reasons.length > 0 && (
                <div className="ranking-reasons">
                  {selected.risk_reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      </Panel>

      <Panel title="Рейтинг районов" eyebrow="Нажмите на строку, чтобы увидеть объяснение">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Район</th>
                <th>Проблемные СНП</th>
                <th>Обращения</th>
                <th>АМС</th>
                <th>Без АМС</th>
                <th>4G</th>
                <th>Спутник</th>
                <th>МШПД / ВОЛС</th>
                <th>Индекс</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, index) => (
                <tr
                  key={item.district}
                  className={selected?.district === item.district ? "selected-table-row" : ""}
                  onClick={() => chooseDistrict(item.district)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      chooseDistrict(item.district);
                    }
                  }}
                  tabIndex={0}
                >
                  <td>
                    <span className="rank-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <strong>{item.district}</strong>
                    <small>{item.settlements} СНП · {formatNumber(item.population)} жителей</small>
                  </td>
                  <td>{formatNumber(item.problem_settlements)}</td>
                  <td>{formatNumber(item.appeals)}</td>
                  <td>{formatNumber(item.ams_count)}</td>
                  <td>{formatNumber(item.settlements_without_ams)}</td>
                  <td>{formatPercent(item.four_g_share)}</td>
                  <td>{formatNumber(item.satellite_settlements)}</td>
                  <td>{formatPercent(item.broadband_share)}</td>
                  <td>
                    <span className={`risk-badge ${riskClass(item.risk_level)}`}>
                      {item.risk_score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
