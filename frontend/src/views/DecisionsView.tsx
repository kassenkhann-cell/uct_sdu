import {
  AlertOctagon,
  Building2,
  CalendarClock,
  CheckCircle2,
  RadioTower,
  UserRoundCog,
  Zap,
} from "lucide-react";
import type { Recommendation } from "../types";

interface DecisionsViewProps {
  recommendations: Recommendation[];
}

const groups: Array<{
  key: Recommendation["decision_group"];
  title: string;
  icon: typeof AlertOctagon;
}> = [
  { key: "Критично", title: "Критично", icon: AlertOctagon },
  { key: "Высокий приоритет", title: "Высокий приоритет", icon: RadioTower },
  { key: "Средний приоритет", title: "Средний приоритет", icon: Building2 },
  { key: "Быстрый эффект", title: "Быстрый эффект", icon: Zap },
];

export function DecisionsView({ recommendations }: DecisionsViewProps) {
  return (
    <div className="view-stack">
      <div className="decision-intro">
        <span className="eyebrow">Вопрос руководству</span>
        <h2>Какие решения нужно принять сейчас?</h2>
        <p>
          Карточки отсортированы по критичности: совпадение инфраструктурной
          проблемы с обращениями, отсутствие АМС, низкое покрытие и возможность
          быстрого результата.
        </p>
      </div>

      <div className="decision-columns">
        {groups.map((group) => {
          const Icon = group.icon;
          const items = recommendations.filter(
            (item) => item.decision_group === group.key,
          );
          return (
            <section key={group.key} className="decision-group">
              <div className="decision-group__title">
                <Icon size={18} />
                <strong>{group.title}</strong>
                <span>{items.length}</span>
              </div>
              {items.length ? (
                items.map((item) => (
                  <article key={item.id} className="decision-card">
                    <div>
                      <span className="decision-card__district">{item.district}</span>
                      <h3>{item.settlements}</h3>
                    </div>
                    <p>
                      <strong>Проблема:</strong> {item.problem}
                    </p>
                    <p>
                      <strong>Решение:</strong> {item.action}
                    </p>
                    <div className="decision-card__meta">
                      <span>
                        <UserRoundCog size={14} /> {item.assignee}
                      </span>
                      <span>
                        <CalendarClock size={14} /> {item.horizon}
                      </span>
                    </div>
                    <div className="decision-card__effect">
                      <CheckCircle2 size={15} />
                      <span>{item.expected_effect}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="decision-empty">Нет действий в этой категории</div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
