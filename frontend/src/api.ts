import type { DashboardPayload } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const FALLBACK_URL = `${import.meta.env.BASE_URL}generated/dashboard.json`;

export async function fetchDashboard(): Promise<DashboardPayload> {
  try {
    const response = await fetch(`${API_BASE}/dashboard/summary`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()) as DashboardPayload;
  } catch (apiError) {
    const fallback = await fetch(FALLBACK_URL);
    if (!fallback.ok) throw apiError;
    return (await fallback.json()) as DashboardPayload;
  }
}
