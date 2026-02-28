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
import type { EntityDetail, Neighborhood, Snapshot, SnapshotNode } from "./types";
import { SkyboxLayer } from "./skybox";
import { AmbientAudioController, type AmbientAudioState } from "./ambientAudio";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #scene-canvas not found");

const skyboxFaces = [
  new URL("../media/right.png", import.meta.url).href,
  new URL("../media/left.png", import.meta.url).href,
  new URL("../media/middle.png", import.meta.url).href,
  new URL("../media/bottom.png", import.meta.url).href,
  new URL("../media/front.png", import.meta.url).href,
  new URL("../media/back.png", import.meta.url).href,
] as const;
const ambienceIntroUrl = new URL("../media/angela_track_intro.ogg", import.meta.url).href;
const ambienceLoopUrl = new URL("../media/angela_track_loop.ogg", import.meta.url).href;

const ctx = initScene(canvas);
const skybox = new SkyboxLayer(ctx.scene, {
  faces: skyboxFaces,
});
const ambience = new AmbientAudioController({
  introUrl: ambienceIntroUrl,
  loopUrl: ambienceLoopUrl,
});
ambience.armUserGestureUnlock();
const sceneFog = ctx.scene.fog instanceof THREE.FogExp2 ? ctx.scene.fog : null;
const baseFogDensity = sceneFog?.density ?? 0;
const baseBloomStrength = ctx.bloomPass.strength;
const baseBloomRadius = ctx.bloomPass.radius;
const baseBloomThreshold = ctx.bloomPass.threshold;
const baseExposure = ctx.renderer.toneMappingExposure;
const PITCH_MODE_STORAGE_KEY = "angela.pitch_mode";
let pitchModeEnabled = false;

