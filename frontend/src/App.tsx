import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  ClipboardList,
  Database,
  LayoutDashboard,
  MapPinned,
  MessageSquareText,
  Moon,
  Radar,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Sun,
  Trophy,
  UsersRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { fetchDashboard } from "./api";
import type {
  Appeal,
  DashboardPayload,
  FiltersState,
  Settlement,
  TabId,
} from "./types";
import { FiltersPanel } from "./components/FiltersPanel";
import { KpiCard } from "./components/KpiCard";
import { AssistantChat } from "./components/AssistantChat";
import { OverviewView } from "./views/OverviewView";
import { AppealsView } from "./views/AppealsView";
import { RankingView } from "./views/RankingView";
import { AIView } from "./views/AIView";
import { ProblematicView } from "./views/ProblematicView";
import {
  cleanDisplay,
  formatNumber,
  operatorAvailable,
} from "./lib/format";

type KpiFilter =
  | "all"
  | "without4g"
  | "withoutMobile"
  | "withoutAms"
  | "problems"
  | "withAppeals"
  | "critical"
  | "riskPopulation";

const ALL_DISTRICTS = "Все районы";
const ALL_SETTLEMENTS = "Все населённые пункты";
const ALL_RISKS = "Все риски";
const ALL_OPERATORS = "Все операторы";
const ALL_YEARS = "Все годы";

const tabs: Array<{
  id: TabId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "problems", label: "Проблемные НП", icon: AlertOctagon },
  { id: "appeals", label: "Обращения", icon: MessageSquareText },
  { id: "ranking", label: "Рейтинг районов", icon: Trophy },
  { id: "ai", label: "План действий", icon: ClipboardList },
];

const tabDescriptions: Record<TabId, string> = {
  overview: "Где проблемы: карта, районы риска и контекстное решение после выбора района или СНП.",
  problems: "Адресный перечень приоритетных населённых пунктов и основания для вмешательства.",
  appeals: "Где жители жалуются на интернет, мобильную связь, покрытие и перебои.",
  ranking: "Какой район хуже и почему он получил такой индекс риска.",
  ai: "Управленческий план: проблема, действие, ответственный, срок и ожидаемый эффект.",
};

const initialFilters: FiltersState = {
  district: ALL_DISTRICTS,
  settlement: ALL_SETTLEMENTS,
  risk: ALL_RISKS,
  operator: ALL_OPERATORS,
  search: "",
};

const kpiFilterLabels: Record<KpiFilter, string> = {
  all: "",
  without4g: "СНП без 4G",
  withoutMobile: "СНП без мобильной связи",
  withoutAms: "СНП без АМС",
  problems: "Проблемные СНП",
  withAppeals: "СНП с обращениями по связи",
  critical: "Критические СНП",
  riskPopulation: "Население в зоне риска",
};

