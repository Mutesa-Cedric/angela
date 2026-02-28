import type { AutopilotTarget, EntityDetail, Neighborhood, Snapshot } from "../types";

const BASE = import.meta.env.VITE_API_URL || "/api";

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const maybeBody = body as Record<string, unknown>;
  const detail = maybeBody.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const msg = (first as Record<string, unknown>).msg;
      if (typeof msg === "string") return msg;
    }
  }
  return fallback;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(body, `HTTP ${res.status}`));
  }
  return res.json() as Promise<T>;
}

export function getSnapshot(t: number): Promise<Snapshot> {
  return fetchJSON<Snapshot>(`${BASE}/snapshot?t=${t}`);
}

export function getEntity(id: string, t?: number, signal?: AbortSignal): Promise<EntityDetail> {
  const params = t !== undefined ? `?t=${t}` : "";
  return fetchJSON<EntityDetail>(`${BASE}/entity/${encodeURIComponent(id)}${params}`, signal ? { signal } : undefined);
}

export function getNeighbors(id: string, t: number, k: number = 1, signal?: AbortSignal): Promise<Neighborhood> {
  return fetchJSON<Neighborhood>(
    `${BASE}/neighbors?id=${encodeURIComponent(id)}&t=${t}&k=${k}`,
    signal ? { signal } : undefined,
  );
}

export function getAIExplanation(
  id: string,
  t: number,
  signal?: AbortSignal,
): Promise<{ entity_id: string; bucket: number; summary: string }> {
  return fetchJSON(`${BASE}/ai/explain/entity/${encodeURIComponent(id)}?t=${t}`, signal ? { signal } : undefined);
}

export function getStatus(): Promise<{ loaded: boolean; n_entities: number; n_transactions: number; n_buckets: number }> {
  return fetchJSON(`${BASE}/status`);
}

export interface AIWarmupStatus {
  status: "idle" | "running" | "completed" | "failed" | "disabled";
  run_id?: string | null;
  reason?: string | null;
  bucket?: number;
  partial?: boolean;
  progress?: number;
  max_seconds?: number;
  entities_total?: number;
  entities_done?: number;
  sar_total?: number;
  sar_done?: number;
  errors?: string[];
}

export function getAIWarmupStatus(): Promise<AIWarmupStatus> {
  return fetchJSON(`${BASE}/ai/warmup/status`);
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

export interface CSVPreviewStats {
  total_rows: number;
  unique_senders: number;
  unique_receivers: number;
  unique_entities: number;
  amount_min: number | null;
  amount_max: number | null;
  amount_mean: number | null;
  date_min: string | null;
  date_max: string | null;
  currencies: string[];
  labeled_count: number | null;
}

export interface CSVPreview {
  columns: string[];
  sample_rows: string[][];
  suggested_mapping: Record<string, string | null>;
  row_count: number;
  stats: CSVPreviewStats;
}

export async function previewCSV(file: File): Promise<CSVPreview> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload/preview`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Preview failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadMapped(file: File, mapping: Record<string, string>): Promise<{ status: string; n_entities: number; n_transactions: number; n_buckets: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload/mapped?mapping=${encodeURIComponent(JSON.stringify(mapping))}`, {
    method: "POST",
    body: form,
  });
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

export interface ClusterData {
  cluster_id: string;
  entity_ids: string[];
  risk_score: number;
  size: number;
}

export function getClusters(t: number): Promise<{ bucket: number; clusters: ClusterData[] }> {
  return fetchJSON(`${BASE}/clusters?t=${t}`);
}

export interface NLQResult {
  intent: string;
  params: Record<string, unknown>;
  interpretation: string;
  entity_ids: string[];
  edges: { from_id: string; to_id: string; amount: number }[];
  summary: string;
}

export async function queryNLQ(
  query: string,
  bucket: number,
  signal?: AbortSignal,
): Promise<NLQResult> {
  const res = await fetch(`${BASE}/nlq/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, bucket }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(body, `NLQ failed: HTTP ${res.status}`));
  }
  return res.json();
}

export interface AgentInvestigateRequest {
  query: string;
  bucket: number;
  include_sar: boolean;
  max_targets: number;
  profile: "fast" | "balanced" | "deep";
}

export interface AgentStepEvent {
  run_id: string;
  step_index: number;
  agent: string;
  detail: string;
  status: "running" | "completed" | "failed";
  error?: string;
}

export interface AgentInvestigateResult {
  run_id: string;
  status: "completed" | "failed";
  query: string;
  bucket: number;
  profile: "fast" | "balanced" | "deep";
  intent: string;
  params: Record<string, unknown>;
  interpretation: string;
  research: {
    entity_ids: string[];
    edges?: { from_id: string; to_id: string; amount: number }[];
    edges_preview?: { from_id: string; to_id: string; amount: number }[];
    summary: string;
    total_targets_found: number;
  };
  analysis: {
    top_entity_id: string | null;
    average_risk: number;
    high_risk_count: number;
    detector_counts: Record<string, number>;
    highlights?: {
      entity_id: string;
      risk_score: number;
      top_reason: string;
      summary: string;
    }[];
  };
  reporting: {
    narrative: string;
    sar?: {
      entity_id: string;
      narrative: string;
    } | null;
  };
}

export async function runAgentInvestigation(
  payload: AgentInvestigateRequest,
  signal?: AbortSignal,
): Promise<AgentInvestigateResult> {
  const res = await fetch(`${BASE}/agent/investigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(body, `Agent investigate failed: HTTP ${res.status}`));
  }
  return res.json();
}

export function getAgentRun(runId: string): Promise<Record<string, unknown>> {
  return fetchJSON(`${BASE}/agent/run/${encodeURIComponent(runId)}`);
}

export interface AgentRunSummary {
  run_id: string;
  status: "running" | "completed" | "failed";
  query: string;
  bucket: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
  progress: number;
  current_step: string | null;
  profile: "fast" | "balanced" | "deep";
}

export function listAgentRuns(limit: number = 10): Promise<{ runs: AgentRunSummary[] }> {
  return fetchJSON(`${BASE}/agent/runs?compact=true&limit=${limit}`);
}

export interface AgentPreset {
  id: string;
  label: string;
  query: string;
  profile: "fast" | "balanced" | "deep";
  include_sar: boolean;
  max_targets: number;
}

export function getAgentPresets(): Promise<{ presets: AgentPreset[] }> {
  return fetchJSON(`${BASE}/agent/presets`);
}

export interface CounterfactualResult {
  entity_id: string;
  bucket: number;
  original: { risk_score: number; reasons: { detector: string; detail: string; weight: number }[]; evidence: Record<string, unknown> };
  counterfactual: { risk_score: number; reasons: { detector: string; detail: string; weight: number }[]; evidence: Record<string, unknown> };
  removed_edges: { from_id: string; to_id: string; amount: number; reason: string }[];
  delta: { risk_score: number; tx_count_removed: number };
}

export async function getCounterfactual(id: string, t: number): Promise<CounterfactualResult> {
  const res = await fetch(`${BASE}/counterfactual/entity/${encodeURIComponent(id)}?t=${t}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Counterfactual failed: HTTP ${res.status}`);
  }
  return res.json();
}
