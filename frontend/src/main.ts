import "./style.css";
import * as THREE from "three";
import { initScene } from "./scene";
import { NodeLayer, riskColorCSS } from "./graph/NodeLayer";
import { EdgeLayer } from "./graph/EdgeLayer";
import { AssetLayer } from "./graph/AssetLayer";
import {
  getSnapshot,
  getEntity,
  getNeighbors,
  getAIExplanation,
  getStatus,
  getClusters,
  queryNLQ,
  runAgentInvestigation,
  listAgentRuns,
  getAgentPresets,
  type AgentInvestigateResult,
  type AgentRunSummary,
} from "./api/client";
import { ClusterLayer } from "./graph/ClusterLayer";
import * as wizard from "./ui/wizard";
import * as slider from "./ui/slider";
import * as panel from "./ui/panel";
import * as camera from "./ui/camera";
import * as stats from "./ui/stats";
import { addAxisLabels } from "./ui/axisLabels";
import { wsClient } from "./api/ws";
import { Autopilot } from "./camera/Autopilot";
import * as dashboard from "./ui/dashboard";
import { ENTITY_LINK_EVENT, renderMarkdownInto } from "./ui/markdown";
import type { Snapshot, SnapshotNode } from "./types";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #scene-canvas not found");

const ctx = initScene(canvas);
const nodeLayer = new NodeLayer(5000);
ctx.scene.add(nodeLayer.group);
const edgeLayer = new EdgeLayer(ctx.scene);
const clusterLayer = new ClusterLayer(ctx.scene, ctx.camera);
const assetLayer = new AssetLayer(ctx.scene);

// Init wizard with scene + nodeLayer deps
wizard.init({ ctx, nodeLayer });

// Add axis labels to scene
addAxisLabels(ctx.scene);

let currentSnapshot: Snapshot | null = null;
let selectedId: string | null = null;
let currentK = 1;
let aiSummaryRequestToken = 0;

// K-hop control
const khopSelect = document.getElementById("khop-select") as HTMLSelectElement;
khopSelect.addEventListener("change", () => {
  currentK = parseInt(khopSelect.value, 10);
  if (selectedId && currentSnapshot) {
    loadNeighborEdges(selectedId, currentSnapshot.meta.t, currentK);
  }
});

// --- Camera presets ---

document.getElementById("cam-overview")!.addEventListener("click", () => camera.overview(ctx));
document.getElementById("cam-top")!.addEventListener("click", () => camera.topDown(ctx));
document.getElementById("cam-focus")!.addEventListener("click", () => {
  camera.focusEntity(ctx, nodeLayer, selectedId);
});

// --- Data loading ---

async function loadBucket(t: number): Promise<void> {
  try {
    currentSnapshot = await getSnapshot(t);
    nodeLayer.update(currentSnapshot.nodes);
    edgeLayer.clear();
    clusterLayer.clear();
    assetLayer.clear();
    panel.setBucket(t);

    // Load clusters asynchronously
    getClusters(t)
      .then(({ clusters }) => clusterLayer.update(clusters, nodeLayer))
      .catch(() => {/* clusters optional */});

    stats.updateCounts(currentSnapshot.nodes.length, currentSnapshot.edges.length);

    // Restore selection if entity still exists in this bucket
    if (selectedId) {
      const stillExists = currentSnapshot.nodes.some((n) => n.id === selectedId);
      if (!stillExists) {
        selectedId = null;
        panel.hide();
      } else {
        nodeLayer.select(selectedId);
        loadNeighborEdges(selectedId, t, currentK);
      }
    }
  } catch (err) {
    console.error("Failed to load bucket:", err);
  }
}

async function loadNeighborEdges(entityId: string, t: number, k: number): Promise<void> {
  try {
    const neighborhood = await getNeighbors(entityId, t, k);
    const riskScores = new Map<string, number>();
    if (currentSnapshot) {
      for (const node of currentSnapshot.nodes) {
        riskScores.set(node.id, node.risk_score);
      }
    }
    edgeLayer.update(neighborhood.edges, nodeLayer, riskScores);
  } catch (err) {
    console.error("Failed to load neighbors:", err);
  }
}

