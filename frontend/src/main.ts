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
import * as agentPanel from "./ui/agentPanel";
import { ENTITY_LINK_EVENT } from "./ui/markdown";
import type { EntityDetail, Neighborhood, Snapshot, SnapshotNode } from "./types";
import { AmbientAudioController, type AmbientAudioState } from "./ambientAudio";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #scene-canvas not found");

const ambienceIntroUrl = new URL("../media/angela_track_intro.ogg", import.meta.url).href;
const ambienceLoopUrl = new URL("../media/angela_track_loop.ogg", import.meta.url).href;

const ctx = initScene(canvas);
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
  ambience.setPitchMode(enabled);

  if (enabled) {
    ctx.bloomPass.strength = baseBloomStrength * 1.35;
    ctx.bloomPass.radius = Math.min(1.2, baseBloomRadius + 0.14);
    ctx.bloomPass.threshold = Math.max(0.66, baseBloomThreshold - 0.06);
    ctx.renderer.toneMappingExposure = baseExposure * 1.15;
    if (sceneFog) {
      sceneFog.density = Math.max(0.001, baseFogDensity * 0.8);
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
    pitchBtn.textContent = enabled ? "PRESENT ON" : "PRESENT";
    pitchBtn.title = enabled ? "Disable presentation mode (Shift+P)" : "Enable presentation mode (Shift+P)";
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

// Connection depth control
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

// --- Sidebar accordion ---

for (const header of Array.from(document.querySelectorAll<HTMLButtonElement>(".sb-section-header"))) {
  header.addEventListener("click", () => {
    const section = header.parentElement;
    if (!section) return;
    const isCollapsed = section.classList.toggle("collapsed");
    header.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  });
}

// Dashboard section starts collapsed
const sbDashboard = document.getElementById("sb-dashboard");
if (sbDashboard) {
  sbDashboard.classList.add("collapsed");
}

// --- Legend popover ---

const legendTrigger = document.getElementById("legend-trigger") as HTMLButtonElement | null;
const legendPopover = document.getElementById("legend-popover") as HTMLDivElement | null;
const legendPopoverClose = document.getElementById("legend-popover-close") as HTMLButtonElement | null;

if (legendTrigger && legendPopover) {
  legendTrigger.addEventListener("click", () => {
    legendPopover.classList.toggle("hidden");
  });
  legendPopoverClose?.addEventListener("click", () => {
    legendPopover.classList.add("hidden");
  });
  document.addEventListener("pointerdown", (e) => {
    if (
      !legendPopover.classList.contains("hidden") &&
      !legendPopover.contains(e.target as Node) &&
      e.target !== legendTrigger
    ) {
      legendPopover.classList.add("hidden");
    }
  });
}

// --- Panel tabs ---
panel.initTabs();

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
  const rect = canvas.getBoundingClientRect();
  ctx.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ctx.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

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
  const rect = canvas.getBoundingClientRect();
  ctx.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ctx.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
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
    ambienceBtn.textContent = "AMBIENCE";
    ambienceBtn.title = "Enable ambient audio (Shift+M)";
    return;
  }

  if (!state.ready) {
    ambienceBtn.textContent = "AMBIENCE ARM";
    ambienceBtn.title = "Click to unlock ambient audio (Shift+M)";
    return;
  }

  ambienceBtn.textContent = state.voiceoverActive ? "AMBIENCE DUCK" : "AMBIENCE ON";
  ambienceBtn.title = state.voiceoverActive
    ? "Ambience ducked for voice-over compatibility (Shift+M)"
    : "Disable soft ambience (Shift+M)";
}

ambience.onStateChange(renderAmbienceButton);
ambienceBtn.addEventListener("click", () => {
  ambience.toggleEnabled();
});

