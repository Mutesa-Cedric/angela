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
let currentBucketCount: number = 0;

const DETECTOR_META: Record<string, { label: string; short: string; color: string }> = {
  velocity: {
    label: "Velocity Burst",
    short: "Velocity",
    color: "#4488ff",
  },
  structuring: {
    label: "Threshold Splitting",
    short: "Structuring",
    color: "#ffaa00",
  },
  circular_flow: {
    label: "Circular Layering",
    short: "Circular Flow",
    color: "#ff4466",
  },
};

interface RiskBandMeta {
  key: "low" | "guarded" | "elevated" | "critical";
  label: string;
  note: string;
}

function describeRiskBand(score: number): RiskBandMeta {
  if (score >= 0.75) {
    return {
      key: "critical",
      label: "Critical Priority",
      note: "Review this entity first. Multiple strong risk signals are present.",
    };
  }
  if (score >= 0.45) {
    return {
      key: "elevated",
      label: "Elevated Priority",
      note: "Meaningful risk signals are present and should be reviewed soon.",
    };
  }
  if (score >= 0.2) {
    return {
      key: "guarded",
      label: "Guarded Priority",
      note: "Some unusual patterns exist but the risk is not extreme.",
    };
  }
  return {
    key: "low",
    label: "Low Priority",
    note: "No strong suspicious signal dominates this time window.",
  };
}

function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString()}`;
}

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatBucketLabel(): string {
  if (currentBucketCount > 0) {
    return `Time Window ${currentBucket + 1} of ${currentBucketCount}`;
  }
  return `Time Window ${currentBucket + 1}`;
}

panelClose.addEventListener("click", () => {
  hide();
  onCloseCallback?.();
});

export function onClose(cb: () => void): void {
  onCloseCallback = cb;
}

export function setBucket(t: number, bucketCount?: number): void {
  currentBucket = t;
  if (typeof bucketCount === "number" && bucketCount > 0) {
    currentBucketCount = bucketCount;
  }
}

export function onCounterfactual(cb: (result: CounterfactualResult) => void): void {
  onCounterfactualCallback = cb;
}

export function show(entity: EntityDetail, neighborhood?: Neighborhood): void {
  panel.classList.add("open");
  currentEntity = entity;

  const riskPct = (entity.risk_score * 100).toFixed(0);
  const riskCSS = riskColorCSS(entity.risk_score);
  const riskBand = describeRiskBand(entity.risk_score);

  // --- Badges ---
  const badgesHTML = `
    <div class="stat-row">
      <span class="badge" title="Entity category in the transaction graph.">${escapeHtml(entity.type)}</span>
      <span class="badge" title="Institution associated with this entity record.">Bank ${escapeHtml(entity.bank)}</span>
      <span class="badge" title="Know Your Customer status used for compliance depth.">${escapeHtml(entity.kyc_level)} KYC</span>
    </div>`;

  const quickGuideHTML = `
    <div class="entity-quick-guide soft-copy">
      <strong>How to read this panel:</strong> start with the risk score, then see which signals contributed most, then review evidence cards and connected entities for ${formatBucketLabel().toLowerCase()}.
    </div>`;

  // --- Risk score with large number ---
  const riskHTML = `
    <div class="risk-score">
      <label>Risk Score <span class="soft-tip" title="Model-estimated priority score for this bucket. It guides review order and is not a legal conclusion.">?</span></label>
      <div class="risk-number-row">
        <div class="risk-number" style="color:${riskCSS}">${riskPct}%</div>
        <span class="risk-band risk-band-${riskBand.key}" title="${escapeHtml(riskBand.note)}">${riskBand.label}</span>
      </div>
      <div class="risk-bar">
        <div class="risk-fill" style="width:${riskPct}%"></div>
      </div>
      <div class="soft-copy">${riskBand.note}</div>
    </div>`;

  // --- Activity stats ---
  const activityHTML = entity.activity
    ? `<div class="activity-section">
        <h3>Activity Snapshot <span class="soft-tip" title="Transaction volume and direction for this entity in the selected time bucket.">?</span></h3>
        <div class="soft-copy">Use this to understand whether funds are mostly entering, leaving, or netting out.</div>
        <div class="activity-grid">
          <div class="activity-card" title="Inbound transfers received by this entity in this bucket.">
            <span class="activity-label">Inbound</span>
            <span class="activity-value">${entity.activity.in_count} tx</span>
            <span class="activity-meta">$${entity.activity.in_sum.toLocaleString()}</span>
          </div>
          <div class="activity-card" title="Outbound transfers sent by this entity in this bucket.">
            <span class="activity-label">Outbound</span>
            <span class="activity-value">${entity.activity.out_count} tx</span>
            <span class="activity-meta">$${entity.activity.out_sum.toLocaleString()}</span>
          </div>
          <div class="activity-card" title="Inbound minus outbound value for this time window.">
            <span class="activity-label">Net Flow</span>
            <span class="activity-value ${entity.activity.in_sum - entity.activity.out_sum >= 0 ? "activity-net-positive" : "activity-net-negative"}">${formatSignedCurrency(entity.activity.in_sum - entity.activity.out_sum)}</span>
            <span class="activity-meta">in - out</span>
          </div>
        </div>
      </div>`
    : `<div class="activity-section">
        <h3>Activity Snapshot <span class="soft-tip" title="Transaction volume and direction for this entity in the selected time bucket.">?</span></h3>
        <div class="soft-copy">No recorded inbound or outbound activity for this entity in the current bucket.</div>
      </div>`;

  // --- Risk attribution bar ---
  const attrHTML = buildAttributionBar(entity.reasons);

  // --- Evidence breakdown ---
  const evidenceHTML = buildEvidenceCards(entity.evidence);

  // --- Flagged transactions ---
  const flaggedHTML = buildFlaggedTx(entity.evidence.flagged_tx_ids);

  // --- Connected entities ---
  const connectedHTML = buildConnectedEntities(neighborhood);

  panelContent.innerHTML = `
    <div class="entity-context-row">
      <div class="entity-id">${entity.id}</div>
      <span class="bucket-chip" title="Current time window shown in this panel. Buckets are sequential slices of activity over time.">${formatBucketLabel()}</span>
    </div>
    ${badgesHTML}
    ${quickGuideHTML}
    ${riskHTML}
    ${activityHTML}
    ${attrHTML}
    ${evidenceHTML}
    ${flaggedHTML}
    ${connectedHTML}
    <div class="ai-section">
      <h3>AI Analysis <span class="soft-tip" title="Narrative summary generated from the evidence shown above. Always verify against the numeric evidence cards.">?</span></h3>
      <div class="soft-copy">Plain-language recap to help non-technical reviewers understand the key concern quickly.</div>
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

  for (const btn of Array.from(panelContent.querySelectorAll<HTMLButtonElement>(".connected-entity-link, .evidence-entity-link"))) {
    btn.addEventListener("click", () => {
      const entityId = btn.dataset.entityId;
      if (!entityId) return;
      window.dispatchEvent(new CustomEvent(ENTITY_LINK_EVENT, { detail: { entityId } }));
    });
  }

  for (const btn of Array.from(panelContent.querySelectorAll<HTMLButtonElement>(".flagged-tx-btn"))) {
    btn.addEventListener("click", () => {
      void copyFlaggedTxId(btn);
    });
  }
}

