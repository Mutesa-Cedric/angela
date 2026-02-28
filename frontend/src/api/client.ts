import type { AutopilotTarget, EntityDetail, Neighborhood, Snapshot } from "../types";

const BASE = "/api";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getSnapshot(t: number): Promise<Snapshot> {
  return fetchJSON<Snapshot>(`${BASE}/snapshot?t=${t}`);
}

export function getEntity(id: string, t?: number): Promise<EntityDetail> {
  const params = t !== undefined ? `?t=${t}` : "";
  return fetchJSON<EntityDetail>(`${BASE}/entity/${encodeURIComponent(id)}${params}`);
}

export function getNeighbors(id: string, t: number, k: number = 1): Promise<Neighborhood> {
  return fetchJSON<Neighborhood>(
    `${BASE}/neighbors?id=${encodeURIComponent(id)}&t=${t}&k=${k}`,
  );
}

export function getAIExplanation(id: string, t: number): Promise<{ entity_id: string; bucket: number; summary: string }> {
  return fetchJSON(`${BASE}/ai/explain/entity/${encodeURIComponent(id)}?t=${t}`);
}

export function getStatus(): Promise<{ loaded: boolean; n_entities: number; n_transactions: number; n_buckets: number }> {
  return fetchJSON(`${BASE}/status`);
}

export async function uploadFile(file: File): Promise<{ status: string; n_entities: number; n_transactions: number; n_buckets: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function loadSample(): Promise<{ status: string; n_entities: number; n_transactions: number; n_buckets: number }> {
  const res = await fetch(`${BASE}/load-sample`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Load failed: HTTP ${res.status}`);
  }
  return res.json();
}

export function getAutopilotTargets(t: number): Promise<{ bucket: number; targets: AutopilotTarget[] }> {
  return fetchJSON(`${BASE}/autopilot/targets?t=${t}`);
}

export interface SARResponse {
  entity_id: string;
  bucket: number;
  narrative: string;
  payload: Record<string, unknown>;
}

export async function generateSAR(id: string, t: number): Promise<SARResponse> {
  const res = await fetch(`${BASE}/ai/sar/entity/${encodeURIComponent(id)}?t=${t}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `SAR generation failed: HTTP ${res.status}`);
  }
  return res.json();
}

export interface DashboardData {
  bucket: number;
  kpis: {
    high_risk_entities: number;
    new_anomalies: number;
    cluster_count: number;
    cross_border_ratio: number;
    total_entities: number;
    total_transactions: number;
  };
  trend: { bucket: number; total_risk: number; high_risk_count: number; entity_count: number }[];
  heatmap: { jurisdiction: number; avg_risk: number; entity_count: number; high_risk_count: number }[];
}

export function getDashboard(t: number): Promise<DashboardData> {
  return fetchJSON<DashboardData>(`${BASE}/dashboard?t=${t}`);
}
