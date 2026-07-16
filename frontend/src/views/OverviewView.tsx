import { useMemo } from "react";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import type {
  District,
  Recommendation,
  Settlement,
  TowerPoint,
} from "../types";
import { DashboardMap } from "../components/DashboardMap";
import { Panel } from "../components/Panel";
import {
  cleanDisplay,
  formatNumber,
  formatPercent,
  riskClass,
  riskColor,
} from "../lib/format";

interface OverviewViewProps {
  settlements: Settlement[];
  districts: District[];
  towerPoints: TowerPoint[];
  recommendations: Recommendation[];
  selected: Settlement | null;
  selectedDistrict: string;
  selectedSettlement: string;
  onSelect: (item: Settlement) => void;
  onDistrictSelect: (district: string) => void;
}

function settlementDecision(item: Settlement) {
  const noAms = item.tower_count === 0;
  const no4g = item.four_g_count === 0;
  const noMobile = item.operator_count === 0;
  const problem = cleanDisplay(item.problem) ||
    (noMobile
      ? "Нет мобильного покрытия."
      : no4g
        ? "Нет устойчивого 4G."
        : item.appeals > 0
          ? "Есть обращения жителей по качеству связи."
          : "Повышенный индекс риска.");

  const reason = noAms
    ? "Отсутствует учтённая АМС."
    : no4g
      ? "Есть инфраструктура, но 4G не подтверждён."
      : cleanDisplay(item.satellite)
        ? "Зависимость от спутникового решения."
        : "Требуется проверка качества услуги на местности.";

  const action = cleanDisplay(item.recommendation) ||
    (noAms
      ? "Установить АМС и включить СНП в план строительства базовой станции."
      : no4g
        ? "Модернизировать действующую АМС до 4G."
        : "Провести drive-test и закрепить корректирующие действия с оператором.");

  const effect = noMobile || no4g
    ? `Закрытие проблемы связи для ${formatNumber(item.population)} жителей.`
    : "Снижение индекса риска и количества повторных обращений.";

  return {
    title: `${item.district} · ${item.settlement}`,
    problem,
    reason,
    action,
    effect,
    owner: "Управление цифровизации + оператор связи",
    deadline: "до конца 2026 года",
  };
}

function districtDecision(district: District, recommendation?: Recommendation) {
  const problem = `${district.problem_settlements} проблемных СНП; ${district.settlements_without_ams} СНП без АМС; ${district.appeals} обращений.`;
  const reason = district.risk_reasons.length
    ? district.risk_reasons.join("; ")
    : "Индекс риска сформирован по покрытию, АМС, обращениям и спутниковым решениям.";

  return {
    title: district.district,
    problem,
    reason,
    action:
      recommendation?.action ||
      `Сформировать адресный план по ${district.settlements_without_ams} СНП без АМС и проверить 4G-покрытие.`,
    effect:
      recommendation?.expected_effect ||
      "Снижение индекса риска района и сокращение числа СНП без устойчивой связи.",
    owner: recommendation?.assignee || "Управление цифровизации + районный акимат",
    deadline: recommendation?.horizon || "30 дней",
  };
}

export function OverviewView({
  settlements,
  districts,
  towerPoints,
  recommendations,
  selected,
  selectedDistrict,
  selectedSettlement,
  onSelect,
  onDistrictSelect,
}: OverviewViewProps) {
  const topDistricts = useMemo(
    () => [...districts].sort((a, b) => b.risk_score - a.risk_score).slice(0, 5),
    [districts],
  );

  const decision = useMemo(() => {
    if (selected) return settlementDecision(selected);
    if (selectedDistrict !== "Все районы") {
      const district = districts.find((item) => item.district === selectedDistrict);
      if (!district) return null;
      return districtDecision(
        district,
        recommendations.find((item) => item.district === district.district),
      );
    }
    if (selectedSettlement !== "Все населённые пункты") {
      const settlement = settlements.find(
        (item) => item.kato === selectedSettlement,
      );
      return settlement ? settlementDecision(settlement) : null;
    }
    return null;
  }, [districts, recommendations, selected, selectedDistrict, selectedSettlement, settlements]);

  return (
    <div className="view-stack">
      <div className="overview-hero">
        <Panel
          title="Где сейчас главные проблемы"
          eyebrow={`${formatNumber(settlements.length)} СНП · ${formatNumber(towerPoints.length)} АМС с координатами`}
          className="map-panel"
        >
          <DashboardMap
            settlements={settlements}
            towerPoints={towerPoints}
            selected={selected}
            onSelect={onSelect}
            onDistrictSelect={onDistrictSelect}
            height={520}
            compactLayers
          />
        </Panel>

        <Panel title="Быстрое понимание по районам" eyebrow="ТОП-5 по индексу риска">
          <div className="risk-pulse-list">
            {topDistricts.map((district, index) => (
              <article key={district.district} className="risk-pulse-item">
                <span className="rank-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="risk-pulse-item__body">
                  <div>
                    <strong>{district.district}</strong>
                    <span>
                      {district.problem_settlements} проблемных СНП ·{" "}
                      {district.settlements_without_ams} без АМС
                    </span>
                  </div>
                  <span className={`risk-badge ${riskClass(district.risk_level)}`}>
                    {district.risk_score}
                  </span>
                </div>
                <div className="risk-progress">
                  <i
                    style={{
                      width: `${district.risk_score}%`,
                      background: riskColor(district.risk_level),
                    }}
                  />
                </div>
                <div className="risk-pulse-item__meta">
                  <span>4G: {formatPercent(district.four_g_share)}</span>
                  <span>{district.appeals} обращений</span>
                </div>
                <button
                  className="inline-link"
                  type="button"
                  onClick={() => onDistrictSelect(district.district)}
                >
                  Показать район <ArrowUpRight size={14} />
                </button>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      {decision && (
        <Panel title="Карточка управленческого решения" eyebrow="Формируется после выбора района или СНП">
          <div className="ai-decision">
            <ClipboardCheck size={22} />
            <div>
              <h3>{decision.title}</h3>
              <dl>
                <dt>Проблема</dt>
                <dd>{decision.problem}</dd>
                <dt>Причина</dt>
                <dd>{decision.reason}</dd>
                <dt>Рекомендуемое решение</dt>
                <dd>{decision.action}</dd>
                <dt>Ответственный</dt>
                <dd>{decision.owner}</dd>
                <dt>Срок</dt>
                <dd>{decision.deadline}</dd>
                <dt>Ожидаемый эффект</dt>
                <dd>{decision.effect}</dd>
              </dl>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
