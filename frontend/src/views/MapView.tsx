import { RadioTower } from "lucide-react";
import type { Settlement, TowerPoint } from "../types";
import { DashboardMap } from "../components/DashboardMap";
import {
  cleanDisplay,
  formatNumber,
  operatorList,
  riskClass,
  yesNo,
} from "../lib/format";

interface MapViewProps {
  settlements: Settlement[];
  towerPoints: TowerPoint[];
  selected: Settlement | null;
  onSelect: (item: Settlement) => void;
  onDistrictSelect: (district: string) => void;
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const text = typeof value === "number" ? String(value) : cleanDisplay(value);
  if (!text) return null;
  return (
    <div>
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
}

function actionFor(selected: Settlement) {
  if (cleanDisplay(selected.recommendation)) return cleanDisplay(selected.recommendation);
  if (selected.tower_count === 0) {
    return "Определить площадку, балансодержателя и включить АМС в адресный план.";
  }
  if (selected.four_g_count === 0) {
    return "Согласовать модернизацию действующей АМС до 4G.";
  }
  return "Провести контрольный drive-test и сверить качество услуги с оператором.";
}

export function MapView({
  settlements,
  towerPoints,
  selected,
  onSelect,
  onDistrictSelect,
}: MapViewProps) {
  return (
    <section className="map-workbench map-workbench--full">
      <div className="map-workbench__map">
        <DashboardMap
          settlements={settlements}
          towerPoints={towerPoints}
          selected={selected}
          onSelect={onSelect}
          onDistrictSelect={onDistrictSelect}
          height={730}
        />
      </div>

      <aside className="selected-object-card selected-object-card--wide">
        <span className="eyebrow">Паспорт объекта</span>
        {selected ? (
          <>
            <div className="selected-object-card__head">
              <div>
                <h2>{selected.settlement}</h2>
                <p>{selected.district} · КАТО {selected.kato}</p>
              </div>
              <span className={`risk-badge ${riskClass(selected.risk_level)}`}>
                {selected.critical_risk ? "Критично" : selected.risk_score}
              </span>
            </div>

            <div className="object-facts">
              <Fact label="Население" value={formatNumber(selected.population)} />
              <Fact label="Дворы" value={selected.households > 0 ? formatNumber(selected.households) : ""} />
              <Fact label="Оператор" value={operatorList(selected) || "отсутствует"} />
              <Fact label="Технология связи" value={selected.coverage} />
              <Fact label="Наличие 4G" value={yesNo(selected.four_g_count > 0)} />
              <Fact label="АМС" value={`${selected.tower_count || 0}`} />
              <Fact label="Высота АМС" value={selected.tower_height && `${selected.tower_height} м`} />
              <Fact label="Координаты АМС" value={selected.tower_coordinates} />
              <Fact label="Балансодержатель" value={selected.tower_holder} />
              <Fact label="Электропитание" value={selected.tower_power} />
              <Fact label="Финансирование" value={selected.tower_funding} />
              <Fact
                label="Стоимость строительства"
                value={selected.tower_cost > 0 ? `${selected.tower_cost} млн тг` : ""}
              />
              <Fact label="ВОЛС / МШПД" value={selected.broadband ? cleanDisplay(selected.fiber) || "есть" : "отсутствует"} />
              <Fact label="Спутник" value={cleanDisplay(selected.satellite) || "отсутствует"} />
              <Fact label="План подключения" value={selected.plan} />
              <Fact label="Потенциал развития" value={selected.potential} />
              <Fact label="Обращения" value={selected.appeals || 0} />
            </div>

            <div className="object-action">
              <span>Что сделать</span>
              <strong>{actionFor(selected)}</strong>
            </div>
          </>
        ) : (
          <div className="empty-selection">
            <RadioTower size={26} />
            <p>Выберите населённый пункт на карте, чтобы открыть паспорт объекта.</p>
          </div>
        )}
      </aside>
    </section>
  );
}
