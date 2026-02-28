import type { AgentInvestigateResult } from "../api/client";
import { ENTITY_LINK_EVENT, renderMarkdownInto } from "./markdown";

// ── Types ────────────────────────────────────────────────────────────

type StepName = "intake" | "research" | "analysis" | "reporting";
type StepStatus = "pending" | "running" | "completed" | "failed";

interface StepMeta {
  label: string;
  icon: string;
  description: string;
  cues: string[];
}

const STEP_META: Record<StepName, StepMeta> = {
  intake: {
    label: "Intake",
    icon: "1",
    description: "Parsing query intent and scoping investigation parameters",
    cues: [
      "Parsing natural language query...",
      "Identifying investigation scope...",
      "Resolving entity references...",
      "Building investigation plan...",
    ],
  },
  research: {
    label: "Research",
    icon: "2",
    description: "Scanning graph topology and gathering entity intelligence",
    cues: [
      "Scanning entity graph topology...",
      "Gathering transaction patterns...",
      "Cross-referencing data sources...",
      "Identifying candidate targets...",
    ],
  },
  analysis: {
    label: "Analysis",
    icon: "3",
    description: "Running risk models and anomaly detectors on targets",
    cues: [
      "Running anomaly detectors...",
      "Computing risk attribution...",
      "Evaluating velocity patterns...",
      "Scoring structuring signals...",
    ],
  },
  reporting: {
    label: "Reporting",
    icon: "4",
    description: "Composing investigator briefing and evidence summary",
    cues: [
      "Drafting investigation narrative...",
      "Compiling evidence highlights...",
      "Structuring briefing package...",
      "Finalizing risk assessment...",
    ],
  },
};
const STEP_ORDER: StepName[] = ["intake", "research", "analysis", "reporting"];

// ── DOM References ───────────────────────────────────────────────────

const panel = document.getElementById("agent-panel") as HTMLDivElement;
const closeBtn = document.getElementById("agent-panel-close") as HTMLButtonElement;
const processingView = document.getElementById("agent-panel-processing") as HTMLDivElement;
const resultsView = document.getElementById("agent-panel-results") as HTMLDivElement;
const errorView = document.getElementById("agent-panel-error") as HTMLDivElement;
const queryText = document.getElementById("agent-panel-query-text") as HTMLSpanElement;
const progressFill = document.getElementById("agent-panel-progress-fill") as HTMLDivElement;
const stepsContainer = document.getElementById("agent-panel-steps") as HTMLDivElement;
const liveFeed = document.getElementById("agent-panel-live-feed") as HTMLDivElement;
const timerEl = document.getElementById("agent-panel-timer") as HTMLSpanElement;
const runIdEl = document.getElementById("agent-panel-run-id") as HTMLSpanElement;

// Result elements
const intentEl = document.getElementById("agent-panel-intent") as HTMLDivElement;
const metricsGrid = document.getElementById("agent-panel-metrics-grid") as HTMLDivElement;
const detectorsEl = document.getElementById("agent-panel-detectors") as HTMLDivElement;
const researchSummary = document.getElementById("agent-panel-research-summary") as HTMLDivElement;
const entityCards = document.getElementById("agent-panel-entity-cards") as HTMLDivElement;
const narrativeEl = document.getElementById("agent-panel-narrative") as HTMLDivElement;
const sarBtn = document.getElementById("agent-panel-sar-btn") as HTMLButtonElement;
const focusBtn = document.getElementById("agent-panel-focus-btn") as HTMLButtonElement;
const copyBtn = document.getElementById("agent-panel-copy-btn") as HTMLButtonElement;
const retryBtn = document.getElementById("agent-panel-retry-btn") as HTMLButtonElement;
const errorMsg = document.getElementById("agent-panel-error-msg") as HTMLDivElement;

// ── State ────────────────────────────────────────────────────────────

let stepStates: Record<StepName, StepStatus> = {
  intake: "pending", research: "pending", analysis: "pending", reporting: "pending",
};
let startTime = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let cueRotationInterval: ReturnType<typeof setInterval> | null = null;
let cueIndices: Record<StepName, number> = { intake: 0, research: 0, analysis: 0, reporting: 0 };
let currentResult: AgentInvestigateResult | null = null;

let onFocusGraphCb: ((entityIds: string[]) => void) | null = null;
let onRetryCb: (() => void) | null = null;
let onSarCb: ((entityId: string) => void) | null = null;

// ── Event wiring ─────────────────────────────────────────────────────

closeBtn.addEventListener("click", hide);

// Result tab switching
const tabBtns = panel.querySelectorAll<HTMLButtonElement>("#agent-panel-tabs .agent-panel-tab");
for (const btn of Array.from(tabBtns)) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab ?? "summary"));
}

focusBtn.addEventListener("click", () => {
  if (!currentResult || !onFocusGraphCb) return;
  const ids = currentResult.research.entity_ids ?? [];
  onFocusGraphCb(ids);
  hide();
});

copyBtn.addEventListener("click", () => {
  if (!currentResult) return;
  navigator.clipboard.writeText(currentResult.reporting.narrative).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
  });
});

