import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { ChevronDown, ChevronUp, Layers3 } from "lucide-react";
import type { Settlement, TowerPoint } from "../types";
import {
  cleanDisplay,
  formatNumber,
  hasDisplayValue,
  operatorList,
  riskClass,
  riskColor,
  yesNo,
} from "../lib/format";

interface DashboardMapProps {
  settlements: Settlement[];
  towerPoints?: TowerPoint[];
  selected?: Settlement | null;
  onSelect?: (settlement: Settlement) => void;
  onDistrictSelect?: (district: string) => void;
  height?: number;
  compactLayers?: boolean;
}

interface LayerState {
  settlements: boolean;
  problems: boolean;
  towers: boolean;
  appeals: boolean;
  broadband: boolean;
  highRisk: boolean;
  boundaries: boolean;
}

interface BoundaryPolygon {
  id: string;
  name: string;
  type: "region" | "district";
  color: string;
  positions: Array<[number, number]>;
}

const DISTRICT_BOUNDARY_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#fb7185",
  "#facc15",
  "#34d399",
  "#60a5fa",
  "#f97316",
  "#c084fc",
  "#2dd4bf",
  "#f472b6",
  "#84cc16",
  "#38bdf8",
  "#f59e0b",
];

function colorForName(name: string) {
  const index = [...name].reduce(
    (sum, letter) => sum + letter.charCodeAt(0),
    0,
  );
  return DISTRICT_BOUNDARY_COLORS[index % DISTRICT_BOUNDARY_COLORS.length];
}

function MapFocus({ selected }: { selected?: Settlement | null }) {
  const map = useMap();

  useEffect(() => {
    if (selected) {
      map.flyTo(
        [selected.latitude, selected.longitude],
        Math.max(map.getZoom(), 10),
        { duration: 0.7 },
      );
    }
  }, [map, selected]);

  return null;
}

function isValidCoordinate(item: Pick<Settlement, "latitude" | "longitude">) {
  return (
    Number.isFinite(item.latitude) &&
    Number.isFinite(item.longitude) &&
    item.latitude >= 45 &&
    item.latitude <= 55 &&
    item.longitude >= 50 &&
    item.longitude <= 65
  );
}

function convexHull(points: Array<[number, number]>) {
  const sorted = [...new Map(points.map(([lat, lng]) => [`${lat}:${lng}`, [lat, lng] as [number, number]])).values()]
    .map(([lat, lng]) => ({ x: lng, y: lat }))
    .sort((a, b) => a.x - b.x || a.y - b.y);

  if (sorted.length < 3) return [];

  const cross = (
    origin: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(
    (point) => [point.y, point.x] as [number, number],
  );
}

function expandPolygon(points: Array<[number, number]>, factor: number) {
  if (points.length < 3) return points;
  const center = points.reduce(
    (accumulator, [lat, lng]) => ({
      lat: accumulator.lat + lat / points.length,
      lng: accumulator.lng + lng / points.length,
    }),
    { lat: 0, lng: 0 },
  );
  return points.map(([lat, lng]) => [
    center.lat + (lat - center.lat) * factor,
    center.lng + (lng - center.lng) * factor,
  ] as [number, number]);
}

function buildBoundaries(settlements: Settlement[]) {
  const validSettlements = settlements.filter(isValidCoordinate);
  const byDistrict = new Map<string, Array<[number, number]>>();

  for (const item of validSettlements) {
    const points = byDistrict.get(item.district) || [];
    points.push([item.latitude, item.longitude]);
    byDistrict.set(item.district, points);
  }

  const districtBoundaries: BoundaryPolygon[] = [...byDistrict.entries()]
    .map(([district, points]) => ({
      id: `district-${district}`,
      name: district,
      type: "district" as const,
      color: colorForName(district),
      positions: expandPolygon(convexHull(points), 1.08),
    }))
    .filter((item) => item.positions.length >= 3);

  const regionPositions = expandPolygon(
    convexHull(validSettlements.map((item) => [item.latitude, item.longitude])),
    1.04,
  );

  const regionBoundary: BoundaryPolygon[] =
    regionPositions.length >= 3
      ? [
          {
            id: "region-aktobe",
            name: "Актюбинская область",
            type: "region",
            color: "#e0f2fe",
            positions: regionPositions,
          },
        ]
      : [];

  return [...regionBoundary, ...districtBoundaries];
}

function OptionalRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const text = typeof value === "number" ? String(value) : cleanDisplay(value);
  if (!text) return null;
  return (
    <>
      <span>{label}</span>
      <b>{text}</b>
    </>
  );
}

