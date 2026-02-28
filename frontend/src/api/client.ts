import type { EntityDetail, Neighborhood, Snapshot } from "../types";

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
