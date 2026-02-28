import type { EntityDetail, EntityEvidence, Neighborhood } from "../types";
import { riskColorCSS } from "../graph/NodeLayer";
import * as sarPanel from "./sarPanel";
import { getCounterfactual } from "../api/client";
import type { CounterfactualResult } from "../api/client";
import { ENTITY_LINK_EVENT, renderMarkdownInto } from "./markdown";

const panel = document.getElementById("entity-panel") as HTMLDivElement;
const panelContent = document.getElementById("panel-content") as HTMLDivElement;
const panelClose = document.getElementById("panel-close") as HTMLButtonElement;

let onCloseCallback: (() => void) | null = null;
let onCounterfactualCallback: ((result: CounterfactualResult) => void) | null = null;
let currentEntity: EntityDetail | null = null;
let currentBucket: number = 0;

panelClose.addEventListener("click", () => {
  hide();
  onCloseCallback?.();
});

export function onClose(cb: () => void): void {
  onCloseCallback = cb;
}

export function setBucket(t: number): void {
  currentBucket = t;
}

export function onCounterfactual(cb: (result: CounterfactualResult) => void): void {
  onCounterfactualCallback = cb;
}

export function show(entity: EntityDetail, neighborhood?: Neighborhood): void {
  panel.classList.add("open");
  currentEntity = entity;

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
      <div id="ai-summary" class="ai-summary markdown-content muted">Loading AI summary...</div>
    </div>
    <button id="panel-sar-btn" class="panel-sar-btn">Generate SAR Report</button>
    ${entity.risk_score > 0.1 ? '<button id="panel-cf-btn" class="panel-cf-btn">What If? (Counterfactual)</button>' : ""}
    <div id="cf-result" style="display:none"></div>
  `;

  document.getElementById("panel-sar-btn")!.addEventListener("click", () => {
    if (currentEntity) {
      sarPanel.generate(currentEntity.id, currentBucket);
    }
  });

  const cfBtn = document.getElementById("panel-cf-btn");
  if (cfBtn) {
    cfBtn.addEventListener("click", () => runCounterfactual());
  }
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
    renderMarkdownInto(el, summary);
    el.classList.remove("muted");
  }
}

// ── Counterfactual ──────────────────────────────────────────────────

async function runCounterfactual(): Promise<void> {
  if (!currentEntity) return;

  const cfBtn = document.getElementById("panel-cf-btn") as HTMLButtonElement | null;
  const cfResult = document.getElementById("cf-result");
  if (!cfResult) return;

  if (cfBtn) {
    cfBtn.disabled = true;
    cfBtn.textContent = "Computing...";
  }

  try {
    const result = await getCounterfactual(currentEntity.id, currentBucket);

    const origPct = (result.original.risk_score * 100).toFixed(0);
    const cfPct = (result.counterfactual.risk_score * 100).toFixed(0);
    const deltaPct = (result.delta.risk_score * 100).toFixed(0);
    const origColor = riskColorCSS(result.original.risk_score);
    const cfColor = riskColorCSS(result.counterfactual.risk_score);

    // Group removed edges by reason
    const byReason: Record<string, number> = {};
    for (const edge of result.removed_edges) {
      byReason[edge.reason] = (byReason[edge.reason] || 0) + 1;
    }
    const reasonTags = Object.entries(byReason)
      .map(([r, n]) => `<span class="cf-reason-tag">${n} ${r}</span>`)
      .join(" ");
    const topEdges = result.removed_edges.slice(0, 8);

    cfResult.innerHTML = `
      <h3>Counterfactual Analysis</h3>
      <div class="cf-delta-card">
        <div class="cf-delta-row">
          <div class="cf-score">
            <span class="cf-score-value" style="color:${origColor}">${origPct}%</span>
            <span class="cf-score-label">actual</span>
          </div>
          <span class="cf-arrow">→</span>
          <div class="cf-score">
            <span class="cf-score-value" style="color:${cfColor}">${cfPct}%</span>
            <span class="cf-score-label">if clean</span>
          </div>
          <div class="cf-delta-badge" style="color:${Number(deltaPct) <= 0 ? "#22aa88" : "#ff4466"}">
            ${Number(deltaPct) <= 0 ? "" : "+"}${deltaPct}%
          </div>
        </div>
        <div class="cf-removed-info">
          ${result.delta.tx_count_removed} suspicious edges removed: ${reasonTags}
        </div>
        <div id="cf-summary" class="cf-summary markdown-content"></div>
        ${topEdges.length > 0 ? `
          <div class="cf-edge-list">
            <h4>Top Removed Edges (click entity to inspect)</h4>
            ${topEdges.map((edge) => `
              <div class="cf-edge-row">
                <button class="cf-entity-link" data-entity-id="${edge.from_id}">${edge.from_id}</button>
                <span class="cf-edge-arrow">→</span>
                <button class="cf-entity-link" data-entity-id="${edge.to_id}">${edge.to_id}</button>
                <span class="cf-edge-meta">$${edge.amount.toLocaleString()} · ${edge.reason}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
    const cfSummaryEl = document.getElementById("cf-summary");
    if (cfSummaryEl) {
      renderMarkdownInto(cfSummaryEl, buildCounterfactualSummaryMarkdown(result, byReason));
    }
    for (const btn of Array.from(cfResult.querySelectorAll<HTMLButtonElement>(".cf-entity-link"))) {
      btn.addEventListener("click", () => {
        const entityId = btn.dataset.entityId;
        if (!entityId) return;
        window.dispatchEvent(new CustomEvent(ENTITY_LINK_EVENT, { detail: { entityId } }));
      });
    }
    cfResult.style.display = "block";

    if (cfBtn) {
      cfBtn.textContent = "Show Suspicious Edges";
      cfBtn.disabled = false;
      // Replace click handler to toggle edge highlighting
      const newBtn = cfBtn.cloneNode(true) as HTMLButtonElement;
      cfBtn.replaceWith(newBtn);
      let showing = false;
      newBtn.addEventListener("click", () => {
        showing = !showing;
        newBtn.textContent = showing ? "Hide Suspicious Edges" : "Show Suspicious Edges";
        newBtn.classList.toggle("active", showing);
        if (showing) {
          onCounterfactualCallback?.(result);
        } else {
          onCounterfactualCallback?.({ ...result, removed_edges: [] });
        }
      });
    }
  } catch (err) {
    cfResult.innerHTML = `<div class="cf-error">Counterfactual failed: ${err instanceof Error ? err.message : "Unknown error"}</div>`;
    cfResult.style.display = "block";
    if (cfBtn) {
      cfBtn.textContent = "What If? (Counterfactual)";
      cfBtn.disabled = false;
    }
  }
}

export function hide(): void {
  panel.classList.remove("open");
}

export function showLoading(): void {
  panel.classList.add("open");
  panelContent.innerHTML = '<div class="muted">Loading...</div>';
}

function buildCounterfactualSummaryMarkdown(
  result: CounterfactualResult,
  byReason: Record<string, number>,
): string {
  const actualPct = (result.original.risk_score * 100).toFixed(0);
  const cfPct = (result.counterfactual.risk_score * 100).toFixed(0);
  const deltaAbsPct = Math.abs(result.delta.risk_score * 100).toFixed(0);
  const direction = result.delta.risk_score <= 0 ? "decreases" : "increases";
  const primaryReasons = Object.entries(byReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([reason, count]) => `${reason} (${count})`)
    .join(", ");

  return [
    `**Impact:** Risk **${direction} ${deltaAbsPct}%** when suspicious edges are removed.`,
    `- Actual risk: **${actualPct}%**`,
    `- Counterfactual risk: **${cfPct}%**`,
    `- Removed edges: **${result.delta.tx_count_removed}**`,
    `- Primary drivers: ${primaryReasons || "N/A"}`,
    "",
    "Use the edge list below to inspect the most influential counterparties.",
  ].join("\n");
}