/** Horizontal stacked bar showing detector weight contributions. */
function buildAttributionBar(reasons: EntityDetail["reasons"]): string {
  if (reasons.length === 0) return "";

  const totalWeight = reasons.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return "";
  const ordered = [...reasons].sort((a, b) => b.weight - a.weight);

  const segments = ordered
    .map((r) => {
      const pct = ((r.weight / totalWeight) * 100).toFixed(1);
      const meta = DETECTOR_META[r.detector] ?? { label: r.detector, short: r.detector, color: "#888" };
      return `<div class="attr-segment" style="width:${pct}%;background:${meta.color}" title="${meta.label}: ${pct}% • ${escapeHtml(r.detail)}"></div>`;
    })
    .join("");

  const labels = ordered
    .map((r) => {
      const meta = DETECTOR_META[r.detector] ?? { label: r.detector, short: r.detector, color: "#888" };
      const pct = ((r.weight / totalWeight) * 100).toFixed(0);
      return `<span class="attr-label" title="${escapeHtml(r.detail)}"><span class="attr-dot" style="background:${meta.color}"></span>${meta.short} ${pct}%</span>`;
    })
    .join("");

  return `
    <div class="attribution">
      <h3>Risk Attribution <span class="soft-tip" title="Breakdown of which detector families contributed to this risk score.">?</span></h3>
      <div class="soft-copy attribution-explainer">Think of this as <em>why the score is high</em>. Percentages show each signal's contribution share.</div>
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
        <div class="evidence-title" style="color:#4488ff">Velocity Burst</div>
        <div class="evidence-explainer">Rapid transfer activity in a short window can indicate account staging or layering.</div>
        <div class="evidence-stats">
          <div class="evidence-stat">
            <span class="evidence-value">${v.tx_count}</span>
            <span class="evidence-label" title="How many transfers involved this entity during this selected time bucket.">tx in bucket</span>
          </div>
          <div class="evidence-stat">
            <span class="evidence-value">${v.tx_per_minute.toFixed(1)}</span>
            <span class="evidence-label" title="Average transfers per minute for this entity in this window.">tx per minute</span>
          </div>
        </div>
        <div class="evidence-context">Observed rate is compared to population baseline (median ${v.population_median}, p95 ${v.population_p95}).</div>
      </div>`);
  }

  if (evidence.structuring) {
    const s = evidence.structuring;
    cards.push(`
      <div class="evidence-card">
        <div class="evidence-title" style="color:#ffaa00">Threshold Splitting (Structuring)</div>
        <div class="evidence-explainer">Many transfers just below a reporting limit may indicate deliberate evasion of controls.</div>
        <div class="evidence-stats">
          <div class="evidence-stat">
            <span class="evidence-value">${s.near_threshold_count}</span>
            <span class="evidence-label" title="Transactions close to a reporting threshold, which can indicate amount-splitting behavior.">near-limit tx</span>
          </div>
        </div>
        <div class="evidence-context">Flagged when amounts fall around $${s.threshold.toLocaleString()} (within ± $${s.delta.toLocaleString()}).</div>
      </div>`);
  }

  if (evidence.circular_flow) {
    const c = evidence.circular_flow;
    const counterparties = c.counterparties.slice(0, 5)
      .map((id) => `<button class="evidence-entity-link" data-entity-id="${id}">${id}</button>`)
      .join("");
    const remaining = c.counterparties.length > 5 ? `<span class="evidence-link-more">+${c.counterparties.length - 5} more</span>` : "";
    cards.push(`
      <div class="evidence-card">
        <div class="evidence-title" style="color:#ff4466">Circular Layering</div>
        <div class="evidence-explainer">Funds loop through a set of entities and return, which can obscure true source and destination.</div>
        <div class="evidence-stats">
          <div class="evidence-stat">
            <span class="evidence-value">${c.cycle_count}</span>
            <span class="evidence-label" title="How many closed-loop transfer patterns were detected.">cycles found</span>
          </div>
          <div class="evidence-stat">
            <span class="evidence-value">${c.shortest_cycle_length}</span>
            <span class="evidence-label" title="Fewest hops observed in a detected cycle. Lower can indicate tighter looping behavior.">shortest length</span>
          </div>
        </div>
        <div class="evidence-context">Linked counterparties involved in loop patterns:</div>
        <div class="evidence-link-row">${counterparties}${remaining}</div>
      </div>`);
  }

  if (cards.length === 0) return "";

  return `
    <div class="evidence-section">
      <h3>Evidence Breakdown <span class="soft-tip" title="Concrete numeric patterns that triggered or supported risk signals in this bucket.">?</span></h3>
      <div class="soft-copy">These cards translate detector output into plain-language facts you can verify quickly.</div>
      ${cards.join("")}
    </div>`;
}

