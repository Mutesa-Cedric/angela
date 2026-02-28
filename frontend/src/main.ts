import "./style.css";
import { initScene } from "./scene";
import { NodeLayer } from "./graph/NodeLayer";
import { EdgeLayer } from "./graph/EdgeLayer";
import { getSnapshot, getEntity, getNeighbors } from "./api/client";
import * as slider from "./ui/slider";
import * as panel from "./ui/panel";
import type { Snapshot } from "./types";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #scene-canvas not found");

const ctx = initScene(canvas);
const nodeLayer = new NodeLayer(5000);
ctx.scene.add(nodeLayer.mesh);
const edgeLayer = new EdgeLayer(ctx.scene);

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

// --- Init ---

async function init(): Promise<void> {
  const snapshot = await getSnapshot(0);
  slider.init(snapshot.meta.n_buckets, 0);
  currentSnapshot = snapshot;
  nodeLayer.update(snapshot.nodes);
}

init().catch(console.error);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__angela = {
    ctx,
    nodeLayer,
    edgeLayer,
  };
}
