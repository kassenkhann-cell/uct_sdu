import { ArrowUpRight } from "lucide-react";
import type { Settlement } from "../types";
import {
  cleanDisplay,
  formatNumber,
  operatorList,
  riskClass,
  yesNo,
} from "../lib/format";

interface ProblematicViewProps {
  settlements: Settlement[];
  selected: Settlement | null;
  onSelect: (item: Settlement) => void;
}

function detailFor(item: Settlement) {
  const noMobile = item.operator_count === 0;
  const no4g = item.four_g_count === 0;
  const noAms = item.tower_count === 0;
  const satellite = cleanDisplay(item.satellite);

  const problem = cleanDisplay(item.problem) ||
    (noMobile
      ? "Нет мобильного покрытия."
      : no4g
        ? "Нет 4G."
        : "Повышенный риск качества связи.");

  const reason = noAms
    ? "Отсутствует базовая станция / АМС."
    : no4g
      ? "Инфраструктура есть, но 4G не подтверждён."
      : satellite
        ? "Связь зависит от спутникового решения."
        : "Нужна проверка качества услуги.";

  const action = cleanDisplay(item.recommendation) ||
    (noAms
      ? "Установить АМС и включить СНП в план строительства базовой станции."
      : no4g
        ? "Модернизировать действующую АМС до 4G."
        : "Провести drive-test и зафиксировать корректирующие действия оператора.");

  return {
    problem,
    reason,
    action,
    owner: "Управление цифровизации + оператор",
    deadline: "до конца 2026 года",
    effect: `Закрытие проблемы связи для ${formatNumber(item.population)} жителей.`,
  };
}

export function ProblematicView({
  settlements,
  selected,
  onSelect,
}: ProblematicViewProps) {
  if (!settlements.length) {
    return (
      <div className="empty-filter-state">
        <strong>В выбранном срезе нет приоритетных СНП</strong>
        <span>Общий набор данных доступен, но ни один населённый пункт не входит в проблемный перечень при текущих фильтрах.</span>
      </div>
    );
  }

  return (
    <div className="problem-only-view">
      <div className="table-wrap">
        <table className="problem-table">
          <thead>
            <tr>
              <th>Район / СНП</th>
              <th>Население</th>
              <th>Проблема</th>
              <th>Оператор</th>
              <th>4G</th>
              <th>ВОЛС</th>
              <th>Спутник</th>
              <th>АМС</th>
              <th>Обращения</th>
              <th>Риск</th>
              <th>Подробное решение</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {settlements.map((item) => {
              const detail = detailFor(item);
              return (
                <tr
                  key={item.kato}
                  className={[
                    item.critical_risk ? "critical-table-row" : "",
                    selected?.kato === item.kato ? "selected-table-row" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td>
                    <strong>{item.settlement}</strong>
                    <small>{item.district} · КАТО {item.kato}</small>
                  </td>
                  <td>{formatNumber(item.population)}</td>
                  <td className="cell-readable">{detail.problem}</td>
                  <td className="cell-readable">{operatorList(item) || "отсутствует"}</td>
                  <td>{yesNo(item.four_g_count > 0)}</td>
                  <td>{item.broadband ? cleanDisplay(item.fiber) || "есть" : "отсутствует"}</td>
                  <td>{cleanDisplay(item.satellite) || "отсутствует"}</td>
                  <td>
                    <strong>{item.tower_count || 0}</strong>
                    {cleanDisplay(item.tower_holder) && (
                      <small>{cleanDisplay(item.tower_holder)}</small>
                    )}
                  </td>
                  <td>
                    {formatNumber(item.problem_appeals || item.appeals || 0)}
                  </td>
                  <td>
                    <span
                      className={
                        item.critical_risk
                          ? "critical-chip"
                          : `risk-badge ${riskClass(item.risk_level)}`
                      }
                    >
                      {item.critical_risk ? "Критический" : item.risk_level}
                    </span>
                  </td>
                  <td className="problem-solution-cell">
                    <dl>
                      <dt>Причина</dt>
                      <dd>{detail.reason}</dd>
                      <dt>Что сделать</dt>
                      <dd>{detail.action}</dd>
                      <dt>Ответственный</dt>
                      <dd>{detail.owner}</dd>
                      <dt>Срок</dt>
                      <dd>{detail.deadline}</dd>
                      <dt>Эффект</dt>
                      <dd>{detail.effect}</dd>
                    </dl>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-label={`Выбрать ${item.settlement}`}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!settlements.length && (
        <div className="empty-state">По выбранным фильтрам проблемные СНП не найдены</div>
      )}
    </div>
  );
}
