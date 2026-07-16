import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { FiltersState } from "../types";

interface FiltersPanelProps {
  filters: FiltersState;
  districts: string[];
  settlements: Array<{ value: string; label: string }>;
  resultCount: number;
  totalCount: number;
  kpiFilterLabel: string;
  onChange: (next: FiltersState) => void;
  onReset: () => void;
}

export function FiltersPanel({
  filters,
  districts,
  settlements,
  resultCount,
  totalCount,
  kpiFilterLabel,
  onChange,
  onReset,
}: FiltersPanelProps) {
  const set = (key: keyof FiltersState, value: string) => {
    if (key === "district") {
      onChange({ ...filters, district: value, settlement: "Все населённые пункты" });
      return;
    }
    onChange({ ...filters, [key]: value });
  };

  return (
    <aside className="filter-panel">
      <div className="filter-panel__title">
        <div>
          <SlidersHorizontal size={18} />
          <strong>Фильтры</strong>
        </div>
        <button
          className="filter-reset"
          type="button"
          onClick={onReset}
          aria-label="Сбросить фильтры"
          title="Сбросить"
        >
          <RotateCcw size={15} />
          Сбросить
        </button>
      </div>

      <label className="filter-search">
        <Search size={16} />
        <input
          value={filters.search}
          onChange={(event) => set("search", event.target.value)}
          placeholder="Поиск СНП, КАТО, технологии…"
        />
      </label>

      <label className="field">
        <span>Район</span>
        <select
          value={filters.district}
          onChange={(event) => set("district", event.target.value)}
        >
          <option>Все районы</option>
          {districts.map((district) => (
            <option key={district}>{district}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Населённый пункт</span>
        <select
          value={filters.settlement}
          onChange={(event) => set("settlement", event.target.value)}
        >
          <option>Все населённые пункты</option>
          {settlements.map((settlement) => (
            <option key={settlement.value} value={settlement.value}>
              {settlement.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Оператор / доступность</span>
        <select
          value={filters.operator}
          onChange={(event) => set("operator", event.target.value)}
        >
          <option>Все операторы</option>
          <option>Beeline</option>
          <option>Kcell</option>
          <option>Tele2 / Altel</option>
          <option>Без 4G</option>
          <option>Без мобильной связи</option>
        </select>
      </label>

      <label className="field">
        <span>Уровень риска</span>
        <select
          value={filters.risk}
          onChange={(event) => set("risk", event.target.value)}
        >
          <option>Все риски</option>
          <option>Высокий</option>
          <option>Средний</option>
          <option>Низкий</option>
        </select>
      </label>

      <div className="filter-note">
        <strong>Показано {resultCount} из {totalCount} СНП</strong>
        <span>
          {kpiFilterLabel
            ? `Дополнительно выбран показатель «${kpiFilterLabel}».`
            : "Список населённых пунктов обновляется после выбора района, оператора или риска."}
        </span>
      </div>
    </aside>
  );
}