/** Scrollable list of flagged transaction IDs. */
function buildFlaggedTx(flaggedIds?: string[]): string {
  if (!flaggedIds || flaggedIds.length === 0) return "";

  const maxVisible = 12;
  const visibleIds = flaggedIds.slice(0, maxVisible);
  const hiddenCount = Math.max(0, flaggedIds.length - visibleIds.length);

  const items = visibleIds
    .map((id) => `
      <button
        class="flagged-tx-btn"
        data-tx-id="${escapeHtml(id)}"
        title="Click to copy this transaction ID"
      >
        <span class="flagged-tx">${escapeHtml(id)}</span>
        <span class="flagged-tx-copy">Copy</span>
      </button>
    `)
    .join("");

  return `
    <div class="flagged-section">
      <h3>Flagged Transactions (${flaggedIds.length}) <span class="soft-tip" title="Transaction IDs that matched one or more suspicious pattern detectors.">?</span></h3>
      <div class="soft-copy">Use these IDs to jump into audit logs or case notes for evidence review.</div>
      <div class="flagged-summary">
        <span class="flagged-chip">${formatBucketLabel()}</span>
        <span class="flagged-chip">Showing ${visibleIds.length} of ${flaggedIds.length}</span>
        <span class="flagged-chip">Click any ID to copy</span>
      </div>
      <div class="flagged-list">${items}</div>
      ${hiddenCount > 0 ? `<div class="flagged-more soft-copy">+${hiddenCount} more flagged IDs hidden to keep this panel readable.</div>` : ""}
    </div>`;
}