// --- Selection ---

async function selectEntity(entityId: string | null): Promise<void> {
  selectedId = entityId;
  nodeLayer.select(entityId);

  if (!entityId || !currentSnapshot) {
    aiSummaryRequestToken += 1;
    panel.hide();
    edgeLayer.clear();
    return;
  }

  panel.showLoading();
  try {
    const [detail, neighborhood] = await Promise.all([
      getEntity(entityId, currentSnapshot.meta.t),
      getNeighbors(entityId, currentSnapshot.meta.t, currentK),
    ]);

    // Update edges from the neighborhood data
    const riskScores = new Map<string, number>();
    for (const node of currentSnapshot.nodes) {
      riskScores.set(node.id, node.risk_score);
    }
    edgeLayer.update(neighborhood.edges, nodeLayer, riskScores);

    panel.show(detail, neighborhood);

    // Fire AI summary asynchronously — don't block panel
    const summaryToken = ++aiSummaryRequestToken;
    const summaryBucket = currentSnapshot.meta.t;
    getAIExplanation(entityId, currentSnapshot.meta.t)
      .then((res) => {
        if (
          summaryToken === aiSummaryRequestToken
          && selectedId === entityId
          && currentSnapshot
          && currentSnapshot.meta.t === summaryBucket
        ) {
          panel.setAISummary(res.summary || "AI summary unavailable.");
        }
      })
      .catch(() => panel.setAISummary("AI summary unavailable."));
  } catch (err) {
    console.error("Failed to load entity:", err);
    panel.hide();
  }
}

// --- Node picking ---

canvas.addEventListener("pointerdown", (e) => {
  ctx.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  ctx.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  const hits = ctx.raycaster.intersectObjects(nodeLayer.allMeshes, false);

  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    const hitMesh = hits[0].object as THREE.InstancedMesh;
    const entityId = nodeLayer.getEntityId(hits[0].instanceId, hitMesh);
    if (entityId) selectEntity(entityId);
  } else {
    selectEntity(null);
  }
});

panel.onClose(() => selectEntity(null));

// Counterfactual edge highlighting
panel.onCounterfactual((result) => {
  if (result.removed_edges.length === 0) {
    // Clear counterfactual highlights — restore normal edges
    if (selectedId && currentSnapshot) {
      loadNeighborEdges(selectedId, currentSnapshot.meta.t, currentK);
    }
    return;
  }
  // Show removed edges in red
  edgeLayer.showCounterfactual(result.removed_edges, nodeLayer);
});

window.addEventListener(ENTITY_LINK_EVENT, (event: Event) => {
  const detail = (event as CustomEvent<{ entityId?: string }>).detail;
  const entityId = detail?.entityId;
  if (!entityId || !currentSnapshot) return;
  void selectEntity(entityId);
  camera.focusEntity(ctx, nodeLayer, entityId);
});

// --- Slider ---

slider.onChange((t) => loadBucket(t));

// --- WebSocket live updates ---

wsClient.onEvent((event, data) => {
  if (event === "RISK_UPDATED" && currentSnapshot) {
    const bucketData = data as { bucket: number; entity_risks: Record<string, number> };
    if (bucketData.bucket !== currentSnapshot.meta.t) return;

    // Update risk scores in current snapshot
    const riskMap = bucketData.entity_risks;
    const updatedNodes: SnapshotNode[] = currentSnapshot.nodes.map((node) => ({
      ...node,
      risk_score: riskMap[node.id] ?? node.risk_score,
    }));
    currentSnapshot = { ...currentSnapshot, nodes: updatedNodes };
    nodeLayer.update(updatedNodes);

    // Re-select to update edges if needed
    if (selectedId) {
      nodeLayer.select(selectedId);
    }
  }

  if (event === "CLUSTER_DETECTED") {
    console.log("Cluster detected:", data);
  }

  // --- Asset hot-loading ---
  if (event === "ASSET_READY" && currentSnapshot) {
    const assetData = data as {
      asset_id: string;
      asset_type: "cluster_blob" | "beacon";
      bucket: number;
      url: string;
    };
    if (assetData.bucket !== currentSnapshot.meta.t) return;

    // Determine entity IDs for positioning
    const entityIds = getAssetEntityIds(assetData.asset_id);
    assetLayer.loadGLB(
      assetData.asset_id,
      assetData.url,
      assetData.asset_type,
      entityIds,
      assetData.bucket,
      nodeLayer,
    );
  }

  if (event === "ASSET_FALLBACK" && currentSnapshot) {
    const fallback = data as {
      asset_id: string;
      asset_type: "cluster_blob" | "beacon";
      bucket: number;
      entity_ids?: string[];
      entity_id?: string;
      risk_score: number;
    };
    if (fallback.bucket !== currentSnapshot.meta.t) return;

    const entityIds = fallback.entity_ids ?? (fallback.entity_id ? [fallback.entity_id] : []);
    assetLayer.addFallback(
      fallback.asset_id,
      fallback.asset_type,
      entityIds,
      fallback.bucket,
      nodeLayer,
    );
  }

  handleAgentEvent(event, data);
});