sarBtn.addEventListener("click", () => {
  if (!currentResult || !onSarCb) return;
  const topEntity = currentResult.analysis.top_entity_id;
  if (topEntity) onSarCb(topEntity);
});

retryBtn.addEventListener("click", () => {
  if (onRetryCb) onRetryCb();
});

// ── Public API ───────────────────────────────────────────────────────

export function show(query: string): void {
  panel.classList.add("open");
  queryText.textContent = query;
  showProcessing();
  startTimer();
  startCueRotation();
}

export function hide(): void {
  panel.classList.remove("open");
  stopTimer();
  stopCueRotation();
}

export function setRunId(runId: string | null): void {
  runIdEl.textContent = runId ? `#${runId.slice(0, 8)}` : "";
}

export function updateStep(step: StepName, status: StepStatus, detail?: string): void {
  stepStates[step] = status;
  renderSteps();
  updateProgress();
  if (detail) appendFeedLine(step, detail);
}

export function setResult(result: AgentInvestigateResult): void {
  currentResult = result;
  stopTimer();
  stopCueRotation();
  showResults();
  renderResultContent(result);
}

export function setError(message: string): void {
  stopTimer();
  stopCueRotation();
  showError(message);
}

export function reset(): void {
  stepStates = { intake: "pending", research: "pending", analysis: "pending", reporting: "pending" };
  cueIndices = { intake: 0, research: 0, analysis: 0, reporting: 0 };
  currentResult = null;
  liveFeed.innerHTML = "";
  progressFill.style.width = "0%";
  stopTimer();
  stopCueRotation();
}

export function initCallbacks(cbs: {
  onFocusGraph: (entityIds: string[]) => void;
  onRetry: () => void;
  onSar: (entityId: string) => void;
}): void {
  onFocusGraphCb = cbs.onFocusGraph;
  onRetryCb = cbs.onRetry;
  onSarCb = cbs.onSar;
}

// ── Internal: view switching ─────────────────────────────────────────

function showProcessing(): void {
  processingView.style.display = "";
  resultsView.style.display = "none";
  errorView.style.display = "none";
  renderSteps();
}

function showResults(): void {
  processingView.style.display = "none";
  resultsView.style.display = "";
  errorView.style.display = "none";
  switchTab("summary");
}

function showError(msg: string): void {
  processingView.style.display = "none";
  resultsView.style.display = "none";
  errorView.style.display = "flex";
  errorMsg.textContent = msg;
}

// ── Internal: step rendering ─────────────────────────────────────────

function renderSteps(): void {
  stepsContainer.innerHTML = STEP_ORDER.map((name) => {
    const status = stepStates[name];
    const meta = STEP_META[name];
    let statusIcon = "";
    let statusText = "";
    if (status === "completed") { statusIcon = "&#10003;"; statusText = "DONE"; }
    else if (status === "running") { statusIcon = meta.icon; statusText = "RUNNING"; }
    else if (status === "failed") { statusIcon = "!"; statusText = "FAILED"; }
    else { statusIcon = meta.icon; statusText = ""; }

    return `
      <div class="ap-step ${status}" data-step="${name}">
        <div class="ap-step-header">
          <div class="ap-step-indicator">
            <span class="ap-step-number">${statusIcon}</span>
          </div>
          <div class="ap-step-info">
            <div class="ap-step-label">${meta.label}</div>
            <div class="ap-step-desc">${meta.description}</div>
          </div>
          <div class="ap-step-status">${statusText}</div>
        </div>
        ${status === "running" ? `<div class="ap-step-cue" data-step="${name}"></div>` : ""}
      </div>
    `;
  }).join("");
}

function updateProgress(): void {
  let completed = 0;
  let running = 0;
  for (const name of STEP_ORDER) {
    if (stepStates[name] === "completed") completed++;
    else if (stepStates[name] === "running") running++;
  }
  const pct = ((completed + running * 0.5) / STEP_ORDER.length) * 100;
  progressFill.style.width = `${pct}%`;
}

// ── Internal: live feed ──────────────────────────────────────────────

function appendFeedLine(agent: string, detail: string): void {
  const line = document.createElement("div");
  line.className = "ap-feed-line";
  line.innerHTML = `
    <span class="ap-feed-ts">${formatElapsed()}</span>
    <span class="ap-feed-agent">${escapeHtml(agent)}</span>
    <span class="ap-feed-detail">${escapeHtml(detail)}</span>
  `;
  liveFeed.appendChild(line);
  while (liveFeed.children.length > 30) liveFeed.removeChild(liveFeed.firstChild!);
  liveFeed.scrollTop = liveFeed.scrollHeight;
}

// ── Internal: timer ──────────────────────────────────────────────────

function startTimer(): void {
  startTime = performance.now();
  timerEl.textContent = "0.0s";
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerEl.textContent = formatElapsed();
  }, 100);
}