function matchesSearch(values: unknown[], search: string) {
  if (!search.trim()) return true;
  const needle = search.trim().toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function aggregateTrend(appeals: Appeal[]) {
  const grouped = new Map<string, { month: string; appeals: number; overdue: number }>();
  for (const appeal of appeals) {
    const current = grouped.get(appeal.month_key) || {
      month: appeal.month_key,
      appeals: 0,
      overdue: 0,
    };
    current.appeals += 1;
    current.overdue += appeal.overdue;
    grouped.set(appeal.month_key, current);
  }
  return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateIssues(appeals: Appeal[]) {
  const grouped = new Map<string, number>();
  for (const appeal of appeals) {
    grouped.set(appeal.topic, (grouped.get(appeal.topic) || 0) + 1);
  }
  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function settlementKey(item: Pick<Settlement, "district" | "settlement">) {
  return `${item.district}::${item.settlement}`.toLowerCase();
}

function appealKey(item: Pick<Appeal, "district" | "settlement">) {
  return `${item.district}::${item.settlement}`.toLowerCase();
}

function matchesKpiFilter(item: Settlement, filter: KpiFilter) {
  if (filter === "all") return true;
  if (filter === "without4g") return item.four_g_count === 0;
  if (filter === "withoutMobile") return item.operator_count === 0;
  if (filter === "withoutAms") return item.tower_count === 0;
  if (filter === "problems") return Boolean(item.is_problem);
  if (filter === "withAppeals") return item.appeals > 0;
  if (filter === "critical") return Boolean(item.critical_risk);
  if (filter === "riskPopulation") return item.risk_level === "Высокий";
  return true;
}

function matchesRightFilters(item: Settlement, filters: FiltersState) {
  if (filters.district !== ALL_DISTRICTS && item.district !== filters.district) {
    return false;
  }
  if (
    filters.settlement !== ALL_SETTLEMENTS &&
    item.kato !== filters.settlement
  ) {
    return false;
  }
  if (filters.risk !== ALL_RISKS && item.risk_level !== filters.risk) {
    return false;
  }
  if (filters.operator === "Beeline" && !operatorAvailable(item.beeline)) {
    return false;
  }
  if (filters.operator === "Kcell" && !operatorAvailable(item.kcell)) {
    return false;
  }
  if (filters.operator === "Tele2 / Altel" && !operatorAvailable(item.tele2)) {
    return false;
  }
  if (filters.operator === "Без 4G" && item.four_g_count > 0) return false;
  if (filters.operator === "Без мобильной связи" && item.operator_count > 0) {
    return false;
  }
  return matchesSearch(
    [
      item.settlement,
      item.district,
      item.kato,
      item.coverage,
      item.beeline,
      item.kcell,
      item.tele2,
      item.problem,
    ],
    filters.search,
  );
}

export default function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("all");
  const [appealYear, setAppealYear] = useState<string>(ALL_YEARS);
  const [selected, setSelected] = useState<Settlement | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem("digital-radar-theme");
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("digital-radar-theme", theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    fetchDashboard()
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setSelected(null);
      })
      .catch((reason) => {
        if (alive) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось загрузить данные радара",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const districtsList = useMemo(
    () =>
      data
        ? [...new Set(data.settlements.map((item) => item.district))].sort((a, b) =>
            a.localeCompare(b, "ru"),
          )
        : [],
    [data],
  );

  const settlementOptions = useMemo(() => {
    if (!data) return [];
    const withoutSettlement = { ...filters, settlement: ALL_SETTLEMENTS, search: "" };
    return data.settlements
      .filter((item) => matchesRightFilters(item, withoutSettlement))
      .map((item) => ({
        value: item.kato,
        label: `${item.settlement} · КАТО ${item.kato}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [data, filters]);

  const years = useMemo(
    () =>
      data
        ? [...new Set(data.appeals.map((item) => item.year))].sort((a, b) => b - a)
        : [],
    [data],
  );

  const baseSettlements = useMemo(() => {
    if (!data) return [];
    return data.settlements.filter((item) => matchesRightFilters(item, filters));
  }, [data, filters]);

  const filteredSettlements = useMemo(
    () => baseSettlements.filter((item) => matchesKpiFilter(item, kpiFilter)),
    [baseSettlements, kpiFilter],
  );

  const visibleKatos = useMemo(
    () => new Set(filteredSettlements.map((item) => item.kato)),
    [filteredSettlements],
  );

  const visibleSettlementKeys = useMemo(
    () => new Set(filteredSettlements.map(settlementKey)),
    [filteredSettlements],
  );

  const shouldRestrictAppealsToVisible =
    kpiFilter !== "all" ||
    filters.settlement !== ALL_SETTLEMENTS ||
    filters.operator !== ALL_OPERATORS ||
    filters.risk !== ALL_RISKS;

  const filteredAppeals = useMemo(() => {
    if (!data) return [];
    const selectedSettlement = data.settlements.find(
      (item) => item.kato === filters.settlement,
    );
    return data.appeals.filter((item) => {
      if (filters.district !== ALL_DISTRICTS && item.district !== filters.district) {
        return false;
      }
      if (
        filters.settlement !== ALL_SETTLEMENTS &&
        item.kato !== filters.settlement &&
        !(
          selectedSettlement &&
          item.district === selectedSettlement.district &&
          item.settlement === selectedSettlement.settlement
        )
      ) {
        return false;
      }
      if (appealYear !== ALL_YEARS && String(item.year) !== appealYear) {
        return false;
      }
      if (
        shouldRestrictAppealsToVisible &&
        !visibleKatos.has(item.kato) &&
        !visibleSettlementKeys.has(appealKey(item))
      ) {
        return false;
      }
      return matchesSearch(
        [
          item.reg_number,
          item.district,
          item.settlement,
          item.issue,
          item.subissue,
          item.topic,
        ],
        filters.search,
      );
    });
  }, [
    appealYear,
    data,
    filters.district,
    filters.search,
    filters.settlement,
    shouldRestrictAppealsToVisible,
    visibleKatos,
    visibleSettlementKeys,
  ]);

  const filteredDistricts = useMemo(() => {
    if (!data) return [];
    const districtNames = new Set(filteredSettlements.map((item) => item.district));
    const restrictToVisible =
      filters.district !== ALL_DISTRICTS ||
      filters.settlement !== ALL_SETTLEMENTS ||
      filters.operator !== ALL_OPERATORS ||
      filters.risk !== ALL_RISKS ||
      filters.search.trim() ||
      kpiFilter !== "all";

    return data.districts.filter((item) => {
      if (filters.district !== ALL_DISTRICTS && item.district !== filters.district) {
        return false;
      }
      if (!districtNames.has(item.district)) return false;
      return true;
    }).map((item) => {
      if (!restrictToVisible) return item;
      const points = filteredSettlements.filter(
        (settlement) => settlement.district === item.district,
      );
      const settlements = points.length;
      return {
        ...item,
        settlements,
        population: points.reduce((sum, point) => sum + point.population, 0),
        broadband_share: settlements
          ? Math.round(1000 * points.filter((point) => point.broadband).length / settlements) / 10
          : 0,
        four_g_share: settlements
          ? Math.round(1000 * points.filter((point) => point.four_g_count > 0).length / settlements) / 10
          : 0,
        risk_settlements: points.filter((point) => point.risk_level === "Высокий").length,
        problem_settlements: points.filter((point) => point.is_problem).length,
        critical_settlements: points.filter((point) => point.critical_risk).length,
        ams_count: points.reduce((sum, point) => sum + point.tower_count, 0),
        settlements_with_ams: points.filter((point) => point.tower_count > 0).length,
        settlements_without_ams: points.filter((point) => point.tower_count === 0).length,
        satellite_settlements: points.filter((point) => {
          const value = cleanDisplay(point.satellite).toLowerCase();
          return Boolean(value && !["-", "нет", "0"].includes(value));
        }).length,
        appeals: points.reduce((sum, point) => sum + point.appeals, 0),
      };
    });
  }, [data, filteredSettlements, filters, kpiFilter]);

  const filteredTowerPoints = useMemo(() => {
    if (!data) return [];
    return data.tower_points.filter((item) => visibleKatos.has(item.kato));
  }, [data, visibleKatos]);

  const visibleRecommendations = useMemo(() => {
    if (!data) return [];
    const districtNames = new Set(filteredSettlements.map((item) => item.district));
    return data.recommendations.filter((item) => districtNames.has(item.district));
  }, [data, filteredSettlements]);

  const trend = useMemo(() => aggregateTrend(filteredAppeals), [filteredAppeals]);
  const issues = useMemo(() => aggregateIssues(filteredAppeals), [filteredAppeals]);

  const kpis = useMemo(() => {
    const without4g = baseSettlements.filter((item) => item.four_g_count === 0);
    const withoutMobile = baseSettlements.filter((item) => item.operator_count === 0);
    const withoutAms = baseSettlements.filter((item) => item.tower_count === 0);
    const problems = baseSettlements.filter((item) => item.is_problem);
    const withAppeals = baseSettlements.filter((item) => item.appeals > 0);
    const critical = baseSettlements.filter((item) => item.critical_risk);
    const riskPopulation = baseSettlements
      .filter((item) => item.risk_level === "Высокий")
      .reduce((sum, item) => sum + item.population, 0);

    return {
      settlements: baseSettlements.length,
      without4g: without4g.length,
      withoutMobile: withoutMobile.length,
      withoutAms: withoutAms.length,
      problems: problems.length,
      withAppeals: withAppeals.length,
      critical: critical.length,
      riskPopulation,
    };
  }, [baseSettlements]);

  useEffect(() => {
    if (!data) return;
    if (filters.settlement !== ALL_SETTLEMENTS) {
      const next =
        data.settlements.find(
          (item) =>
            item.kato === filters.settlement &&
            (filters.district === ALL_DISTRICTS ||
              item.district === filters.district),
        ) || null;
      setSelected(next);
      return;
    }
    if (selected && !visibleKatos.has(selected.kato)) {
      setSelected(null);
    }
  }, [data, filters.district, filters.settlement, selected, visibleKatos]);

  const handleSelect = (item: Settlement) => setSelected(item);

  const handleDistrictSelect = (district: string) => {
    setFilters((current) => ({
      ...current,
      district,
      settlement: ALL_SETTLEMENTS,
    }));
    setSelected(null);
  };

  const resetAllFilters = () => {
    setFilters(initialFilters);
    setKpiFilter("all");
    setAppealYear(ALL_YEARS);
    setSelected(null);
  };

  const handleFiltersChange = (next: FiltersState) => {
    if (!data) {
      setFilters(next);
      return;
    }
    const candidates = data.settlements.filter((item) =>
      matchesRightFilters(item, {
        ...next,
        settlement: ALL_SETTLEMENTS,
        search: "",
      }),
    );
    const settlementIsAvailable = candidates.some(
      (item) => item.kato === next.settlement,
    );
    setFilters({
      ...next,
      settlement:
        next.settlement === ALL_SETTLEMENTS || settlementIsAvailable
          ? next.settlement
          : ALL_SETTLEMENTS,
    });
    setSelected(null);
  };

  const toggleKpiFilter = (filter: KpiFilter) => {
    setKpiFilter((current) => (current === filter ? "all" : filter));
    setSelected(null);
  };

  if (error) {
    return (
      <main className="fatal-state">
        <Radar size={36} />
        <h1>Данные радара недоступны</h1>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Повторить загрузку
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-screen">
        <span className="radar-loader">
          <Radar size={38} />
        </span>
        <strong>Формируем цифровой радар…</strong>
        <p>Сопоставляем покрытие, АМС, ВОЛС, спутник и обращения жителей</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__icon">
            <Radar size={24} />
          </span>
          <div>
            <strong>Цифровой радар</strong>
            <span>Актюбинская область · связь и интернет</span>
          </div>
        </div>

        <div className="topbar__meta">
          <span className="source-badge">
            <Database size={15} />
            {data.meta.source_mode === "local-files" ? "Новые районные данные" : "Резервный набор"}
          </span>
          <span className="period-badge">{data.meta.period}</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => window.location.reload()}
            title="Обновить"
            aria-label="Обновить данные"
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Переключить тему"
            aria-label="Переключить тему"
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Разделы дашборда">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={17} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="page-heading">
        <div>
          <span className="eyebrow">Мониторинг инфраструктуры связи</span>
          <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
          <p>{tabDescriptions[activeTab]}</p>
        </div>
        <div className="updated-at">
          Данные обновлены{" "}
          {new Intl.DateTimeFormat("ru-RU", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(data.meta.generated_at))}
        </div>
      </div>

      <section className="kpi-grid kpi-grid--problem">
        <KpiCard
          label="Всего СНП"
          value={formatNumber(kpis.settlements)}
          note="в текущем контуре фильтров"
          icon={MapPinned}
          tone="blue"
          active={false}
          onClick={() => toggleKpiFilter("all")}
        />
        <KpiCard
          label="СНП без 4G"
          value={formatNumber(kpis.without4g)}
          note="нет подтверждённого 4G у операторов"
          icon={WifiOff}
          tone="yellow"
          active={kpiFilter === "without4g"}
          onClick={() => toggleKpiFilter("without4g")}
        />
        <KpiCard
          label="СНП без мобильной связи"
          value={formatNumber(kpis.withoutMobile)}
          note="операторы не подтверждены"
          icon={Wifi}
          tone="red"
          active={kpiFilter === "withoutMobile"}
          onClick={() => toggleKpiFilter("withoutMobile")}
        />
        <KpiCard
          label="СНП без АМС"
          value={formatNumber(kpis.withoutAms)}
          note="нет учтённой базовой станции"
          icon={RadioTower}
          tone="yellow"
          active={kpiFilter === "withoutAms"}
          onClick={() => toggleKpiFilter("withoutAms")}
        />
        <KpiCard
          label="Проблемных СНП"
          value={formatNumber(kpis.problems)}
          note="приоритетный список руководства"
          icon={AlertOctagon}
          tone="red"
          active={kpiFilter === "problems"}
          onClick={() => toggleKpiFilter("problems")}
        />
        <KpiCard
          label="СНП с обращениями"
          value={formatNumber(kpis.withAppeals)}
          note="жалобы по интернету и связи"
          icon={MessageSquareText}
          tone="yellow"
          active={kpiFilter === "withAppeals"}
          onClick={() => toggleKpiFilter("withAppeals")}
        />
        <KpiCard
          label="Критических СНП"
          value={formatNumber(kpis.critical)}
          note="проблемный СНП + обращение"
          icon={AlertOctagon}
          tone="red"
          active={kpiFilter === "critical"}
          onClick={() => toggleKpiFilter("critical")}
        />
        <KpiCard
          label="Население в зоне риска"
          value={`${formatNumber(kpis.riskPopulation)} чел.`}
          note="СНП высокого риска"
          icon={UsersRound}
          tone="red"
          active={kpiFilter === "riskPopulation"}
          onClick={() => toggleKpiFilter("riskPopulation")}
        />
      </section>

      {kpiFilter !== "all" && (
        <div className="active-filter-bar">
          <span>
            Активный KPI-фильтр: <strong>{kpiFilterLabels[kpiFilter]}</strong>
          </span>
          <button type="button" onClick={() => setKpiFilter("all")}>
            <RotateCcw size={14} />
            Сбросить фильтр
          </button>
        </div>
      )}

      <main className="dashboard-layout">
        <div className="dashboard-content">
          {activeTab === "overview" && filteredSettlements.length > 0 && (
            <OverviewView
              settlements={filteredSettlements}
              districts={filteredDistricts}
              towerPoints={filteredTowerPoints}
              recommendations={visibleRecommendations}
              selected={selected}
              selectedDistrict={filters.district}
              selectedSettlement={filters.settlement}
              onSelect={handleSelect}
              onDistrictSelect={handleDistrictSelect}
            />
          )}
          {activeTab !== "appeals" && filteredSettlements.length === 0 && (
            <div className="empty-filter-state">
              <strong>По выбранным условиям данных нет</strong>
              <span>Измените один из фильтров или сбросьте их, чтобы вернуться к общему обзору.</span>
              <button type="button" onClick={resetAllFilters}>Сбросить фильтры</button>
            </div>
          )}
          {activeTab === "problems" && filteredSettlements.length > 0 && (
            <ProblematicView
              settlements={filteredSettlements
                .filter((item) => item.is_problem)
                .sort(
                  (a, b) =>
                    b.critical_risk - a.critical_risk ||
                    Number(b.tower_count === 0) - Number(a.tower_count === 0) ||
                    b.risk_score - a.risk_score,
                )}
              selected={selected}
              onSelect={handleSelect}
            />
          )}
          {activeTab === "appeals" && (
            <AppealsView
              appeals={filteredAppeals}
              trend={trend}
              issues={issues}
              years={years}
              year={appealYear}
              onYearChange={setAppealYear}
            />
          )}
          {activeTab === "ranking" && filteredSettlements.length > 0 && (
            <RankingView
              districts={data.districts}
              selectedDistrict={
                filters.district === ALL_DISTRICTS ? "" : filters.district
              }
              onDistrictSelect={handleDistrictSelect}
            />
          )}
          {activeTab === "ai" && filteredSettlements.length > 0 && (
            <AIView
              recommendations={visibleRecommendations}
              districts={filteredDistricts}
            />
          )}
        </div>

        <FiltersPanel
          filters={filters}
          districts={districtsList}
          settlements={settlementOptions}
          resultCount={filteredSettlements.length}
          totalCount={data.settlements.length}
          kpiFilterLabel={kpiFilterLabels[kpiFilter]}
          onChange={handleFiltersChange}
          onReset={resetAllFilters}
        />
      </main>

      <AssistantChat />

      {data.meta.warnings.length > 0 && (
        <div className="data-warning">
          <strong>Часть источников заменена fallback-данными:</strong>{" "}
          {data.meta.warnings.map(cleanDisplay).filter(Boolean).join("; ")}
        </div>
      )}

      <footer>
        <span>Цифровой радар Актюбинской области</span>
        <span>Источники: Е-Өтініш, МШПД в СНП, АМС, операторы, ВОЛС и спутник</span>
      </footer>
    </div>
  );
}
