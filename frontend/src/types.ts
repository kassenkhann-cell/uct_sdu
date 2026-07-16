export type RiskLevel = "Высокий" | "Средний" | "Низкий";

export interface DashboardMeta {
  title: string;
  generated_at: string;
  period: string;
  source_mode: string;
  warnings: string[];
  filter_note: string;
  source_tables: string[];
}

export interface Settlement {
  kato: string;
  district: string;
  settlement: string;
  rural_county: string;
  latitude: number;
  longitude: number;
  population: number;
  households: number;
  coverage: string;
  beeline: string;
  kcell: string;
  tele2: string;
  fiber: string;
  satellite: string;
  plan: string;
  provider: string;
  potential: string;
  tower_count: number;
  tower_height: string;
  tower_coordinates: string;
  tower_holder: string;
  tower_funding: string;
  tower_cost: number;
  tower_power: string;
  operator_count: number;
  four_g_count: number;
  broadband: number;
  appeals: number;
  is_problem: number;
  critical_risk: number;
  problem_appeals: number;
  problem: string;
  problem_operator: string;
  recommendation: string;
  risk_score: number;
  risk_level: RiskLevel;
}

export interface Appeal {
  appeal_id: string;
  reg_number: string;
  district: string;
  settlement: string;
  kato: string;
  category: string;
  issue: string;
  subissue: string;
  status: string;
  overdue: number;
  start_date: string;
  year: number;
  month: number;
  month_key: string;
  topic: string;
}

export interface District {
  district: string;
  settlements: number;
  population: number;
  connected: number;
  broadband_share: number;
  four_g_share: number;
  risk_settlements: number;
  problem_settlements: number;
  critical_settlements: number;
  ams_count: number;
  settlements_with_ams: number;
  settlements_without_ams: number;
  satellite_settlements: number;
  appeals: number;
  overdue: number;
  appeals_per_10k: number;
  risk_score: number;
  risk_level: RiskLevel;
  planned: number;
  target_2030: number;
  data_completeness: string;
  risk_reasons: string[];
}

export interface Recommendation {
  id: string;
  priority: RiskLevel;
  district: string;
  title: string;
  rationale: string;
  settlements: string;
  problem: string;
  reason: string;
  action: string;
  owner: string;
  horizon: string;
  target: string;
  expected_effect: string;
  assignee: string;
  decision_group:
    | "Критично"
    | "Высокий приоритет"
    | "Средний приоритет"
    | "Быстрый эффект";
}

export interface TowerPoint {
  id: string;
  kato: string;
  district: string;
  settlement: string;
  latitude: number;
  longitude: number;
  height: number;
  holder: string;
  power: string;
  funding: string;
  operator_kcell: number;
  operator_beeline: number;
  operator_tele2: number;
}

export interface DashboardPayload {
  meta: DashboardMeta;
  kpis: {
    settlements: number;
    population: number;
    broadband_share: number;
    four_g_share: number;
    appeals: number;
    high_risk_districts: number;
    high_risk_settlements: number;
    problem_settlements: number;
    critical_settlements: number;
    ams_total: number;
    settlements_with_ams: number;
  };
  settlements: Settlement[];
  problem_settlements: Settlement[];
  appeals: Appeal[];
  districts: District[];
  tower_points: TowerPoint[];
  infrastructure_audit: {
    sheets_found: number;
    sheets_used: string[];
    rows: number;
    rows_with_ams: number;
    total_ams: number;
    mapped_tower_points: number;
    used_fields: string[];
    ignored_fields: string[];
  };
  monthly_trend: Array<{ month: string; appeals: number; overdue: number }>;
  issue_breakdown: Array<{ name: string; value: number }>;
  coverage_breakdown: Array<{ name: string; value: number }>;
  recommendations: Recommendation[];
}

export type TabId =
  | "overview"
  | "problems"
  | "appeals"
  | "ranking"
  | "ai";

export interface FiltersState {
  district: string;
  settlement: string;
  risk: string;
  operator: string;
  search: string;
}