/** Top neighbors by risk with mini risk bars. */
function buildConnectedEntities(neighborhood?: Neighborhood): string {
  if (!neighborhood || neighborhood.nodes.length === 0) return "";

  const flowMap = new Map<string, { inbound: number; outbound: number; directTxCount: number }>();
  for (const edge of neighborhood.edges) {
    if (edge.from_id === neighborhood.center_id) {
      const stat = flowMap.get(edge.to_id) ?? { inbound: 0, outbound: 0, directTxCount: 0 };
      stat.outbound += edge.amount;
      stat.directTxCount += 1;
      flowMap.set(edge.to_id, stat);
    } else if (edge.to_id === neighborhood.center_id) {
      const stat = flowMap.get(edge.from_id) ?? { inbound: 0, outbound: 0, directTxCount: 0 };
      stat.inbound += edge.amount;
      stat.directTxCount += 1;
      flowMap.set(edge.from_id, stat);
    }
  }

  // Prioritize directly connected neighbors, then high-risk context neighbors.
  const neighbors = neighborhood.nodes
    .filter((n) => n.id !== neighborhood.center_id)
    .map((n) => {
      const stat = flowMap.get(n.id) ?? { inbound: 0, outbound: 0, directTxCount: 0 };
      return {
        node: n,
        inbound: stat.inbound,
        outbound: stat.outbound,
        directTxCount: stat.directTxCount,
      };
    })
    .sort((a, b) => {
      const aDirect = a.directTxCount > 0 ? 1 : 0;
      const bDirect = b.directTxCount > 0 ? 1 : 0;
      if (aDirect !== bDirect) return bDirect - aDirect;
      if (a.node.risk_score !== b.node.risk_score) return b.node.risk_score - a.node.risk_score;
      return (b.inbound + b.outbound) - (a.inbound + a.outbound);
    })
    .slice(0, 6);

  if (neighbors.length === 0) return "";

  const rows = neighbors
    .map((item) => {
      const pct = (item.node.risk_score * 100).toFixed(0);
      const color = riskColorCSS(item.node.risk_score);
      const net = item.inbound - item.outbound;
      const relationLabel = item.directTxCount > 0
        ? `${item.directTxCount} direct tx`
        : `${neighborhood.k}-hop context`;
      const relationClass = item.directTxCount > 0 ? "direct" : "indirect";
      const netLabel = `${net >= 0 ? "+" : "-"}${formatCompactCurrency(Math.abs(net))}`;
      return `
        <div class="connected-row" title="Neighbor risk score and direct flow context in this time window.">
          <div class="connected-main-row">
            <button class="connected-entity-link" data-entity-id="${item.node.id}">${item.node.id}</button>
            <span class="connected-relation ${relationClass}" title="Shows whether this entity has direct transactions with the selected subject in this bucket.">${relationLabel}</span>
            <span class="connected-pct" style="color:${color}">${pct}%</span>
          </div>
          <div class="connected-risk-bar">
            <div class="connected-risk-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="connected-flow-row">
            <span class="connected-flow in" title="Estimated inbound value from this neighbor to the selected entity.">← ${formatCompactCurrency(item.inbound)}</span>
            <span class="connected-flow out" title="Estimated outbound value from the selected entity to this neighbor.">→ ${formatCompactCurrency(item.outbound)}</span>
            <span class="connected-flow net ${net >= 0 ? "pos" : "neg"}" title="Inbound minus outbound value between selected entity and this neighbor.">${netLabel}</span>
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="connected-section">
      <h3>Connected Entities <span class="connected-help">(click ID to inspect)</span> <span class="soft-tip" title="Top nearby entities by risk in this neighborhood view. These often explain context around suspicious flows.">?</span></h3>
      <div class="soft-copy">Top neighbors for ${formatBucketLabel().toLowerCase()}. Rows marked as direct have observed transfers with the selected entity; others are contextual k-hop links.</div>
      ${rows}
    </div>`;
}

async function copyFlaggedTxId(btn: HTMLButtonElement): Promise<void> {
  const txId = btn.dataset.txId;
  if (!txId) return;
  try {
    await navigator.clipboard.writeText(txId);
    const label = btn.querySelector<HTMLElement>(".flagged-tx-copy");
    if (!label) return;
    label.textContent = "Copied";
    window.setTimeout(() => {
      label.textContent = "Copy";
    }, 1200);
  } catch {
    // Clipboard can fail in restricted browser contexts.
  }
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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
