import "./style.css";
import { initScene } from "./scene";
import { NodeLayer } from "./graph/NodeLayer";
import { getSnapshot, getEntity } from "./api/client";
import * as slider from "./ui/slider";
import * as panel from "./ui/panel";
import type { Snapshot } from "./types";

const canvas = document.getElementById("scene-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #scene-canvas not found");

const ctx = initScene(canvas);
const nodeLayer = new NodeLayer(5000);
ctx.scene.add(nodeLayer.mesh);

let currentSnapshot: Snapshot | null = null;
let selectedId: string | null = null;

// --- Data loading ---

async function loadBucket(t: number): Promise<void> {
  try {
    currentSnapshot = await getSnapshot(t);
    nodeLayer.update(currentSnapshot.nodes);

    // Restore selection if entity still exists in this bucket
    if (selectedId) {
      const stillExists = currentSnapshot.nodes.some((n) => n.id === selectedId);
      if (!stillExists) {
        selectedId = null;
        panel.hide();
      } else {
        nodeLayer.select(selectedId);
      }
    }
  } catch (err) {
    console.error("Failed to load bucket:", err);
  }
}

// --- Selection ---

async function selectEntity(entityId: string | null): Promise<void> {
  selectedId = entityId;
  nodeLayer.select(entityId);

  if (!entityId || !currentSnapshot) {
    panel.hide();
    return;
  }

  panel.showLoading();
  try {
    const detail = await getEntity(entityId, currentSnapshot.meta.t);
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
  // Load first bucket to get metadata
  const snapshot = await getSnapshot(0);
  slider.init(snapshot.meta.n_buckets, 0);
  currentSnapshot = snapshot;
  nodeLayer.update(snapshot.nodes);
}

init().catch(console.error);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__angela = { ctx, nodeLayer };
}
