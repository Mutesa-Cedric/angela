import { getDashboard, type DashboardData } from "../api/client";

// ── DOM ────────────────────────────────────────────────────────────────

const overlay = document.getElementById("dashboard-overlay") as HTMLDivElement;
const closeBtn = document.getElementById("dash-close") as HTMLButtonElement;

closeBtn.addEventListener("click", hide);

let isOpen = false;
let onToggleCallback: ((open: boolean) => void) | null = null;

// ── Public API ─────────────────────────────────────────────────────────

export function onToggle(cb: (open: boolean) => void): void {
  onToggleCallback = cb;
}

export function toggle(bucket: number): void {
  if (isOpen) {
    hide();
  } else {
    show(bucket);
  }
}

export async function show(bucket: number): Promise<void> {
  isOpen = true;
  overlay.classList.add("open");
  onToggleCallback?.(true);
  setContent('<div class="dash-loading">Loading dashboard...</div>');

  try {
    const data = await getDashboard(bucket);
    render(data);
  } catch (err) {
    setContent(`<div class="dash-error">Failed to load dashboard: ${err instanceof Error ? err.message : "Unknown"}</div>`);
  }
}

export function hide(): void {
  isOpen = false;
  overlay.classList.remove("open");
  onToggleCallback?.(false);
}

export function getIsOpen(): boolean {
  return isOpen;
}

// ── Render ──────────────────────────────────────────────────────────────

function setContent(html: string): void {
  const container = document.getElementById("dash-content")!;
  container.innerHTML = html;
}

function render(data: DashboardData): void {
  const k = data.kpis;

  const html = `
    <div class="dash-kpis">
      ${kpiCard(
    "High-Risk Entities",
    k.high_risk_entities.toString(),
    "#ff4466",
    `of ${k.total_entities} total`,
    "Number of entities currently classified above the high-risk threshold.",
  )}
      ${kpiCard(
    "New Anomalies",
    k.new_anomalies.toString(),
    "#ffaa00",
    "since last window",
    "How many new unusual behaviors appeared since the last time bucket.",
  )}
      ${kpiCard(
    "Clusters",
    k.cluster_count.toString(),
    "#aa66ff",
    "connected groups",
    "Count of connected groups that exhibit correlated risk behavior.",
  )}
      ${kpiCard(
    "Cross-Border Risk",
    `${(k.cross_border_ratio * 100).toFixed(0)}%`,
    "#ff8844",
    "of risky transactions",
    "Share of flagged activity that crosses jurisdictions.",
  )}
    </div>
    <div class="dash-charts">
      <div class="dash-chart-panel">
        <h3 class="dash-tooltip-target" tabindex="0" data-tooltip="Timeline of total portfolio risk per bucket. The dotted line tracks high-risk entity count on a separate normalized scale.">
          Risk Trend
        </h3>
        <canvas id="dash-trend-canvas" width="500" height="180"></canvas>
      </div>
      <div class="dash-chart-panel">
        <h3 class="dash-tooltip-target" tabindex="0" data-tooltip="Average risk and concentration by jurisdiction to highlight geographic hot spots.">
          Jurisdiction Risk
        </h3>
        <div id="dash-heatmap" class="dash-heatmap"></div>
      </div>
    </div>
    <div class="dash-summary-section">
      <h3 class="dash-tooltip-target" tabindex="0" data-tooltip="Auto-generated narrative of current risk posture, changes, and notable concentration signals.">
        Executive Summary
      </h3>
      <div class="dash-summary">${generateSummaryText(data)}</div>
    </div>
  `;

  setContent(html);

  // Draw trend chart
  requestAnimationFrame(() => {
    drawTrendChart(data.trend, data.bucket);
    drawHeatmap(data.heatmap);
  });
}

function kpiCard(
  label: string,
  value: string,
  color: string,
  subtitle: string,
  description: string,
): string {
  return `
    <div class="dash-kpi">
      <div class="dash-kpi-value" style="color:${color}">${value}</div>
      <div class="dash-kpi-label dash-tooltip-target" tabindex="0" data-tooltip="${description}">${label}</div>
      <div class="dash-kpi-sub">${subtitle}</div>
    </div>`;
}

// ── Trend chart (Canvas 2D) ─────────────────────────────────────────────