/** Resolve entity IDs for an asset (from recent CLUSTER_DETECTED events or single beacon). */
const recentClusters = new Map<string, string[]>();

// Capture cluster entity_ids from CLUSTER_DETECTED events
wsClient.onEvent((event, data) => {
  if (event === "CLUSTER_DETECTED") {
    const cluster = data as { cluster_id: string; entity_ids: string[] };
    recentClusters.set(cluster.cluster_id, cluster.entity_ids);
  }
});

function getAssetEntityIds(assetId: string): string[] {
  // Check if it's a cluster
  const clusterIds = recentClusters.get(assetId);
  if (clusterIds) return clusterIds;

  // Beacon: extract entity ID from "beacon_{entityId}"
  if (assetId.startsWith("beacon_")) {
    return [assetId.slice("beacon_".length)];
  }

  return [];
}

// --- Hover tooltip ---

const tooltip = document.createElement("div");
tooltip.id = "node-tooltip";
tooltip.style.display = "none";
document.body.appendChild(tooltip);

let hoveredId: string | null = null;

canvas.addEventListener("pointermove", (e) => {
  ctx.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  ctx.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  const hits = ctx.raycaster.intersectObjects(nodeLayer.allMeshes, false);

  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    const hitMesh = hits[0].object as THREE.InstancedMesh;
    const entityId = nodeLayer.getEntityId(hits[0].instanceId, hitMesh);
    if (entityId && entityId !== hoveredId) {
      hoveredId = entityId;
      const node = currentSnapshot?.nodes.find((n) => n.id === entityId);
      if (node) {
        tooltip.innerHTML = `
          <div class="tooltip-id">${entityId}</div>
          <div class="tooltip-type">${node.entity_type}</div>
          <div class="tooltip-risk" style="color:${riskColorCSS(node.risk_score)}">
            Risk: ${(node.risk_score * 100).toFixed(0)}%
          </div>
          <div class="tooltip-vol">Vol: $${node.volume >= 1000 ? (node.volume / 1000).toFixed(1) + "K" : node.volume.toFixed(0)}</div>
        `;
      }
    }
    tooltip.style.display = "block";
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY - 8}px`;
  } else {
    hoveredId = null;
    tooltip.style.display = "none";
  }
});

// --- Autopilot ---

const autopilot = new Autopilot(ctx, nodeLayer);
const autopilotBtn = document.getElementById("autopilot-btn") as HTMLButtonElement;

autopilot.onState((state) => {
  autopilotBtn.textContent = state === "running" ? "STOP" : "AUTOPILOT";
  autopilotBtn.classList.toggle("running", state === "running");
});

autopilotBtn.addEventListener("click", () => {
  if (!currentSnapshot) return;
  autopilot.toggle(currentSnapshot.meta.t);
});

// --- Dashboard ---

const dashboardBtn = document.getElementById("dashboard-btn") as HTMLButtonElement;

dashboard.onToggle((open) => {
  dashboardBtn.classList.toggle("active", open);
  dashboardBtn.textContent = open ? "GRAPH" : "EXEC";
});

dashboardBtn.addEventListener("click", () => {
  if (!currentSnapshot) return;
  dashboard.toggle(currentSnapshot.meta.t);
});

// --- NLQ Query Bar ---

const nlqBar = document.getElementById("nlq-bar") as HTMLDivElement;
const nlqInput = document.getElementById("nlq-input") as HTMLInputElement;
const nlqSubmit = document.getElementById("nlq-submit") as HTMLButtonElement;
const agentSubmit = document.getElementById("agent-submit") as HTMLButtonElement;
const nlqClear = document.getElementById("nlq-clear") as HTMLButtonElement;
const nlqResult = document.getElementById("nlq-result") as HTMLDivElement;
const nlqInterpretation = document.getElementById("nlq-interpretation") as HTMLSpanElement;
const nlqSummary = document.getElementById("nlq-summary") as HTMLSpanElement;
const agentPresets = document.getElementById("agent-presets") as HTMLDivElement;
const agentIncludeSar = document.getElementById("agent-include-sar") as HTMLInputElement;
const agentMaxTargets = document.getElementById("agent-max-targets") as HTMLSelectElement;
const agentProfile = document.getElementById("agent-profile") as HTMLSelectElement;
const agentResult = document.getElementById("agent-result") as HTMLDivElement;
const agentStatus = document.getElementById("agent-status") as HTMLSpanElement;
const agentRunId = document.getElementById("agent-run-id") as HTMLSpanElement;
const agentProgressFill = document.getElementById("agent-progress-fill") as HTMLDivElement;
const agentSteps = document.getElementById("agent-steps") as HTMLDivElement;
const agentMetrics = document.getElementById("agent-metrics") as HTMLDivElement;
const agentTopEntities = document.getElementById("agent-top-entities") as HTMLDivElement;
const agentSummary = document.getElementById("agent-summary") as HTMLDivElement;
const agentHistory = document.getElementById("agent-history") as HTMLDivElement;

type AgentStepStatus = "pending" | "running" | "completed" | "failed";
type AgentProfile = "fast" | "balanced" | "deep";
const AGENT_STEP_ORDER = ["intake", "research", "analysis", "reporting"] as const;

let nlqAbortController: AbortController | null = null;
let nlqRequestSeq = 0;
let agentAbortController: AbortController | null = null;
let agentRequestRunning = false;
let agentRequestSeq = 0;
let activeAgentRunId: string | null = null;
let agentRunSummaries: AgentRunSummary[] = [];
let agentStepState: Record<string, AgentStepStatus> = {
  intake: "pending",
  research: "pending",
  analysis: "pending",
  reporting: "pending",
};

const FALLBACK_AGENT_PRESETS: {
  id: string;
  label: string;
  query: string;
  profile: AgentProfile;
  include_sar: boolean;
  max_targets: number;
}[] = [
  {
    id: "high-risk",
    label: "High Risk Entities",
    query: "show high risk entities",
    profile: "balanced",
    include_sar: false,
    max_targets: 5,
  },
  {
    id: "large-incoming",
    label: "Large Incoming Flows",
    query: "show entities receiving large transaction volumes",
    profile: "balanced",
    include_sar: true,
    max_targets: 3,
  },
  {
    id: "structuring",
    label: "Structuring Patterns",
    query: "find structuring near threshold transactions",
    profile: "deep",
    include_sar: true,
    max_targets: 5,
  },
];

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function setAgentProgress(progressPct: number): void {
  const clamped = Math.max(0, Math.min(100, progressPct));
  agentProgressFill.style.width = `${clamped}%`;
}

function computeAgentProgress(): number {
  const total = AGENT_STEP_ORDER.length;
  const completed = AGENT_STEP_ORDER.filter((name) => agentStepState[name] === "completed").length;
  const hasRunning = AGENT_STEP_ORDER.some((name) => agentStepState[name] === "running");
  let pct = (completed / total) * 100;
  if (hasRunning && completed < total) pct += 100 / (total * 2);
  return Math.round(Math.min(99, pct));
}

function resetAgentSteps(): void {
  agentStepState = {
    intake: "pending",
    research: "pending",
    analysis: "pending",
    reporting: "pending",
  };
  renderAgentSteps();
  setAgentProgress(0);
}

function renderAgentSteps(): void {
  agentSteps.innerHTML = AGENT_STEP_ORDER
    .map((name) => {
      const status = agentStepState[name] ?? "pending";
      return `<span class="agent-step-pill ${status}">${name}</span>`;
    })
    .join("");
}

function setAgentStatus(text: string, tone: "info" | "ok" | "warn" | "error" = "info"): void {
  agentStatus.textContent = text;
  if (tone === "ok") {
    agentStatus.style.color = "#66d3b3";
  } else if (tone === "warn") {
    agentStatus.style.color = "#ffcc66";
  } else if (tone === "error") {
    agentStatus.style.color = "#ff7a6b";
  } else {
    agentStatus.style.color = "#88b";
  }
}

function setAgentRunning(running: boolean): void {
  agentRequestRunning = running;
  agentSubmit.classList.toggle("running", running);
  agentSubmit.textContent = running ? "CANCEL" : "AGENT";
  agentSubmit.title = running ? "Cancel client wait for this run" : "Run multi-agent investigation";
  agentIncludeSar.disabled = running;
  agentMaxTargets.disabled = running;
  agentProfile.disabled = running;
  nlqBar.classList.toggle("agent-running", running);
}

function setAgentStepStatus(agent: string, status: AgentStepStatus): void {
  if (!Object.prototype.hasOwnProperty.call(agentStepState, agent)) return;
  agentStepState[agent] = status;
  renderAgentSteps();
  setAgentProgress(computeAgentProgress());
}

function setAgentSummaryMarkdown(markdown: string): void {
  renderMarkdownInto(agentSummary, markdown || "No report content yet.");
}

function applyAgentGraphResult(result: AgentInvestigateResult): void {
  if (!currentSnapshot) return;
  const entityIds = result.research?.entity_ids ?? [];
  if (entityIds.length > 0) {
    nodeLayer.highlight(entityIds);
  } else {
    nodeLayer.clearHighlight();
  }

  const resultAny = result as unknown as {
    research?: {
      edges?: { from_id: string; to_id: string; amount: number }[];
      edges_preview?: { from_id: string; to_id: string; amount: number }[];
    };
  };
  const edges = resultAny.research?.edges?.length
    ? resultAny.research.edges
    : (resultAny.research?.edges_preview ?? []);

  if (edges.length > 0) {
    const riskScores = new Map<string, number>();
    for (const node of currentSnapshot.nodes) {
      riskScores.set(node.id, node.risk_score);
    }
    edgeLayer.update(edges, nodeLayer, riskScores);
  }
}

function renderAgentTopEntities(result: AgentInvestigateResult): void {
  const highlights = result.analysis.highlights ?? [];
  const fallbackIds = result.research.entity_ids ?? [];
  if (highlights.length === 0 && fallbackIds.length === 0) {
    agentTopEntities.innerHTML = "";
    return;
  }

  const items = (highlights.length > 0
    ? highlights.slice(0, 5).map((h) => ({
      entity_id: h.entity_id,
      label: `${h.entity_id} (${Math.round((h.risk_score ?? 0) * 100)}%)`,
    }))
    : fallbackIds.slice(0, 5).map((id) => ({ entity_id: id, label: id })));

  agentTopEntities.innerHTML = items
    .map((item) => `<button class="agent-entity-chip" data-entity-id="${item.entity_id}">${item.label}</button>`)
    .join("");

  for (const btn of Array.from(agentTopEntities.querySelectorAll<HTMLButtonElement>(".agent-entity-chip"))) {
    btn.addEventListener("click", () => {
      const entityId = btn.dataset.entityId;
      if (!entityId) return;
      void selectEntity(entityId);
    });
  }
}

function renderAgentHistory(): void {
  if (agentRunSummaries.length === 0) {
    agentHistory.innerHTML = "";
    return;
  }

  agentHistory.innerHTML = `
    <div class="agent-history-title">Recent Runs</div>
    ${agentRunSummaries.slice(0, 4).map((run) => `
      <div class="agent-history-row" data-run-id="${run.run_id}">
        <span>${run.status.toUpperCase()} ${Math.round(run.progress)}%</span>
        <span title="${run.query}">${run.query.slice(0, 36)}${run.query.length > 36 ? "..." : ""}</span>
      </div>
    `).join("")}
  `;

  for (const row of Array.from(agentHistory.querySelectorAll<HTMLDivElement>(".agent-history-row"))) {
    row.addEventListener("click", () => {
      const runId = row.dataset.runId;
      const run = agentRunSummaries.find((r) => r.run_id === runId);
      if (!run) return;
      nlqInput.value = run.query;
      agentProfile.value = run.profile;
      setAgentStatus(`Loaded run context: ${run.status.toUpperCase()} (${run.run_id.slice(0, 8)})`, "info");
    });
  }
}

async function refreshAgentHistory(): Promise<void> {
  try {
    const { runs } = await listAgentRuns(6);
    agentRunSummaries = runs;
    renderAgentHistory();
  } catch {
    // optional UX enhancement
  }
}

function renderAgentPresets(
  presets: { id: string; label: string; query: string; profile: AgentProfile; include_sar: boolean; max_targets: number }[],
): void {
  agentPresets.innerHTML = presets
    .map((preset) => `<button class="agent-preset-chip" data-preset-id="${preset.id}">${preset.label}</button>`)
    .join("");

  for (const btn of Array.from(agentPresets.querySelectorAll<HTMLButtonElement>(".agent-preset-chip"))) {
    btn.addEventListener("click", () => {
      const preset = presets.find((p) => p.id === btn.dataset.presetId);
      if (!preset) return;
      nlqInput.value = preset.query;
      agentProfile.value = preset.profile;
      agentIncludeSar.checked = preset.include_sar;
      agentMaxTargets.value = String(preset.max_targets);
      setAgentStatus(`Preset loaded: ${preset.label}`, "info");
    });
  }
}

async function loadAgentPresetsUI(): Promise<void> {
  try {
    const { presets } = await getAgentPresets();
    renderAgentPresets(presets);
  } catch {
    renderAgentPresets(FALLBACK_AGENT_PRESETS);
  }
}

function handleAgentEvent(event: string, data: Record<string, unknown>): void {
  if (!event.startsWith("AGENT_")) return;

  const runId = typeof data.run_id === "string" ? data.run_id : null;
  if (runId) {
    if (!activeAgentRunId) {
      if (!agentRequestRunning) return;
      activeAgentRunId = runId;
      agentRunId.textContent = runId;
    } else if (runId !== activeAgentRunId) {
      return;
    }
  } else if (!activeAgentRunId && !agentRequestRunning) {
    return;
  }

  if (event === "AGENT_RUN_STARTED") {
    agentResult.style.display = "flex";
    setAgentProgress(4);
    setAgentStatus("Run started. Agents are executing...", "info");
    return;
  }

  if (event === "AGENT_STEP") {
    const agent = typeof data.agent === "string" ? data.agent : "";
    const status = typeof data.status === "string" ? data.status : "";
    if (agent && (status === "running" || status === "completed" || status === "failed")) {
      setAgentStepStatus(agent, status as AgentStepStatus);
    }
    if (typeof data.detail === "string") {
      setAgentStatus(data.detail, status === "failed" ? "error" : "info");
    }
    return;
  }

  if (event === "AGENT_RUN_COMPLETED") {
    setAgentProgress(100);
    setAgentStatus("Run completed.", "ok");
    return;
  }

  if (event === "AGENT_RUN_FAILED") {
    const errMsg = typeof data.error === "string" ? data.error : "Agent run failed.";
    setAgentStatus(errMsg, "error");
  }
}

async function runAgentFlow(): Promise<void> {
  const query = nlqInput.value.trim();
  if (!query || !currentSnapshot) return;

  if (agentRequestRunning) {
    agentAbortController?.abort();
    return;
  }

  const bucket = currentSnapshot.meta.t;
  const includeSar = agentIncludeSar.checked;
  const maxTargets = Number(agentMaxTargets.value || "5");
  const profile = (agentProfile.value || "balanced") as AgentProfile;

  activeAgentRunId = null;
  agentRunId.textContent = "";
  setAgentSummaryMarkdown("The graph remains interactive while this run executes.");
  agentMetrics.textContent = "";
  agentTopEntities.innerHTML = "";
  agentResult.style.display = "flex";
  resetAgentSteps();
  setAgentProgress(5);
  setAgentStatus("Submitting run request...", "info");
  setAgentRunning(true);

  const requestSeq = ++agentRequestSeq;
  agentAbortController = new AbortController();

  try {
    const result = await runAgentInvestigation(
      {
        query,
        bucket,
        include_sar: includeSar,
        max_targets: maxTargets,
        profile,
      },
      agentAbortController.signal,
    );

    if (requestSeq !== agentRequestSeq) return;

    activeAgentRunId = result.run_id;
    agentRunId.textContent = result.run_id;
    setAgentStatus("Run completed.", "ok");
    setAgentStepStatus("intake", "completed");
    setAgentStepStatus("research", "completed");
    setAgentStepStatus("analysis", "completed");
    setAgentStepStatus("reporting", "completed");
    setAgentProgress(100);

    const reportText = result.reporting?.narrative ?? "";
    const sarSuffix = result.reporting?.sar ? "\n\n**SAR:** Draft generated for top entity." : "";
    setAgentSummaryMarkdown(`${reportText}${sarSuffix}`);
    agentMetrics.textContent = `${result.profile.toUpperCase()} profile • ${result.research.total_targets_found} candidates • ${result.analysis.high_risk_count} high-risk selected • avg risk ${Math.round(result.analysis.average_risk * 100)}%`;
    renderAgentTopEntities(result);

    nlqInterpretation.textContent = result.interpretation || result.intent;
    nlqSummary.textContent = result.research?.summary || "Agent run completed.";
    nlqResult.style.display = "flex";
    nlqClear.style.display = "inline-block";

    applyAgentGraphResult(result);
    await refreshAgentHistory();
  } catch (err) {
    if (requestSeq !== agentRequestSeq) return;
    if (isAbortError(err)) {
      setAgentStatus("Client wait canceled. Server run may still complete.", "warn");
      setAgentSummaryMarkdown("You can still retrieve the run from `/api/agent/runs`.");
      setAgentProgress(computeAgentProgress());
      await refreshAgentHistory();
    } else {
      setAgentStatus("Run failed.", "error");
      setAgentSummaryMarkdown(err instanceof Error ? err.message : "Unknown error");
      setAgentProgress(computeAgentProgress());
      await refreshAgentHistory();
    }
  } finally {
    if (requestSeq !== agentRequestSeq) return;
    setAgentRunning(false);
    agentAbortController = null;
  }
}

async function runNLQ(): Promise<void> {
  const query = nlqInput.value.trim();
  if (!query || !currentSnapshot) return;

  nlqAbortController?.abort();
  const requestSeq = ++nlqRequestSeq;
  nlqAbortController = new AbortController();

  nlqBar.classList.add("loading");
  nlqSubmit.disabled = true;

  try {
    const result = await queryNLQ(query, currentSnapshot.meta.t, nlqAbortController.signal);
    if (requestSeq !== nlqRequestSeq) return;

    // Show interpretation
    nlqInterpretation.textContent = result.interpretation;
    nlqSummary.textContent = result.summary;
    nlqResult.style.display = "flex";
    nlqClear.style.display = "inline-block";

    // Highlight matching nodes
    if (result.entity_ids.length > 0) {
      nodeLayer.highlight(result.entity_ids);

      // Show matching edges
      const riskScores = new Map<string, number>();
      for (const node of currentSnapshot.nodes) {
        riskScores.set(node.id, node.risk_score);
      }
      edgeLayer.update(result.edges, nodeLayer, riskScores);
    } else {
      nodeLayer.clearHighlight();
      nlqSummary.textContent = "No matching entities found.";
    }
  } catch (err) {
    if (requestSeq !== nlqRequestSeq || isAbortError(err)) return;
    nlqInterpretation.textContent = "Query failed";
    nlqSummary.textContent = err instanceof Error ? err.message : "Unknown error";
    nlqResult.style.display = "flex";
  } finally {
    if (requestSeq !== nlqRequestSeq) return;
    nlqBar.classList.remove("loading");
    nlqSubmit.disabled = false;
    nlqAbortController = null;
  }
}

function clearNLQ(): void {
  nlqAbortController?.abort();
  agentAbortController?.abort();
  nodeLayer.clearHighlight();
  edgeLayer.clear();
  nlqResult.style.display = "none";
  nlqClear.style.display = "none";
  nlqInput.value = "";
  activeAgentRunId = null;
  agentRunId.textContent = "";
  setAgentSummaryMarkdown("Cleared. Select a preset or type a new query.");
  agentMetrics.textContent = "";
  agentTopEntities.innerHTML = "";
  agentResult.style.display = "flex";
  resetAgentSteps();
  setAgentStatus("Idle");
  setAgentRunning(false);

  // Restore edges for selected entity if any
  if (selectedId && currentSnapshot) {
    loadNeighborEdges(selectedId, currentSnapshot.meta.t, currentK);
  }
}

resetAgentSteps();
setAgentStatus("Idle");
setAgentProgress(0);

nlqSubmit.addEventListener("click", () => runNLQ());
agentSubmit.addEventListener("click", () => runAgentFlow());
nlqInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    runAgentFlow();
    return;
  }
  if (e.key === "Enter") runNLQ();
  if (e.key === "Escape") clearNLQ();
});
nlqClear.addEventListener("click", clearNLQ);

// --- Per-frame updates ---
let lastFrameTime = performance.now();
ctx.onFrame(() => {
  const now = performance.now();
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  nodeLayer.animate(dt);
  clusterLayer.animate();
  autopilot.tick(dt);
  assetLayer.animate();
  edgeLayer.animate(dt);
  stats.tick();
});

// --- Re-upload button ---

const reuploadBtn = document.getElementById("reupload-btn") as HTMLButtonElement;
reuploadBtn.addEventListener("click", () => {
  wizard.show();
  reuploadBtn.style.display = "none";
});

// --- Init ---

async function startGraph(preloaded?: Snapshot): Promise<void> {
  const snapshot = preloaded ?? await getSnapshot(0);
  slider.init(snapshot.meta.n_buckets, 0);
  currentSnapshot = snapshot;
  nodeLayer.update(snapshot.nodes);
  stats.updateCounts(snapshot.nodes.length, snapshot.edges.length);

  // Show graph UI
  reuploadBtn.style.display = "block";
  document.getElementById("time-controls")!.style.display = "flex";
  document.getElementById("legend")!.style.display = "block";
  document.getElementById("camera-presets")!.style.display = "flex";
  document.getElementById("stats-overlay")!.style.display = "flex";
  document.getElementById("action-bar")!.style.display = "flex";
  document.getElementById("nlq-bar")!.style.display = "flex";

  // Connect WebSocket
  wsClient.connect();
  loadAgentPresetsUI().catch(() => {
    // optional enhancement; fallback handled internally
  });
  refreshAgentHistory().catch(() => {
    // optional enhancement
  });
}

wizard.onLoaded((snapshot) => {
  startGraph(snapshot).catch(console.error);
});

async function init(): Promise<void> {
  // Hide graph UI initially
  document.getElementById("time-controls")!.style.display = "none";
  document.getElementById("legend")!.style.display = "none";
  document.getElementById("camera-presets")!.style.display = "none";
  document.getElementById("stats-overlay")!.style.display = "none";
  document.getElementById("action-bar")!.style.display = "none";
  document.getElementById("nlq-bar")!.style.display = "none";

  try {
    const status = await getStatus();
    if (status.loaded) {
      wizard.hide();
      await startGraph();
    } else {
      wizard.show();
    }
  } catch {
    // Backend not ready or status endpoint missing — show wizard
    wizard.show();
  }
}

init().catch(console.error);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__angela = {
    ctx,
    nodeLayer,
    edgeLayer,
    clusterLayer,
    assetLayer,
  };
}
