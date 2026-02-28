import type { EntityDetail } from "../types";

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

export function show(entity: EntityDetail): void {
  panel.classList.add("open");

  const activityHTML = entity.activity
    ? `<div class="stat-row">
        <span>In: ${entity.activity.in_count} tx ($${entity.activity.in_sum.toLocaleString()})</span>
        <span>Out: ${entity.activity.out_count} tx ($${entity.activity.out_sum.toLocaleString()})</span>
      </div>`
    : "";

  const reasonsHTML = entity.reasons.length
    ? entity.reasons
        .map(
          (r) =>
            `<div class="reason"><strong>${r.detector}</strong>: ${r.detail} <span class="weight">(${r.weight})</span></div>`,
        )
        .join("")
    : '<div class="reason muted">No risk signals detected</div>';

  panelContent.innerHTML = `
    <div class="entity-id">${entity.id}</div>
    <div class="stat-row">
      <span class="badge">${entity.type}</span>
      <span class="badge">Bank ${entity.bank}</span>
      <span class="badge">${entity.kyc_level} KYC</span>
    </div>
    <div class="risk-score">
      <label>Risk Score</label>
      <div class="risk-bar">
        <div class="risk-fill" style="width: ${entity.risk_score * 100}%"></div>
      </div>
      <span>${(entity.risk_score * 100).toFixed(0)}%</span>
    </div>
    ${activityHTML}
    <h3>Risk Signals</h3>
    ${reasonsHTML}
  `;
}

export function hide(): void {
  panel.classList.remove("open");
}

export function showLoading(): void {
  panel.classList.add("open");
  panelContent.innerHTML = '<div class="muted">Loading...</div>';
}