autopilot.onState((state) => {
  autopilotBtn.textContent = state === "running" ? "STOP TOUR" : "GUIDED TOUR";
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
  dashboardBtn.textContent = open ? "Close Dashboard" : "Open Full Dashboard";
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
const agentMiniResult = document.getElementById("agent-result-mini") as HTMLDivElement;
const agentMiniState = document.getElementById("agent-mini-state") as HTMLSpanElement;
const agentMiniOpen = document.getElementById("agent-mini-open") as HTMLButtonElement;
const agentHistory = document.getElementById("agent-history") as HTMLDivElement;

// NLQ toast
const nlqToast = document.getElementById("nlq-toast") as HTMLDivElement;
const nlqToastTitle = document.getElementById("nlq-toast-title") as HTMLSpanElement;
const nlqToastCount = document.getElementById("nlq-toast-count") as HTMLSpanElement;
const nlqToastSummary = document.getElementById("nlq-toast-summary") as HTMLDivElement;
const nlqToastClose = document.getElementById("nlq-toast-close") as HTMLButtonElement;
let nlqToastTimer: ReturnType<typeof setTimeout> | null = null;

function showNlqToast(interpretation: string, entityCount: number, summary: string): void {
  nlqToastTitle.textContent = interpretation;
  nlqToastCount.textContent = entityCount > 0 ? `${entityCount} ${entityCount === 1 ? "entity" : "entities"}` : "0 matches";
  nlqToastSummary.textContent = summary;
  nlqToast.classList.add("visible");

  if (nlqToastTimer) clearTimeout(nlqToastTimer);
  nlqToastTimer = setTimeout(() => {
    nlqToast.classList.remove("visible");
    nlqToastTimer = null;
  }, 5000);
}

function hideNlqToast(): void {
  nlqToast.classList.remove("visible");
  if (nlqToastTimer) { clearTimeout(nlqToastTimer); nlqToastTimer = null; }
}

nlqToastClose.addEventListener("click", hideNlqToast);

type AgentProfile = "fast" | "balanced" | "deep";

let nlqAbortController: AbortController | null = null;
let nlqRequestSeq = 0;
let agentAbortController: AbortController | null = null;
let agentRequestRunning = false;
let agentRequestSeq = 0;
let activeAgentRunId: string | null = null;
let agentRunSummaries: AgentRunSummary[] = [];
const FALLBACK_AGENT_PRESETS: {
  id: string;
  label: string;
  query: string;
  profile: AgentProfile;
  include_sar: boolean;
  max_targets: number;
}[] = [
  { id: "high-risk", label: "High Risk Entities", query: "show high risk entities", profile: "balanced", include_sar: false, max_targets: 5 },
  { id: "large-incoming", label: "Large Incoming Flows", query: "show entities receiving large transaction volumes", profile: "balanced", include_sar: true, max_targets: 3 },
  { id: "structuring", label: "Structuring Patterns", query: "find structuring near threshold transactions", profile: "deep", include_sar: true, max_targets: 5 },
];

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function setAgentRunning(running: boolean): void {
  agentRequestRunning = running;
  agentSubmit.classList.toggle("running", running);
  agentSubmit.textContent = running ? "CANCEL" : "INVESTIGATE";
  agentSubmit.title = running ? "Cancel client wait" : "Run multi-agent investigation";
  agentIncludeSar.disabled = running;
  agentMaxTargets.disabled = running;
  agentProfile.disabled = running;
  nlqBar.classList.toggle("agent-running", running);
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
      agentPanel.setRunId(runId);
    } else if (runId !== activeAgentRunId) {
      return;
    }
  } else if (!activeAgentRunId && !agentRequestRunning) {
    return;
  }

  if (event === "AGENT_RUN_STARTED") {
    agentPanel.updateStep("intake", "running", "Supervisor dispatching specialist agents...");
    return;
  }

  if (event === "AGENT_STEP") {
    const agent = typeof data.agent === "string" ? data.agent : "";
    const status = typeof data.status === "string" ? data.status : "";
    const detail = typeof data.detail === "string" ? data.detail : "";
    if (agent && (status === "running" || status === "completed" || status === "failed")) {
      agentPanel.updateStep(
        agent as "intake" | "research" | "analysis" | "reporting",
        status as "running" | "completed" | "failed",
        detail,
      );
    }
    return;
  }

  if (event === "AGENT_RUN_COMPLETED") {
    return; // Result applied from HTTP response in runAgentFlow
  }

  if (event === "AGENT_RUN_FAILED") {
    const errMsg = typeof data.error === "string" ? data.error : "Agent run failed.";
    agentPanel.setError(errMsg);
    agentMiniState.textContent = "Failed";
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

  // Open the dedicated agent panel
  activeAgentRunId = null;
  agentPanel.reset();
  agentPanel.show(query);
  agentPanel.updateStep("intake", "running", "Submitting investigation request...");
  setAgentRunning(true);

  // Update sidebar mini indicator
  agentMiniResult.style.display = "block";
  agentMiniState.textContent = "Running...";

  const requestSeq = ++agentRequestSeq;
  agentAbortController = new AbortController();

  try {
    const result = await runAgentInvestigation(
      { query, bucket, include_sar: includeSar, max_targets: maxTargets, profile },
      agentAbortController.signal,
    );

    if (requestSeq !== agentRequestSeq) return;

    activeAgentRunId = result.run_id;
    agentPanel.setRunId(result.run_id);
    // Ensure profile has a fallback value for display
    const resultWithProfile = { ...result, profile: result.profile || "balanced" };
    agentPanel.setResult(resultWithProfile);

    agentMiniState.textContent = "Completed";

    // NLQ bar updates
    nlqInterpretation.textContent = result.interpretation || result.intent;
    nlqSummary.textContent = result.research?.summary || "Agent run completed.";
    nlqResult.style.display = "flex";
    nlqClear.style.display = "inline-block";

    applyAgentGraphResult(result);
    await refreshAgentHistory();
  } catch (err) {
    if (requestSeq !== agentRequestSeq) return;
    if (isAbortError(err)) {
      agentPanel.setError("Client wait canceled. Server run may still complete.");
      agentMiniState.textContent = "Canceled";
    } else {
      agentPanel.setError(err instanceof Error ? err.message : "Unknown error");
      agentMiniState.textContent = "Failed";
    }
    await refreshAgentHistory();
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

    // Highlight matching nodes and focus camera
    if (result.entity_ids.length > 0) {
      nodeLayer.highlight(result.entity_ids);

      // Show matching edges
      const riskScores = new Map<string, number>();
      for (const node of currentSnapshot.nodes) {
        riskScores.set(node.id, node.risk_score);
      }
      edgeLayer.update(result.edges, nodeLayer, riskScores);

      // Fly camera to the matched entities
      camera.focusGroup(ctx, nodeLayer, result.entity_ids);

      // Select the first entity to open its detail panel
      if (result.entity_ids[0]) void selectEntity(result.entity_ids[0]);
    } else {
      nodeLayer.clearHighlight();
      nlqSummary.textContent = "No matching entities found.";
    }

    // Show toast notification
    showNlqToast(query, result.entity_ids.length, result.summary);
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
  hideNlqToast();
  activeAgentRunId = null;
  agentPanel.reset();
  agentPanel.hide();
  agentMiniResult.style.display = "none";
  agentMiniState.textContent = "";
  setAgentRunning(false);

  // Restore edges for selected entity if any
  if (selectedId && currentSnapshot) {
    loadNeighborEdges(selectedId, currentSnapshot.meta.t, currentK);
  }
}

// Wire agent panel callbacks
agentPanel.initCallbacks({
  onFocusGraph: (entityIds) => {
    if (entityIds.length > 0) {
      nodeLayer.highlight(entityIds);
      if (entityIds[0]) void selectEntity(entityIds[0]);
    }
    agentPanel.hide();
  },
  onRetry: () => { runAgentFlow(); },
  onSar: (entityId) => {
    if (currentSnapshot) {
      import("./ui/sarPanel").then((sarPanel) => {
        sarPanel.generate(entityId, currentSnapshot!.meta.t);
      });
    }
  },
});

agentMiniOpen.addEventListener("click", () => {
  const panelEl = document.getElementById("agent-panel");
  if (panelEl) panelEl.classList.add("open");
});

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

  nodeLayer.animate(dt, ctx.camera);
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

  // Show graph UI (sidebar, nav, status bar are always-visible in new layout)
  document.body.classList.add("graph-loaded");
  reuploadBtn.style.display = "block";

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
  // Hide graph UI initially — sidebar/nav hidden until data is loaded
  document.body.classList.remove("graph-loaded");

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
