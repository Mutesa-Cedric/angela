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
  agentLabel: string;       // Sub-agent label for feed lines
  simulatedDuration: number; // ms before auto-completing this step
}

const STEP_META: Record<StepName, StepMeta> = {
  intake: {
    label: "Intake",
    icon: "1",
    description: "Parsing query intent and scoping investigation parameters",
    agentLabel: "parser",
    simulatedDuration: 1800,
    cues: [
      "Tokenizing natural language query…",
      "Resolving entity references…",
      "Identifying investigation scope…",
      "Building execution plan…",
    ],
  },
  research: {
    label: "Research",
    icon: "2",
    description: "Scanning graph topology and gathering entity intelligence",
    agentLabel: "graph-scan",
    simulatedDuration: 3500,
    cues: [
      "Traversing entity adjacency graph…",
      "Gathering transaction velocity signals…",
      "Cross-referencing watchlist databases…",
      "Mapping counterparty clusters…",
      "Scoring candidate target set…",
    ],
  },
  analysis: {
    label: "Analysis",
    icon: "3",
    description: "Running risk models and anomaly detectors on targets",
    agentLabel: "risk-engine",
    simulatedDuration: 5000,
    cues: [
      "Initializing isolation forest model…",
      "Computing velocity anomaly features…",
      "Evaluating structuring detectors…",
      "Scoring circular flow patterns…",
      "Aggregating risk attribution vectors…",
      "Ranking entities by composite score…",
    ],
  },
  reporting: {
    label: "Reporting",
    icon: "4",
    description: "Composing investigator briefing and evidence summary",
    agentLabel: "narrator",
    simulatedDuration: 0, // Stays running until real result
    cues: [
      "Drafting investigation narrative…",
      "Compiling evidence highlights…",
      "Structuring briefing package…",
      "Generating risk assessment summary…",
      "Formatting entity profiles…",
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

// Simulation state
let simulationTimers: ReturnType<typeof setTimeout>[] = [];
let feedSimulationTimers: ReturnType<typeof setTimeout>[] = [];
let simulationRunning = false;

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
  panel.classList.add("open", "processing");
  queryText.textContent = query;
  showProcessing();
  startTimer();
  startCueRotation();
  startSimulatedCascade();
}

export function hide(): void {
  panel.classList.remove("open", "processing");
  stopTimer();
  stopCueRotation();
  stopSimulation();
}

export function setRunId(runId: string | null): void {
  runIdEl.textContent = runId ? `#${runId.slice(0, 8)}` : "";
}

export function updateStep(step: StepName, status: StepStatus, detail?: string): void {
  stepStates[step] = status;
  renderSteps();
  updateProgress();
  if (detail) appendFeedLine(STEP_META[step].agentLabel, detail);
}

export function setResult(result: AgentInvestigateResult): void {
  currentResult = result;
  stopTimer();
  stopCueRotation();
  stopSimulation();

  // Complete all steps immediately
  for (const name of STEP_ORDER) {
    stepStates[name] = "completed";
  }
  renderSteps();
  progressFill.style.width = "100%";

  // Brief pause to let the user see all-green before transitioning
  setTimeout(() => {
    panel.classList.remove("processing");
    showResults();
    renderResultContent(result);
  }, 400);
}

export function setError(message: string): void {
  stopTimer();
  stopCueRotation();
  stopSimulation();

  // Fail the current running step
  for (const name of STEP_ORDER) {
    if (stepStates[name] === "running") {
      stepStates[name] = "failed";
      break;
    }
  }
  renderSteps();
  panel.classList.remove("processing");
  showError(message);
}

export function reset(): void {
  stepStates = { intake: "pending", research: "pending", analysis: "pending", reporting: "pending" };
  cueIndices = { intake: 0, research: 0, analysis: 0, reporting: 0 };
  currentResult = null;
  liveFeed.innerHTML = "";
  progressFill.style.width = "0%";
  panel.classList.remove("processing");
  stopTimer();
  stopCueRotation();
  stopSimulation();
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
  resultsView.classList.remove("ap-revealing");
  errorView.style.display = "none";
  renderSteps();
}

function showResults(): void {
  processingView.style.display = "none";
  resultsView.style.display = "";
  resultsView.classList.add("ap-revealing");
  errorView.style.display = "none";
  switchTab("summary");
}

function showError(msg: string): void {
  processingView.style.display = "none";
  resultsView.style.display = "none";
  errorView.style.display = "flex";
  errorMsg.textContent = msg;
}

// ── Internal: simulated step cascade ─────────────────────────────────

function startSimulatedCascade(): void {
  stopSimulation();
  simulationRunning = true;

  let elapsed = 0;

  for (let i = 0; i < STEP_ORDER.length; i++) {
    const stepName = STEP_ORDER[i];
    const meta = STEP_META[stepName];

    // Start this step as "running"
    const startDelay = elapsed;
    const startTimer = setTimeout(() => {
      if (!simulationRunning) return;
      stepStates[stepName] = "running";
      renderSteps();
      updateProgress();
      appendFeedLine(meta.agentLabel, `${meta.label} phase initiated`);

      // Schedule feed messages from cues
      scheduleFeedCues(stepName, meta);
    }, startDelay);
    simulationTimers.push(startTimer);

    // Auto-complete this step (unless it's the last — reporting stays running)
    if (meta.simulatedDuration > 0) {
      elapsed += meta.simulatedDuration;
      const completeDelay = elapsed;
      const completeTimer = setTimeout(() => {
        if (!simulationRunning) return;
        stepStates[stepName] = "completed";
        renderSteps();
        updateProgress();
        appendFeedLine(meta.agentLabel, `${meta.label} phase complete ✓`);
      }, completeDelay);
      simulationTimers.push(completeTimer);
    } else {
      // Last step: just start it at this offset
      elapsed += 800; // Small gap before reporting starts
    }
  }
}

function scheduleFeedCues(stepName: StepName, meta: StepMeta): void {
  const cues = meta.cues;
  const interval = meta.simulatedDuration > 0
    ? Math.min(800, meta.simulatedDuration / (cues.length + 1))
    : 1500; // For reporting (stays running), slower feed

  for (let j = 0; j < cues.length; j++) {
    const timer = setTimeout(() => {
      if (!simulationRunning) return;
      if (stepStates[stepName] !== "running") return;
      appendFeedLine(meta.agentLabel, cues[j]);
    }, (j + 1) * interval);
    feedSimulationTimers.push(timer);
  }
}

function stopSimulation(): void {
  simulationRunning = false;
  for (const t of simulationTimers) clearTimeout(t);
  for (const t of feedSimulationTimers) clearTimeout(t);
  simulationTimers = [];
  feedSimulationTimers = [];
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
  while (liveFeed.children.length > 40) liveFeed.removeChild(liveFeed.firstChild!);
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

  // Metrics grid — values start at 0 and count up
  const avgRiskFinal = Math.round(result.analysis.average_risk * 100);
  const highRiskFinal = result.analysis.high_risk_count;
  const totalEntitiesFinal = result.research.entity_ids.length;

  metricsGrid.innerHTML = `
    <div class="ap-metrics-grid">
      <div class="ap-metric-card">
        <div class="ap-metric-value" data-countup="${avgRiskFinal}" data-suffix="%">0%</div>
        <div class="ap-metric-label">Avg Risk</div>
      </div>
      <div class="ap-metric-card">
        <div class="ap-metric-value" data-countup="${highRiskFinal}" data-suffix="">0</div>
        <div class="ap-metric-label">High Risk</div>
      </div>
      <div class="ap-metric-card">
        <div class="ap-metric-value" data-countup="${totalEntitiesFinal}" data-suffix="">0</div>
        <div class="ap-metric-label">Entities</div>
      </div>
    </div>
  `;

  // Start count-up animations
  requestAnimationFrame(() => animateCountUps());

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

  // Entity cards — render with 0-width risk bars, then animate
  const highlights = result.analysis.highlights ?? [];
  if (highlights.length > 0) {
    entityCards.innerHTML = highlights.map((h, i) => {
      const riskPct = (h.risk_score * 100).toFixed(0);
      const riskClass = h.risk_score >= 0.7 ? "high" : h.risk_score >= 0.4 ? "medium" : "low";
      return `
        <div class="ap-entity-card ap-card-reveal" data-entity-id="${escapeHtml(h.entity_id)}" style="animation-delay: ${i * 100}ms">
          <div class="ap-entity-card-header">
            <span class="ap-entity-id">${escapeHtml(h.entity_id)}</span>
            <span class="ap-entity-risk ${riskClass}">${riskPct}%</span>
          </div>
          <div class="ap-entity-risk-bar">
            <div class="ap-entity-risk-fill ${riskClass}" data-risk-width="${riskPct}" style="width: 0%"></div>
          </div>
          <div class="ap-entity-reason">${escapeHtml(h.top_reason)}</div>
          ${h.summary ? `<div class="ap-entity-summary">${escapeHtml(h.summary)}</div>` : ""}
        </div>
      `;
    }).join("");

    // Animate risk bars after a frame
    requestAnimationFrame(() => {
      const fills = entityCards.querySelectorAll<HTMLDivElement>(".ap-entity-risk-fill[data-risk-width]");
      for (const fill of Array.from(fills)) {
        fill.style.width = `${fill.dataset.riskWidth}%`;
      }
    });

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

// ── Internal: count-up animation ─────────────────────────────────────

function animateCountUps(): void {
  const els = metricsGrid.querySelectorAll<HTMLDivElement>("[data-countup]");
  const duration = 600;
  const startTs = performance.now();

  function tick() {
    const elapsed = performance.now() - startTs;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3);

    for (const el of Array.from(els)) {
      const target = parseInt(el.dataset.countup ?? "0", 10);
      const suffix = el.dataset.suffix ?? "";
      const current = Math.round(target * ease);
      el.textContent = `${current}${suffix}`;
    }

    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
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