function drawTrendChart(
  trend: DashboardData["trend"],
  currentBucket: number,
): void {
  const canvas = document.getElementById("dash-trend-canvas") as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext("2d")!;
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssWidth = Math.max(500, Math.round(canvas.clientWidth || 500));
  const cssHeight = 300;
  const targetWidth = cssWidth * dpr;
  const targetHeight = cssHeight * dpr;

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.style.height = `${cssHeight}px`;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssWidth;
  const h = cssHeight;
  const padding = { top: 34, right: 16, bottom: 38, left: 54 };

  ctx.clearRect(0, 0, w, h);

  if (trend.length === 0) return;

  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const maxRisk = Math.max(...trend.map((t) => t.total_risk), 1);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + plotH * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  // Axes baseline
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, h - padding.bottom);
  ctx.lineTo(w - padding.right, h - padding.bottom);
  ctx.stroke();

  // Risk line
  ctx.strokeStyle = "#ff4466";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < trend.length; i++) {
    const x = padding.left + (i / Math.max(trend.length - 1, 1)) * plotW;
    const y = padding.top + plotH * (1 - trend[i].total_risk / maxRisk);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // High-risk count line (secondary)
  const maxHR = Math.max(...trend.map((t) => t.high_risk_count), 1);
  ctx.strokeStyle = "rgba(255, 170, 0, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  for (let i = 0; i < trend.length; i++) {
    const x = padding.left + (i / Math.max(trend.length - 1, 1)) * plotW;
    const y = padding.top + plotH * (1 - trend[i].high_risk_count / maxHR);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Current bucket marker
  if (currentBucket < trend.length) {
    const x = padding.left + (currentBucket / Math.max(trend.length - 1, 1)) * plotW;
    ctx.strokeStyle = "rgba(68, 136, 255, 0.8)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, h - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dot
    const y = padding.top + plotH * (1 - trend[currentBucket].total_risk / maxRisk);
    ctx.fillStyle = "#4488ff";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // X axis tick labels
  ctx.fillStyle = "#556";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.floor(trend.length / 6));
  for (let i = 0; i < trend.length; i += step) {
    const x = padding.left + (i / Math.max(trend.length - 1, 1)) * plotW;
    ctx.fillText(`${i}`, x, h - 5);
  }

  // Y axis tick labels
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + plotH * (1 - i / 4);
    const val = (maxRisk * i / 4).toFixed(0);
    ctx.fillText(val, padding.left - 5, y + 3);
  }

  // Axis titles
  ctx.fillStyle = "#7a88a5";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Time Bucket", padding.left + plotW / 2, h - 8);

  ctx.save();
  ctx.translate(14, padding.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Total Risk Index", 0, 0);
  ctx.restore();

  // Legend
  const legendY = 16;
  let legendX = padding.left;
  const legendGap = 14;

  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#aab8d4";

  // Total Risk legend
  ctx.strokeStyle = "#ff4466";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(legendX, legendY);
  ctx.lineTo(legendX + 14, legendY);
  ctx.stroke();
  ctx.fillText("Total Risk (left axis)", legendX + 18, legendY + 3);
  legendX += 18 + ctx.measureText("Total Risk (left axis)").width + legendGap;

  // High-risk count legend
  ctx.strokeStyle = "rgba(255, 170, 0, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(legendX, legendY);
  ctx.lineTo(legendX + 14, legendY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("High-Risk Count (normalized)", legendX + 18, legendY + 3);
}

// ── Jurisdiction heatmap ────────────────────────────────────────────────

const JURISDICTION_LABELS = [
  "JUR-0", "JUR-1", "JUR-2", "JUR-3",
  "JUR-4", "JUR-5", "JUR-6", "JUR-7",
];

function drawHeatmap(heatmap: DashboardData["heatmap"]): void {
  const container = document.getElementById("dash-heatmap");
  if (!container) return;

  container.innerHTML = heatmap
    .map((h) => {
      const label = JURISDICTION_LABELS[h.jurisdiction] ?? `JUR-${h.jurisdiction}`;
      const highRisk = h.high_risk_count > 0;

      return `
        <div class="dash-heatmap-cell ${highRisk ? "high-risk" : ""}">
          <div class="dash-hm-label">${label}</div>
          <div class="dash-hm-risk">${(h.avg_risk * 100).toFixed(0)}%</div>
          <div class="dash-hm-count">${h.entity_count} entities</div>
          ${h.high_risk_count > 0 ? `<div class="dash-hm-alert">${h.high_risk_count} high-risk</div>` : ""}
        </div>`;
    })
    .join("");
}

// ── Executive summary text (template-based, no LLM needed) ──────────────

function generateSummaryText(data: DashboardData): string {
  const k = data.kpis;
  const parts: string[] = [];

  // Overall risk posture
  if (k.high_risk_entities === 0) {
    parts.push(
      `In the current observation window (bucket ${data.bucket}), no entities exceed the high-risk threshold across ${k.total_entities} monitored entities.`,
    );
  } else {
    parts.push(
      `${k.high_risk_entities} of ${k.total_entities} entities (${((k.high_risk_entities / Math.max(k.total_entities, 1)) * 100).toFixed(1)}%) are classified as high-risk in the current observation window.`,
    );
  }

  // New anomalies
  if (k.new_anomalies > 0) {
    parts.push(
      `${k.new_anomalies} new unusual pattern${k.new_anomalies === 1 ? " was" : "s were"} found since the previous time window and should be reviewed.`,
    );
  }

  // Clusters
  if (k.cluster_count > 0) {
    parts.push(
      `${k.cluster_count} risk cluster${k.cluster_count > 1 ? "s" : ""} ${k.cluster_count > 1 ? "have" : "has"} been identified, suggesting coordinated suspicious activity.`,
    );
  }

  // Cross-border
  if (k.cross_border_ratio > 0.2) {
    parts.push(
      `Cross-border risk is elevated at ${(k.cross_border_ratio * 100).toFixed(0)}% of flagged transactions, indicating potential jurisdictional arbitrage.`,
    );
  }

  // Trend
  if (data.trend.length > 1) {
    const current = data.trend[data.bucket]?.total_risk ?? 0;
    const prev = data.trend[Math.max(0, data.bucket - 1)]?.total_risk ?? 0;
    if (current > prev * 1.2) {
      parts.push("Total risk index is trending upward compared to the previous period.");
    } else if (current < prev * 0.8) {
      parts.push("Total risk index has decreased from the previous period.");
    }
  }

  return parts.join(" ");
}
