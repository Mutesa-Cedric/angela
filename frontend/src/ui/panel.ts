import type { EntityDetail, EntityEvidence, Neighborhood } from "../types";
import { riskColorCSS } from "../graph/NodeLayer";

const panel = document.getElementById("entity-panel") as HTMLDivElement;
const panelContent = document.getElementById("panel-content") as HTMLDivElement;
const panelClose = document.getElementById("panel-close") as HTMLButtonElement;

let onCloseCallback: (() => void) | null = null;

panelClose.addEventListener("click", () => {
  hide();
  onCloseCallback?.();
});

export function onClose(cb: () => void): void {
  onCloseCallback = cb;
}

export function show(entity: EntityDetail, neighborhood?: Neighborhood): void {
  panel.classList.add("open");

  const riskPct = (entity.risk_score * 100).toFixed(0);
  const riskCSS = riskColorCSS(entity.risk_score);

  // --- Badges ---
  const badgesHTML = `
    <div class="stat-row">
      <span class="badge">${entity.type}</span>
      <span class="badge">Bank ${entity.bank}</span>
      <span class="badge">${entity.kyc_level} KYC</span>
    </div>`;

  // --- Risk score with large number ---
  const riskHTML = `
    <div class="risk-score">
      <label>Risk Score</label>
      <div class="risk-number" style="color:${riskCSS}">${riskPct}%</div>
      <div class="risk-bar">
        <div class="risk-fill" style="width:${riskPct}%"></div>
      </div>
    </div>`;

  // --- Activity stats ---
  const activityHTML = entity.activity
    ? `<div class="stat-row">
        <span>In: ${entity.activity.in_count} tx ($${entity.activity.in_sum.toLocaleString()})</span>
        <span>Out: ${entity.activity.out_count} tx ($${entity.activity.out_sum.toLocaleString()})</span>
      </div>`
    : "";

  // --- Risk attribution bar ---
  const attrHTML = buildAttributionBar(entity.reasons);

  // --- Evidence breakdown ---
  const evidenceHTML = buildEvidenceCards(entity.evidence);

  // --- Flagged transactions ---
  const flaggedHTML = buildFlaggedTx(entity.evidence.flagged_tx_ids);

  // --- Connected entities ---
  const connectedHTML = buildConnectedEntities(neighborhood);

  panelContent.innerHTML = `
    <div class="entity-id">${entity.id}</div>
    ${badgesHTML}
    ${riskHTML}
    ${activityHTML}
    ${attrHTML}
    ${evidenceHTML}
    ${flaggedHTML}
    ${connectedHTML}
    <div class="ai-section">
      <h3>AI Analysis</h3>
      <div id="ai-summary" class="ai-summary muted">Loading AI summary...</div>
    </div>
  `;
}

/** Horizontal stacked bar showing detector weight contributions. */
function buildAttributionBar(reasons: EntityDetail["reasons"]): string {
  if (reasons.length === 0) return "";

  const totalWeight = reasons.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return "";

  const detectorColors: Record<string, string> = {
    velocity: "#4488ff",
    structuring: "#ffaa00",
    circular_flow: "#ff4466",
  };

  const segments = reasons
    .map((r) => {
      const pct = ((r.weight / totalWeight) * 100).toFixed(1);
      const color = detectorColors[r.detector] ?? "#888";
      return `<div class="attr-segment" style="width:${pct}%;background:${color}" title="${r.detector}: ${pct}%"></div>`;
    })
    .join("");

  const labels = reasons
    .map((r) => {
      const color = detectorColors[r.detector] ?? "#888";
      const pct = ((r.weight / totalWeight) * 100).toFixed(0);
      return `<span class="attr-label"><span class="attr-dot" style="background:${color}"></span>${r.detector} ${pct}%</span>`;
    })
    .join("");

  return `
    <div class="attribution">
      <h3>Risk Attribution</h3>
      <div class="attr-bar">${segments}</div>
      <div class="attr-labels">${labels}</div>
    </div>`;
}