function recommendationFor(item: Settlement) {
  if (cleanDisplay(item.recommendation)) return cleanDisplay(item.recommendation);
  if (item.tower_count === 0) {
    return "Определить площадку АМС и включить СНП в адресный план базовой станции.";
  }
  if (item.four_g_count === 0) {
    return "Модернизировать существующую инфраструктуру до 4G.";
  }
  if (item.appeals > 0) {
    return "Провести drive-test и проверить качество услуги у операторов.";
  }
  return "Держать на мониторинге по индексу риска.";
}

function SettlementDetails({ item }: { item: Settlement }) {
  const operators = operatorList(item);

  return (
    <div className="map-popup">
      <div className="map-popup__head">
        <div>
          <strong>{item.settlement}</strong>
          <span>{item.district}</span>
        </div>
        <span className={`risk-badge ${riskClass(item.risk_level)}`}>
          {item.critical_risk ? "Критично" : item.risk_score}
        </span>
      </div>

      {item.is_problem ? (
        <div className={`problem-callout ${item.critical_risk ? "critical" : ""}`}>
          <strong>
            {item.critical_risk ? "Критический риск" : "Проблемный СНП"}
          </strong>
          {hasDisplayValue(item.problem) && <span>{cleanDisplay(item.problem)}</span>}
        </div>
      ) : null}

      <div className="map-popup__grid">
        <OptionalRow label="Район" value={item.district} />
        <OptionalRow label="Населённый пункт" value={item.settlement} />
        <OptionalRow label="Население" value={formatNumber(item.population || 0)} />
        <OptionalRow label="Оператор" value={operators || "отсутствует"} />
        <OptionalRow label="Технология связи" value={item.coverage} />
        <OptionalRow label="АМС" value={item.tower_count || 0} />
        <OptionalRow label="ВОЛС / МШПД" value={item.broadband ? cleanDisplay(item.fiber) || "есть" : "отсутствует"} />
        <OptionalRow label="Спутник" value={hasDisplayValue(item.satellite) ? item.satellite : "отсутствует"} />
        <OptionalRow label="Обращения" value={item.appeals || 0} />
        <OptionalRow label="Уровень риска" value={item.risk_level} />
        <OptionalRow label="Балансодержатель" value={item.tower_holder} />
        <OptionalRow label="Питание" value={item.tower_power} />
        <OptionalRow label="Финансирование" value={item.tower_funding} />
        <OptionalRow
          label="Стоимость"
          value={item.tower_cost > 0 ? `${item.tower_cost} млн тг` : ""}
        />
        <OptionalRow label="План" value={item.plan} />
        <OptionalRow label="Потенциал" value={item.potential} />
      </div>

      <div className="map-recommendation">
        <span>Краткая рекомендация</span>
        <strong>{recommendationFor(item)}</strong>
      </div>
    </div>
  );
}

function HoverDetails({ item }: { item: Settlement }) {
  const operators = operatorList(item) || "отсутствует";

  return (
    <div className="map-tooltip map-tooltip--rich">
      <strong>{item.settlement}</strong>
      <span>{item.district}</span>
      <dl>
        <dt>Население</dt>
        <dd>{formatNumber(item.population)}</dd>
        <dt>Оператор</dt>
        <dd>{operators}</dd>
        <dt>Технология</dt>
        <dd>{cleanDisplay(item.coverage)}</dd>
        <dt>АМС</dt>
        <dd>{item.tower_count || 0}</dd>
        <dt>ВОЛС</dt>
        <dd>{yesNo(Boolean(item.broadband))}</dd>
        <dt>Спутник</dt>
        <dd>{yesNo(hasDisplayValue(item.satellite))}</dd>
        <dt>Обращения</dt>
        <dd>{item.appeals || 0}</dd>
        <dt>Риск</dt>
        <dd>{item.critical_risk ? "Критический" : item.risk_level}</dd>
      </dl>
      <em>{recommendationFor(item)}</em>
    </div>
  );
}

