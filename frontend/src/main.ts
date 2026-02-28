import "./style.css";
import { initScene } from "./scene";
import { NodeLayer } from "./graph/NodeLayer";
import { EdgeLayer } from "./graph/EdgeLayer";
import { AssetLayer } from "./graph/AssetLayer";
import { getSnapshot, getEntity, getNeighbors, getAIExplanation } from "./api/client";
import * as slider from "./ui/slider";
import * as panel from "./ui/panel";
import { wsClient } from "./api/ws";
import type { Snapshot, SnapshotNode } from "./types";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #scene-canvas not found");

const ctx = initScene(canvas);
const nodeLayer = new NodeLayer(5000);
ctx.scene.add(nodeLayer.mesh);
const edgeLayer = new EdgeLayer(ctx.scene);
const assetLayer = new AssetLayer(ctx.scene);

let currentSnapshot: Snapshot | null = null;
let selectedId: string | null = null;
let currentK = 1;

// K-hop control
const khopSelect = document.getElementById("khop-select") as HTMLSelectElement;
khopSelect.addEventListener("change", () => {
  currentK = parseInt(khopSelect.value, 10);
  if (selectedId && currentSnapshot) {
    loadNeighborEdges(selectedId, currentSnapshot.meta.t, currentK);
  }
});

// --- Data loading ---

async function loadBucket(t: number): Promise<void> {
  try {
    currentSnapshot = await getSnapshot(t);
    nodeLayer.update(currentSnapshot.nodes);
    edgeLayer.clear();
    assetLayer.clear();

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
    panel.hide();
    edgeLayer.clear();
    return;
  }

  panel.showLoading();
  try {
    const [detail] = await Promise.all([
      getEntity(entityId, currentSnapshot.meta.t),
      loadNeighborEdges(entityId, currentSnapshot.meta.t, currentK),
    ]);
    panel.show(detail);

    // Fire AI summary asynchronously — don't block panel
    getAIExplanation(entityId, currentSnapshot.meta.t)
      .then((res) => panel.setAISummary(res.summary))
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
  const hits = ctx.raycaster.intersectObject(nodeLayer.mesh, false);

  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    const entityId = nodeLayer.getEntityId(hits[0].instanceId);
    if (entityId) selectEntity(entityId);
  } else {
    selectEntity(null);
  }
});

panel.onClose(() => selectEntity(null));

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

// --- Asset pulse animation ---
ctx.onFrame(() => assetLayer.animate());

// --- Init ---

async function init(): Promise<void> {
  const snapshot = await getSnapshot(0);
  slider.init(snapshot.meta.n_buckets, 0);
  currentSnapshot = snapshot;
  nodeLayer.update(snapshot.nodes);

  // Connect WebSocket
  wsClient.connect();
}

init().catch(console.error);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__angela = {
    ctx,
    nodeLayer,
    edgeLayer,
    assetLayer,
  };
}