/** Per-detector evidence cards with actual numbers. */
function buildEvidenceCards(evidence: EntityEvidence): string {
  const cards: string[] = [];

  if (evidence.velocity) {
    const v = evidence.velocity;
    cards.push(`
      <div class="evidence-card">
        <div class="evidence-title" style="color:#4488ff">Velocity</div>
        <div class="evidence-stats">
          <div class="evidence-stat">
            <span class="evidence-value">${v.tx_count}</span>
            <span class="evidence-label">transactions</span>
          </div>
          <div class="evidence-stat">
            <span class="evidence-value">${v.tx_per_minute.toFixed(1)}</span>
            <span class="evidence-label">tx/min</span>
          </div>
        </div>
        <div class="evidence-context">Population: median ${v.population_median}, p95 ${v.population_p95}</div>
      </div>`);
  }

  if (evidence.structuring) {
    const s = evidence.structuring;
    cards.push(`
      <div class="evidence-card">
        <div class="evidence-title" style="color:#ffaa00">Structuring</div>
        <div class="evidence-stats">
          <div class="evidence-stat">
            <span class="evidence-value">${s.near_threshold_count}</span>
            <span class="evidence-label">near-threshold tx</span>
          </div>
        </div>
        <div class="evidence-context">Threshold: $${s.threshold.toLocaleString()} ± $${s.delta.toLocaleString()}</div>
      </div>`);
  }

  if (evidence.circular_flow) {
    const c = evidence.circular_flow;
    cards.push(`
      <div class="evidence-card">
        <div class="evidence-title" style="color:#ff4466">Circular Flow</div>
        <div class="evidence-stats">
          <div class="evidence-stat">
            <span class="evidence-value">${c.cycle_count}</span>
            <span class="evidence-label">cycles found</span>
          </div>
          <div class="evidence-stat">
            <span class="evidence-value">${c.shortest_cycle_length}</span>
            <span class="evidence-label">shortest length</span>
          </div>
        </div>
        <div class="evidence-context">Counterparties: ${c.counterparties.slice(0, 5).join(", ")}${c.counterparties.length > 5 ? ` +${c.counterparties.length - 5} more` : ""}</div>
      </div>`);
  }

  if (cards.length === 0) return "";

  return `
    <div class="evidence-section">
      <h3>Evidence Breakdown</h3>
      ${cards.join("")}
    </div>`;
}

/** Scrollable list of flagged transaction IDs. */
function buildFlaggedTx(flaggedIds?: string[]): string {
  if (!flaggedIds || flaggedIds.length === 0) return "";

  const items = flaggedIds
    .map((id) => `<div class="flagged-tx">${id}</div>`)
    .join("");

  return `
    <div class="flagged-section">
      <h3>Flagged Transactions (${flaggedIds.length})</h3>
      <div class="flagged-list">${items}</div>
    </div>`;
}

/** Top neighbors by risk with mini risk bars. */
function buildConnectedEntities(neighborhood?: Neighborhood): string {
  if (!neighborhood || neighborhood.nodes.length === 0) return "";

  // Sort by risk descending, take top 5 (exclude center)
  const neighbors = neighborhood.nodes
    .filter((n) => n.id !== neighborhood.center_id)
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 5);

  if (neighbors.length === 0) return "";

  const rows = neighbors
    .map((n) => {
      const pct = (n.risk_score * 100).toFixed(0);
      const color = riskColorCSS(n.risk_score);
      return `
        <div class="connected-row">
          <span class="connected-id">${n.id}</span>
          <div class="connected-risk-bar">
            <div class="connected-risk-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="connected-pct" style="color:${color}">${pct}%</span>
        </div>`;
    })
    .join("");

  return `
    <div class="connected-section">
      <h3>Connected Entities</h3>
      ${rows}
    </div>`;
}

export function setAISummary(summary: string): void {
  const el = document.getElementById("ai-summary");
  if (el) {
    el.textContent = summary;
    el.classList.remove("muted");
  }
}

export function hide(): void {
  panel.classList.remove("open");
}

export function showLoading(): void {
  panel.classList.add("open");
  panelContent.innerHTML = '<div class="muted">Loading...</div>';
}