export function DashboardMap({
  settlements,
  towerPoints = [],
  selected,
  onSelect,
  onDistrictSelect,
  height = 430,
  compactLayers = false,
}: DashboardMapProps) {
  const [layers, setLayers] = useState<LayerState>({
    settlements: true,
    problems: true,
    towers: true,
    appeals: false,
    broadband: false,
    highRisk: true,
    boundaries: true,
  });
  const [layersCollapsed, setLayersCollapsed] = useState(false);
  const [hoveredBoundary, setHoveredBoundary] = useState<string | null>(null);

  const layerOptions: Array<{
    key: keyof LayerState;
    label: string;
    count: number;
  }> = useMemo(
    () => [
      {
        key: "boundaries",
        label: "Границы области и районов",
        count: new Set(settlements.map((item) => item.district)).size,
      },
      { key: "settlements", label: "Все СНП", count: settlements.length },
      {
        key: "problems",
        label: "Проблемные СНП — красный маркер",
        count: settlements.filter((item) => item.is_problem).length,
      },
      {
        key: "towers",
        label: "АМС / базовые станции — голубой",
        count: towerPoints.length,
      },
      {
        key: "appeals",
        label: "Есть обращения жителей",
        count: settlements.filter((item) => item.appeals > 0).length,
      },
      {
        key: "broadband",
        label: "ВОЛС / МШПД",
        count: settlements.filter((item) => item.broadband).length,
      },
      {
        key: "highRisk",
        label: "Высокий риск — жёлтый контур",
        count: settlements.filter((item) => item.risk_level === "Высокий").length,
      },
    ],
    [settlements, towerPoints.length],
  );

  const boundaries = useMemo(() => buildBoundaries(settlements), [settlements]);

  const toggleLayer = (key: keyof LayerState) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="map-block">
      <div className="map-shell" style={{ height }}>
      <MapContainer
        center={[49.95, 57.25]}
        zoom={6}
        minZoom={5}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles"
        />
        <MapFocus selected={selected} />

        {layers.boundaries &&
          boundaries.map((boundary) => (
            <Polygon
              key={boundary.id}
              positions={boundary.positions}
              interactive={boundary.type === "district"}
              eventHandlers={
                boundary.type === "district"
                  ? {
                      mouseover: () => setHoveredBoundary(boundary.id),
                      mouseout: () => setHoveredBoundary(null),
                      click: () => onDistrictSelect?.(boundary.name),
                    }
                  : undefined
              }
              pathOptions={{
                color: boundary.type === "region" ? "#f0f9ff" : boundary.color,
                fillColor: boundary.type === "region" ? "#38bdf8" : boundary.color,
                fillOpacity:
                  boundary.type === "region"
                    ? 0.035
                    : hoveredBoundary === boundary.id
                      ? 0.2
                      : 0.075,
                opacity:
                  boundary.type === "region"
                    ? 0.96
                    : hoveredBoundary === boundary.id
                      ? 1
                      : 0.88,
                weight:
                  boundary.type === "region"
                    ? 3.4
                    : hoveredBoundary === boundary.id
                      ? 3.2
                      : 2.1,
                dashArray: boundary.type === "region" ? undefined : "7 5",
                className:
                  boundary.type === "region"
                    ? "region-boundary-line"
                    : "district-boundary-line",
              }}
            >
              {boundary.type === "district" && (
                <Tooltip
                  sticky
                  direction="top"
                  className="district-boundary-tooltip"
                >
                  <strong>{boundary.name}</strong>
                  <span>Кликните, чтобы отфильтровать район</span>
                </Tooltip>
              )}
            </Polygon>
          ))}

        {layers.settlements &&
          settlements.map((item) => {
            const active = selected?.kato === item.kato;
            return (
              <CircleMarker
                key={`settlement-${item.kato}`}
                center={[item.latitude, item.longitude]}
                radius={active ? 10 : Math.min(8, 4 + Math.sqrt(item.population) / 28)}
                pathOptions={{
                  color: active ? "#fff" : riskColor(item.risk_level),
                  fillColor: riskColor(item.risk_level),
                  fillOpacity: item.is_problem ? 0.42 : 0.58,
                  weight: active ? 3 : 1.2,
                }}
                eventHandlers={{ click: () => onSelect?.(item) }}
              >
                <Tooltip direction="top" offset={[0, -5]} opacity={0.98}>
                  <HoverDetails item={item} />
                </Tooltip>
                <Popup minWidth={330}>
                  <SettlementDetails item={item} />
                </Popup>
              </CircleMarker>
            );
          })}

        {layers.problems &&
          settlements
            .filter((item) => item.is_problem)
            .map((item) => (
              <Fragment key={`problem-${item.kato}`}>
                <CircleMarker
                  center={[item.latitude, item.longitude]}
                  radius={item.critical_risk ? 15 : 12}
                  interactive={false}
                  pathOptions={{
                    color: "#ef4444",
                    fillColor: "#ef4444",
                    fillOpacity: 0.08,
                    opacity: 0.9,
                    weight: item.critical_risk ? 3 : 2,
                    dashArray: item.critical_risk ? "4 3" : "2 4",
                    className: item.critical_risk
                      ? "critical-map-marker"
                      : "problem-map-halo",
                  }}
                />
                <CircleMarker
                  center={[item.latitude, item.longitude]}
                  radius={item.critical_risk ? 9 : 7}
                  pathOptions={{
                    color: "#fff",
                    fillColor: "#ef4444",
                    fillOpacity: 0.96,
                    weight: 2,
                  }}
                  eventHandlers={{ click: () => onSelect?.(item) }}
                >
                  <Tooltip direction="top" offset={[0, -5]} opacity={0.98}>
                    <HoverDetails item={item} />
                  </Tooltip>
                  <Popup minWidth={330}>
                    <SettlementDetails item={item} />
                  </Popup>
                </CircleMarker>
              </Fragment>
            ))}

        {layers.highRisk &&
          settlements
            .filter((item) => item.risk_level === "Высокий" && !item.is_problem)
            .map((item) => (
              <CircleMarker
                key={`risk-${item.kato}`}
                center={[item.latitude, item.longitude]}
                radius={10}
                interactive={false}
                pathOptions={{
                  color: "#f59e0b",
                  fillColor: "#f59e0b",
                  fillOpacity: 0.06,
                  weight: 2,
                  dashArray: "3 4",
                }}
              />
            ))}

        {layers.appeals &&
          settlements
            .filter((item) => item.appeals > 0)
            .map((item) => (
              <CircleMarker
                key={`appeal-${item.kato}`}
                center={[item.latitude, item.longitude]}
                radius={5 + Math.min(8, Math.sqrt(item.appeals))}
                pathOptions={{
                  color: "#c084fc",
                  fillColor: "#a855f7",
                  fillOpacity: 0.7,
                  weight: 2,
                }}
                eventHandlers={{ click: () => onSelect?.(item) }}
              >
                <Tooltip>
                  {item.appeals} обращ. жителей · {item.settlement}
                </Tooltip>
              </CircleMarker>
            ))}

        {layers.broadband &&
          settlements
            .filter((item) => item.broadband)
            .map((item) => (
              <CircleMarker
                key={`fiber-${item.kato}`}
                center={[item.latitude, item.longitude]}
                radius={4}
                pathOptions={{
                  color: "#38bdf8",
                  fillColor: "#38bdf8",
                  fillOpacity: 0.9,
                  weight: 1,
                }}
                eventHandlers={{ click: () => onSelect?.(item) }}
              >
                <Tooltip>
                  ВОЛС / МШПД · {cleanDisplay(item.fiber) || item.settlement}
                </Tooltip>
              </CircleMarker>
            ))}

        {layers.towers &&
          towerPoints.map((tower) => (
            <CircleMarker
              key={`tower-${tower.id}`}
              center={[tower.latitude, tower.longitude]}
              radius={5}
              pathOptions={{
                color: "#fff",
                fillColor: "#06b6d4",
                fillOpacity: 0.95,
                weight: 1.5,
              }}
            >
              <Tooltip direction="top">АМС · {tower.settlement}</Tooltip>
              <Popup minWidth={250}>
                <div className="tower-popup">
                  <strong>АМС · {tower.settlement}</strong>
                  <span>{tower.district}</span>
                  <dl>
                    {tower.height > 0 && (
                      <>
                        <dt>Высота</dt>
                        <dd>{tower.height} м</dd>
                      </>
                    )}
                    {hasDisplayValue(tower.holder) && (
                      <>
                        <dt>Балансодержатель</dt>
                        <dd>{cleanDisplay(tower.holder)}</dd>
                      </>
                    )}
                    {hasDisplayValue(tower.power) && (
                      <>
                        <dt>Электропитание</dt>
                        <dd>{cleanDisplay(tower.power)}</dd>
                      </>
                    )}
                    {hasDisplayValue(tower.funding) && (
                      <>
                        <dt>Финансирование</dt>
                        <dd>{cleanDisplay(tower.funding)}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>

      <div
        className={[
          "map-layer-control",
          compactLayers ? "compact" : "",
          layersCollapsed ? "is-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          className="map-layer-control__toggle"
          type="button"
          onClick={() => setLayersCollapsed((current) => !current)}
          aria-expanded={!layersCollapsed}
          aria-label={layersCollapsed ? "Развернуть слои карты" : "Свернуть слои карты"}
        >
          <span>
            <Layers3 size={14} /> Слои карты
          </span>
          {layersCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>

        {!layersCollapsed && (
          <div className="map-layer-control__body">
            {layerOptions.map((layer) => (
              <label key={layer.key}>
                <input
                  type="checkbox"
                  checked={layers[layer.key]}
                  onChange={() => toggleLayer(layer.key)}
                />
                <span>{layer.label}</span>
                <b>{formatNumber(layer.count)}</b>
              </label>
            ))}
          </div>
        )}
      </div>

    </div>

      <div className="map-legend map-legend--human">
        <span><i className="legend-dot low" /> зелёный — низкий риск</span>
        <span><i className="legend-dot medium" /> жёлтый — средний риск</span>
        <span><i className="legend-dot high" /> красный — высокий риск</span>
        <span><i className="legend-dot problem" /> красная точка — проблемный СНП</span>
        <span><i className="legend-dot tower" /> голубой — АМС</span>
        <span><i className="legend-line boundary" /> контур — границы области и районов</span>
        <span>размер точки = население</span>
      </div>
    </div>
  );
}