function stopTimer(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function formatElapsed(): string {
  const ms = performance.now() - startTime;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Internal: cue text rotation ──────────────────────────────────────

function startCueRotation(): void {
  if (cueRotationInterval) clearInterval(cueRotationInterval);
  cueRotationInterval = setInterval(() => {
    for (const name of STEP_ORDER) {
      if (stepStates[name] !== "running") continue;
      const cueEl = stepsContainer.querySelector<HTMLDivElement>(`.ap-step-cue[data-step="${name}"]`);
      if (!cueEl) continue;
      const cues = STEP_META[name].cues;
      cueIndices[name] = (cueIndices[name] + 1) % cues.length;
      cueEl.textContent = cues[cueIndices[name]];
    }
  }, 2500);
}

function stopCueRotation(): void {
  if (cueRotationInterval) { clearInterval(cueRotationInterval); cueRotationInterval = null; }
}

// ── Internal: result rendering ───────────────────────────────────────

function renderResultContent(result: AgentInvestigateResult): void {
  // Intent
  intentEl.innerHTML = `
    <div class="ap-intent-card">
      <span class="ap-intent-label">INTENT</span>
      <span class="ap-intent-text">${escapeHtml(result.intent)}</span>
    </div>
  `;

  // Metrics grid
  const avgRisk = (result.analysis.average_risk * 100).toFixed(0);
  const highRisk = result.analysis.high_risk_count;
  const totalEntities = result.research.entity_ids.length;
  metricsGrid.innerHTML = `
    <div class="ap-metrics-grid">
      <div class="ap-metric-card">
        <div class="ap-metric-value">${avgRisk}%</div>
        <div class="ap-metric-label">Avg Risk</div>
      </div>
      <div class="ap-metric-card">
        <div class="ap-metric-value">${highRisk}</div>
        <div class="ap-metric-label">High Risk</div>
      </div>
      <div class="ap-metric-card">
        <div class="ap-metric-value">${totalEntities}</div>
        <div class="ap-metric-label">Entities</div>
      </div>
    </div>
  `;

  // Detector counts
  const detCounts = result.analysis.detector_counts;
  if (detCounts && Object.keys(detCounts).length > 0) {
    detectorsEl.innerHTML = `
      <div class="ap-section-title">Detectors Triggered</div>
      <div class="ap-detector-list">
        ${Object.entries(detCounts).map(([name, count]) => `
          <div class="ap-detector-chip">
            <span class="ap-detector-name">${escapeHtml(name)}</span>
            <span class="ap-detector-count">${count}</span>
          </div>
        `).join("")}
      </div>
    `;
  } else {
    detectorsEl.innerHTML = "";
  }

  // Research summary
  if (result.research.summary) {
    renderMarkdownInto(researchSummary, result.research.summary);
  } else {
    researchSummary.innerHTML = "";
  }

  // Entity cards
  const highlights = result.analysis.highlights ?? [];
  if (highlights.length > 0) {
    entityCards.innerHTML = highlights.map((h) => {
      const riskPct = (h.risk_score * 100).toFixed(0);
      const riskClass = h.risk_score >= 0.7 ? "high" : h.risk_score >= 0.4 ? "medium" : "low";
      return `
        <div class="ap-entity-card" data-entity-id="${escapeHtml(h.entity_id)}">
          <div class="ap-entity-card-header">
            <span class="ap-entity-id">${escapeHtml(h.entity_id)}</span>
            <span class="ap-entity-risk ${riskClass}">${riskPct}%</span>
          </div>
          <div class="ap-entity-risk-bar">
            <div class="ap-entity-risk-fill ${riskClass}" style="width: ${riskPct}%"></div>
          </div>
          <div class="ap-entity-reason">${escapeHtml(h.top_reason)}</div>
          ${h.summary ? `<div class="ap-entity-summary">${escapeHtml(h.summary)}</div>` : ""}
        </div>
      `;
    }).join("");

    // Wire click-to-focus on entity cards
    for (const card of Array.from(entityCards.querySelectorAll<HTMLDivElement>(".ap-entity-card"))) {
      card.addEventListener("click", () => {
        const eid = card.dataset.entityId;
        if (eid) window.dispatchEvent(new CustomEvent(ENTITY_LINK_EVENT, { detail: { entityId: eid } }));
      });
    }
  } else {
    entityCards.innerHTML = '<div class="ap-empty">No entity highlights available.</div>';
  }

  // Narrative
  if (result.reporting.narrative) {
    renderMarkdownInto(narrativeEl, result.reporting.narrative);
  } else {
    narrativeEl.innerHTML = '<div class="ap-empty">No narrative generated.</div>';
  }

  // SAR button visibility
  sarBtn.style.display = result.reporting.sar ? "" : "none";
}

// ── Internal: tab switching ──────────────────────────────────────────

function switchTab(tab: string): void {
  for (const btn of Array.from(tabBtns)) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  const sections = resultsView.querySelectorAll<HTMLDivElement>(".agent-panel-tab-content");
  for (const section of Array.from(sections)) {
    section.classList.toggle("active", section.dataset.tab === tab);
  }
}

// ── Util ─────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
