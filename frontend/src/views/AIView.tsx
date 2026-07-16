import {
  Building2,
  CalendarClock,
  CheckCircle2,
  RadioTower,
  ShieldAlert,
  UserRoundCog,
} from "lucide-react";
import type { District, Recommendation } from "../types";
import { formatNumber, riskClass } from "../lib/format";

interface AIViewProps {
  recommendations: Recommendation[];
  districts: District[];
}

export function AIView({ recommendations, districts }: AIViewProps) {
  const critical = recommendations.filter(
    (item) => item.decision_group === "Критично",
  ).length;
  const high = recommendations.filter(
    (item) => item.decision_group === "Высокий приоритет",
  ).length;
  const ams = districts.reduce((sum, item) => sum + item.ams_count, 0);

  return (
    <div className="view-stack">
      <div className="decision-intro">
        <span className="eyebrow">Рабочий контур исполнения</span>
        <h2>Приоритетный план по районам</h2>
        <p>Действия упорядочены по риску, состоянию покрытия и наличию АМС. Карточки можно использовать как основу для протокольных поручений.</p>
      </div>
      <div className="mini-stat-grid mini-stat-grid--three">
        <div className="mini-stat">
          <ShieldAlert size={19} />
          <span>Критично</span>
          <strong>{formatNumber(critical)}</strong>
        </div>
        <div className="mini-stat">
          <RadioTower size={19} />
          <span>Высокий приоритет</span>
          <strong>{formatNumber(high)}</strong>
        </div>
        <div className="mini-stat">
          <Building2 size={19} />
          <span>АМС учтено в расчёте</span>
          <strong>{formatNumber(ams)}</strong>
        </div>
      </div>

      <div className="recommendation-list recommendation-list--wide">
        {recommendations.map((item, index) => (
          <article key={item.id} className="recommendation-card action-card">
            <div className="recommendation-card__top">
              <div>
                <span className={`priority-chip ${riskClass(item.priority)}`}>
                  {item.decision_group}
                </span>
                <h3>
                  {index + 1}. {item.district}
                </h3>
                <p>{item.settlements}</p>
              </div>
              <span className={`risk-badge ${riskClass(item.priority)}`}>
                {districts.find((district) => district.district === item.district)
                  ?.risk_score ?? 0}
              </span>
            </div>

            <dl className="action-card__grid">
              <dt>Проблема</dt>
              <dd>{item.problem}</dd>
              <dt>Причина</dt>
              <dd>{item.reason}</dd>
              <dt>Действие</dt>
              <dd>{item.action}</dd>
              <dt>Ответственный</dt>
              <dd>
                <UserRoundCog size={14} />
                {item.assignee}
              </dd>
              <dt>Срок</dt>
              <dd>
                <CalendarClock size={14} />
                {item.horizon}
              </dd>
              <dt>Ожидаемый эффект</dt>
              <dd>
                <CheckCircle2 size={14} />
                {item.expected_effect}
              </dd>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