function applyPitchMode(enabled: boolean): void {
  pitchModeEnabled = enabled;
  document.body.classList.toggle("pitch-mode", enabled);
  skybox.setPitchMode(enabled);
  ambience.setPitchMode(enabled);

  if (enabled) {
    ctx.bloomPass.strength = baseBloomStrength * 1.35;
    ctx.bloomPass.radius = Math.min(1.2, baseBloomRadius + 0.14);
    ctx.bloomPass.threshold = Math.max(0.66, baseBloomThreshold - 0.06);
    ctx.renderer.toneMappingExposure = baseExposure * 1.15;
    if (sceneFog) {
      sceneFog.density = Math.max(0.010, baseFogDensity * 0.9);
    }
  } else {
    ctx.bloomPass.strength = baseBloomStrength;
    ctx.bloomPass.radius = baseBloomRadius;
    ctx.bloomPass.threshold = baseBloomThreshold;
    ctx.renderer.toneMappingExposure = baseExposure;
    if (sceneFog) {
      sceneFog.density = baseFogDensity;
    }
  }

  const pitchBtn = document.getElementById("pitch-mode-btn") as HTMLButtonElement | null;
  if (pitchBtn) {
    pitchBtn.classList.toggle("active", enabled);
    pitchBtn.textContent = enabled ? "PITCH ON" : "PITCH";
    pitchBtn.title = enabled ? "Disable cinematic pitch mode (Shift+P)" : "Enable cinematic pitch mode (Shift+P)";
  }

  try {
    localStorage.setItem(PITCH_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore restricted localStorage environments
  }
}

function togglePitchMode(): void {
  applyPitchMode(!pitchModeEnabled);
}

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
const ENTITY_DETAIL_CACHE_MAX = 320;
const ENTITY_NEIGHBOR_CACHE_MAX = 480;
const ENTITY_SUMMARY_CACHE_MAX = 320;
const entityDetailCache = new Map<string, EntityDetail>();
const entityNeighborCache = new Map<string, Neighborhood>();
const entitySummaryCache = new Map<string, string>();
let entityLoadAbortController: AbortController | null = null;
let aiSummaryAbortController: AbortController | null = null;
let entitySelectionRequestSeq = 0;

function detailCacheKey(entityId: string, t: number): string {
  return `${t}:${entityId}`;
}

function neighborCacheKey(entityId: string, t: number, k: number): string {
  return `${t}:${k}:${entityId}`;
}

function lruGet<T>(cache: Map<string, T>, key: string): T | null {
  const value = cache.get(key);
  if (value === undefined) return null;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function lruSet<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function clearEntityInteractionCaches(): void {
  entityDetailCache.clear();
  entityNeighborCache.clear();
  entitySummaryCache.clear();
}

function getRiskScoreMap(snapshot: Snapshot): Map<string, number> {
  const riskScores = new Map<string, number>();
  for (const node of snapshot.nodes) {
    riskScores.set(node.id, node.risk_score);
  }
  return riskScores;
}

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

// --- Legend collapse/expand ---

const legend = document.getElementById("legend") as HTMLDivElement | null;
const legendToggleBtn = document.getElementById("legend-toggle-btn") as HTMLButtonElement | null;
const legendSubtitle = document.getElementById("legend-subtitle") as HTMLDivElement | null;

function applyLegendCollapsed(collapsed: boolean): void {
  if (!legend || !legendToggleBtn) return;
  legend.classList.toggle("collapsed", collapsed);
  legendToggleBtn.title = collapsed ? "Expand visual guide" : "Minimize visual guide";
  legendToggleBtn.setAttribute("aria-label", collapsed ? "Expand visual guide" : "Minimize visual guide");
  legendToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  if (legendSubtitle) {
    legendSubtitle.textContent = collapsed ? "Visual Guide (Minimized)" : "Visual Guide";
  }
}

if (legend && legendToggleBtn) {
  legendToggleBtn.addEventListener("click", () => {
    applyLegendCollapsed(!legend.classList.contains("collapsed"));
  });
  // Start fully expanded for first-time viewers and judges.
  applyLegendCollapsed(false);
}

// --- Data loading ---

async function loadBucket(t: number): Promise<void> {
  try {
    currentSnapshot = await getSnapshot(t);
    nodeLayer.update(currentSnapshot.nodes);
    edgeLayer.clear();
    clusterLayer.clear();
    assetLayer.clear();
    panel.setBucket(t, currentSnapshot.meta.n_buckets);

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
  const cacheKey = neighborCacheKey(entityId, t, k);
  try {
    let neighborhood = lruGet(entityNeighborCache, cacheKey);
    if (!neighborhood) {
      neighborhood = await getNeighbors(entityId, t, k);
      lruSet(entityNeighborCache, cacheKey, neighborhood, ENTITY_NEIGHBOR_CACHE_MAX);
    }

    if (!currentSnapshot || currentSnapshot.meta.t !== t) return;
    if (selectedId && selectedId !== entityId) return;

    edgeLayer.update(neighborhood.edges, nodeLayer, getRiskScoreMap(currentSnapshot));
  } catch (err) {
    if (isAbortError(err)) return;
    console.error("Failed to load neighbors:", err);
  }
}

// --- Selection ---

async function selectEntity(entityId: string | null): Promise<void> {
  if (entityId && entityId === selectedId && currentSnapshot) {
    return;
  }

  selectedId = entityId;
  nodeLayer.select(entityId);
  entitySelectionRequestSeq += 1;
  const selectionSeq = entitySelectionRequestSeq;

  entityLoadAbortController?.abort();
  entityLoadAbortController = null;
  aiSummaryAbortController?.abort();
  aiSummaryAbortController = null;

  if (!entityId || !currentSnapshot) {
    aiSummaryRequestToken += 1;
    panel.hide();
    edgeLayer.clear();
    return;
  }

  const bucket = currentSnapshot.meta.t;
  const k = currentK;
  const detailKey = detailCacheKey(entityId, bucket);
  const neighborsKey = neighborCacheKey(entityId, bucket, k);
  const summaryKey = detailCacheKey(entityId, bucket);
  const cachedDetail = lruGet(entityDetailCache, detailKey);
  const cachedNeighbors = lruGet(entityNeighborCache, neighborsKey);

  if (!cachedDetail || !cachedNeighbors) {
    panel.showLoading();
  }

  entityLoadAbortController = new AbortController();
  try {
    const [detail, neighborhood] = await Promise.all([
      cachedDetail
        ? Promise.resolve(cachedDetail)
        : getEntity(entityId, bucket, entityLoadAbortController.signal).then((value) => {
          lruSet(entityDetailCache, detailKey, value, ENTITY_DETAIL_CACHE_MAX);
          return value;
        }),
      cachedNeighbors
        ? Promise.resolve(cachedNeighbors)
        : getNeighbors(entityId, bucket, k, entityLoadAbortController.signal).then((value) => {
          lruSet(entityNeighborCache, neighborsKey, value, ENTITY_NEIGHBOR_CACHE_MAX);
          return value;
        }),
    ]);

    if (
      selectionSeq !== entitySelectionRequestSeq
      || selectedId !== entityId
      || !currentSnapshot
      || currentSnapshot.meta.t !== bucket
    ) {
      return;
    }

    edgeLayer.update(neighborhood.edges, nodeLayer, getRiskScoreMap(currentSnapshot));

    panel.show(detail, neighborhood);

    // Fire AI summary asynchronously — don't block panel
    const summaryToken = ++aiSummaryRequestToken;
    const cachedSummary = lruGet(entitySummaryCache, summaryKey);
    if (cachedSummary) {
      if (
        summaryToken === aiSummaryRequestToken
        && selectedId === entityId
        && currentSnapshot
        && currentSnapshot.meta.t === bucket
      ) {
        panel.setAISummary(cachedSummary);
      }
      return;
    }

    aiSummaryAbortController = new AbortController();
    getAIExplanation(entityId, bucket, aiSummaryAbortController.signal)
      .then((res) => {
        const summary = (res.summary || "").trim();
        if (summary) {
          lruSet(entitySummaryCache, summaryKey, summary, ENTITY_SUMMARY_CACHE_MAX);
          return summary;
        }
        return "AI summary unavailable.";
      })
      .then((summary) => {
        if (
          summaryToken === aiSummaryRequestToken
          && selectedId === entityId
          && currentSnapshot
          && currentSnapshot.meta.t === bucket
        ) {
          panel.setAISummary(summary);
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        if (
          summaryToken === aiSummaryRequestToken
          && selectedId === entityId
          && currentSnapshot
          && currentSnapshot.meta.t === bucket
        ) {
          panel.setAISummary("AI summary unavailable.");
        }
      });
  } catch (err) {
    if (isAbortError(err)) return;
    console.error("Failed to load entity:", err);
    panel.hide();
  } finally {
    entityLoadAbortController = null;
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
const ambienceBtn = document.getElementById("ambience-btn") as HTMLButtonElement;

function renderAmbienceButton(state: AmbientAudioState): void {
  ambienceBtn.classList.toggle("active", state.enabled);
  ambienceBtn.classList.toggle("muted", !state.enabled);
  ambienceBtn.classList.toggle("ducked", state.enabled && state.voiceoverActive);

  if (!state.enabled) {
    ambienceBtn.textContent = "MUSIC";
    ambienceBtn.title = "Enable soft ambience (Shift+M)";
    return;
  }

  if (!state.ready) {
    ambienceBtn.textContent = "MUSIC ARM";
    ambienceBtn.title = "Click to unlock soft ambience audio (Shift+M)";
    return;
  }

  ambienceBtn.textContent = state.voiceoverActive ? "MUSIC DUCK" : "MUSIC ON";
  ambienceBtn.title = state.voiceoverActive
    ? "Ambience ducked for voice-over compatibility (Shift+M)"
    : "Disable soft ambience (Shift+M)";
}

ambience.onStateChange(renderAmbienceButton);
ambienceBtn.addEventListener("click", () => {
  ambience.toggleEnabled();
});

autopilot.onState((state) => {
  autopilotBtn.textContent = state === "running" ? "STOP" : "AUTOPILOT";
  autopilotBtn.classList.toggle("running", state === "running");
  ambience.setAutopilotActive(state === "running");
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

const pitchModeBtn = document.getElementById("pitch-mode-btn") as HTMLButtonElement;
pitchModeBtn.addEventListener("click", () => togglePitchMode());

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (e.shiftKey && key === "p") {
    e.preventDefault();
    togglePitchMode();
    return;
  }
  if (e.shiftKey && key === "m") {
    e.preventDefault();
    ambience.toggleEnabled();
  }
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
const agentCollapseToggle = document.getElementById("agent-collapse-toggle") as HTMLButtonElement;
const agentProgressFill = document.getElementById("agent-progress-fill") as HTMLDivElement;
const agentSteps = document.getElementById("agent-steps") as HTMLDivElement;
const agentMetrics = document.getElementById("agent-metrics") as HTMLDivElement;
const agentTopEntities = document.getElementById("agent-top-entities") as HTMLDivElement;
const agentSummary = document.getElementById("agent-summary") as HTMLDivElement;
const agentHistory = document.getElementById("agent-history") as HTMLDivElement;

type AgentStepStatus = "pending" | "running" | "completed" | "failed";
type AgentProfile = "fast" | "balanced" | "deep";
type AgentVisualState = "idle" | "running" | "completed" | "failed" | "aborted";
const AGENT_STEP_ORDER = ["intake", "research", "analysis", "reporting"] as const;
const AGENT_STEP_META: Record<(typeof AGENT_STEP_ORDER)[number], { label: string; cue: string }> = {
  intake: {
    label: "Intake",
    cue: "Parsing objective and extracting intent.",
  },
  research: {
    label: "Research",
    cue: "Traversing flows and ranking candidate entities.",
  },
  analysis: {
    label: "Analysis",
    cue: "Scoring risk patterns and triaging top signals.",
  },
  reporting: {
    label: "Reporting",
    cue: "Drafting investigator briefing and SAR context.",
  },
};

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
  agentResult.dataset.progress = String(Math.round(clamped));
}

function computeAgentProgress(): number {
  const total = AGENT_STEP_ORDER.length;
  const completed = AGENT_STEP_ORDER.filter((name) => agentStepState[name] === "completed").length;
  const hasRunning = AGENT_STEP_ORDER.some((name) => agentStepState[name] === "running");
  let pct = (completed / total) * 100;
  if (hasRunning && completed < total) pct += 100 / (total * 2);
  return Math.round(Math.min(99, pct));
}

function setAgentVisualState(state: AgentVisualState): void {
  agentResult.dataset.state = state;
  document.body.classList.toggle("agent-run-live", state === "running");
}

function resetAgentSteps(): void {
  agentStepState = {
    intake: "pending",
    research: "pending",
    analysis: "pending",
    reporting: "pending",
  };
  agentResult.dataset.activeStep = "";
  setAgentVisualState("idle");
  renderAgentSteps();
  setAgentProgress(0);
}

function renderAgentSteps(): void {
  agentSteps.innerHTML = AGENT_STEP_ORDER
    .map((name, idx) => {
      const status = agentStepState[name] ?? "pending";
      const meta = AGENT_STEP_META[name];
      return `<span class="agent-step-pill ${status}" data-step="${name}" data-status="${status}" title="${meta.cue}">
        <span class="agent-step-index">${idx + 1}</span>
        <span class="agent-step-name">${meta.label}</span>
      </span>`;
    })
    .join("");
}

function setAgentStatus(text: string, tone: "info" | "ok" | "warn" | "error" = "info"): void {
  agentStatus.textContent = text;
  agentStatus.dataset.tone = tone;
}

function setAgentRunId(runId: string | null): void {
  if (!runId) {
    agentRunId.textContent = "";
    agentRunId.title = "";
    return;
  }
  agentRunId.textContent = `run ${runId.slice(0, 8)}`;
  agentRunId.title = runId;
}

function setAgentCollapsed(collapsed: boolean): void {
  agentResult.dataset.collapsed = collapsed ? "1" : "0";
  agentCollapseToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  agentCollapseToggle.title = collapsed ? "Expand agent details" : "Collapse agent details";
  agentCollapseToggle.setAttribute("aria-label", collapsed ? "Expand agent details" : "Collapse agent details");
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
  agentStatus.dataset.live = running ? "1" : "0";
  agentMetrics.classList.toggle("live", running);
  if (running) {
    setAgentCollapsed(false);
    setAgentVisualState("running");
  } else if (agentResult.dataset.state === "running") {
    setAgentVisualState("idle");
    agentResult.dataset.activeStep = "";
  }
}

function setAgentStepStatus(agent: string, status: AgentStepStatus): void {
  if (!Object.prototype.hasOwnProperty.call(agentStepState, agent)) return;
  agentStepState[agent] = status;
  const typedAgent = agent as (typeof AGENT_STEP_ORDER)[number];
  const meta = AGENT_STEP_META[typedAgent];
  if (status === "running") {
    agentResult.dataset.activeStep = `${meta.label} | ${meta.cue}`;
    agentMetrics.textContent = meta.cue;
  } else if (status === "failed") {
    agentResult.dataset.activeStep = `${meta.label} | FAILED`;
    setAgentVisualState("failed");
  } else if (!AGENT_STEP_ORDER.some((name) => agentStepState[name] === "running")) {
    agentResult.dataset.activeStep = "";
  }
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
      <div class="agent-history-row status-${run.status}" data-run-id="${run.run_id}">
        <span class="agent-history-state">${(run.status || "unknown").toUpperCase()} ${Math.round(run.progress ?? 0)}%</span>
        <span class="agent-history-query" title="${run.query}">${run.query.slice(0, 36)}${run.query.length > 36 ? "..." : ""}</span>
      </div>
    `).join("")}
  `;

  for (const row of Array.from(agentHistory.querySelectorAll<HTMLDivElement>(".agent-history-row"))) {
    row.addEventListener("click", () => {
      const runId = row.dataset.runId;
      const run = agentRunSummaries.find((r) => r.run_id === runId);
      if (!run) return;
      nlqInput.value = run.query;
      agentProfile.value = run.profile || "balanced";
      setAgentStatus(`Loaded run context: ${(run.status || "unknown").toUpperCase()} (${run.run_id.slice(0, 8)})`, "info");
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
      setAgentRunId(runId);
    } else if (runId !== activeAgentRunId) {
      return;
    }
  } else if (!activeAgentRunId && !agentRequestRunning) {
    return;
  }

  if (event === "AGENT_RUN_STARTED") {
    agentResult.style.display = "flex";
    setAgentVisualState("running");
    setAgentProgress(4);
    setAgentStatus("Run started. Specialist agents are coming online...", "info");
    agentMetrics.textContent = "Supervisor: dispatching intake -> research -> analysis -> reporting.";
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
    setAgentVisualState("completed");
    setAgentProgress(100);
    setAgentStatus("Run completed. Briefing package is ready.", "ok");
    return;
  }

  if (event === "AGENT_RUN_FAILED") {
    setAgentVisualState("failed");
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
  setAgentRunId(null);
  setAgentSummaryMarkdown("**Agentic run in progress.** The graph stays interactive while the supervisor coordinates specialist agents.");
  agentMetrics.textContent = "Bootstrapping orchestration graph...";
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
    setAgentRunId(result.run_id);
    setAgentVisualState("completed");
    setAgentStatus("Run completed. Briefing package is ready.", "ok");
    setAgentStepStatus("intake", "completed");
    setAgentStepStatus("research", "completed");
    setAgentStepStatus("analysis", "completed");
    setAgentStepStatus("reporting", "completed");
    setAgentProgress(100);

    const reportText = result.reporting?.narrative ?? "";
    const sarSuffix = result.reporting?.sar ? "\n\n**SAR:** Draft generated for top entity." : "";
    setAgentSummaryMarkdown(`${reportText}${sarSuffix}`);
    agentMetrics.textContent = `${(result.profile || "balanced").toUpperCase()} profile • ${result.research.total_targets_found} candidates • ${result.analysis.high_risk_count} high-risk selected • avg risk ${Math.round(result.analysis.average_risk * 100)}%`;
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
      setAgentVisualState("aborted");
      setAgentStatus("Client wait canceled. Server run may still complete.", "warn");
      setAgentSummaryMarkdown("You can still retrieve the run from `/api/agent/runs`.");
      setAgentProgress(computeAgentProgress());
      await refreshAgentHistory();
    } else {
      setAgentVisualState("failed");
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
  setAgentRunId(null);
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
setAgentCollapsed(false);

nlqSubmit.addEventListener("click", () => runNLQ());
agentSubmit.addEventListener("click", () => runAgentFlow());
agentCollapseToggle.addEventListener("click", () => {
  const collapsed = agentResult.dataset.collapsed === "1";
  setAgentCollapsed(!collapsed);
});
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

  skybox.tick(dt);
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
  clearEntityInteractionCaches();
  entityLoadAbortController?.abort();
  entityLoadAbortController = null;
  aiSummaryAbortController?.abort();
  aiSummaryAbortController = null;
  aiSummaryRequestToken += 1;

  const snapshot = preloaded ?? await getSnapshot(0);
  slider.init(snapshot.meta.n_buckets, 0);
  currentSnapshot = snapshot;
  panel.setBucket(snapshot.meta.t, snapshot.meta.n_buckets);
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

  // Pitch mode defaults on for demos; can be toggled off manually.
  applyPitchMode(true);

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
