import * as THREE from "three";
import type { SnapshotNode } from "../types";
import { computePositions } from "../layout";
import { entityShape, getGeometry, type EntityShape } from "./NodeFactory";

const SELECTED_COLOR = new THREE.Color(0xffffff);

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();
const _tmpC = new THREE.Color();

// ── Visual encoding constants ──────────────────────────────────────────

/** Log-scaled volume → radius. */
const MIN_RADIUS = 0.08;
const MAX_RADIUS = 0.42;

/** Emissive thresholds for risk glow. */
const EMISSIVE_RISK_MIN = 0.25;
const EMISSIVE_RISK_FULL = 0.65;

/** De-emphasis: low-risk nodes get dimmed. */
const DEEMPH_RISK_THRESHOLD = 0.15;
const DEEMPH_BRIGHTNESS = 0.56; // multiplier for low-risk node color
const NLQ_DIM_MULTIPLIER = 0.28;

/** Risk label threshold — show percentage label on nodes at or above this risk. */
const RISK_LABEL_THRESHOLD = 0.6;

/** Jurisdiction → color palette (8 slots). */
const JURISDICTION_COLORS: number[] = [
  0x4488ff, // 0 — blue
  0x22aa88, // 1 — teal
  0xaa66ff, // 2 — purple
  0xff8844, // 3 — orange
  0x44dddd, // 4 — cyan
  0xffcc22, // 5 — gold
  0xff5588, // 6 — pink
  0x88cc44, // 7 — lime
];

/** Transition speed (seconds for full lerp). */
const TRANSITION_DURATION = 0.6;

// ── Helpers ────────────────────────────────────────────────────────────

/** Map risk [0,1] to a professional color gradient. */
function riskColor(risk: number): THREE.Color {
  if (risk < 0.3) {
    return _tmpA.set(0x238551).lerp(_tmpB.set(0xf39f41), risk / 0.3);
  } else if (risk < 0.6) {
    return _tmpA.set(0xf39f41).lerp(_tmpB.set(0xcd4246), (risk - 0.3) / 0.3);
  } else {
    return _tmpA.set(0xcd4246).lerp(_tmpB.set(0x7961db), (risk - 0.6) / 0.4);
  }
}

/** Map risk [0,1] to CSS color string. */
export function riskColorCSS(risk: number): string {
  return `#${riskColor(risk).getHexString()}`;
}

/** Jurisdiction bucket → THREE.Color. */
function jurisdictionColor(bucket: number): THREE.Color {
  return _tmpA.set(JURISDICTION_COLORS[bucket % JURISDICTION_COLORS.length]);
}

/** Volume → log-scaled radius clamped between MIN/MAX. */
function volumeToRadius(volume: number): number {
  if (volume <= 0) return MIN_RADIUS;
  // log1p to handle 0 gracefully; normalize against typical range
  const t = Math.log1p(volume) / Math.log1p(1_000_000); // compress large-volume outliers
  return MIN_RADIUS + Math.min(t, 1) * (MAX_RADIUS - MIN_RADIUS);
}

// ── Per-instance animated state ────────────────────────────────────────

interface NodeState {
  // Current (animated)
  px: number; py: number; pz: number;
  scale: number;
  r: number; g: number; b: number;
  emissive: number;
  // Target
  tx: number; ty: number; tz: number;
  tScale: number;
  tr: number; tg: number; tb: number;
  tEmissive: number;
}

// ── Per-shape InstancedMesh group ──────────────────────────────────────

interface ShapeMesh {
  mesh: THREE.InstancedMesh;
  shape: EntityShape;
  /** Which global node index maps to which instance index within this mesh. */
  globalToLocal: Map<number, number>;
}

// ── NodeLayer ──────────────────────────────────────────────────────────

export class NodeLayer {
  /** Parent group added to the scene. */
  group: THREE.Group;

  private meshes: Map<EntityShape, ShapeMesh> = new Map();
  private idToGlobal: Map<string, number> = new Map();
  private globalToId: Map<number, string> = new Map();
  private nodes: SnapshotNode[] = [];
  private states: NodeState[] = [];
  private selectedIndex: number = -1;
  private maxCount: number;
  private needsTransition = false;

  /** NLQ highlight mode — set of entity IDs to emphasize. */
  private highlightSet: Set<string> | null = null;

  /** Risk score labels for high-risk nodes. */
  private riskLabels: HTMLDivElement[] = [];
  private riskLabelContainer: HTMLDivElement;

  constructor(maxCount: number = 5000) {
    this.maxCount = maxCount;
    this.group = new THREE.Group();
    this.group.name = "NodeLayer";

    // Create InstancedMesh for each shape
    for (const shape of ["sphere", "box", "diamond"] as EntityShape[]) {
      const geo = getGeometry(
        shape === "sphere" ? "account" : shape === "box" ? "merchant" : "bank",
        "hi",
      );
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: false,
        roughness: 0.55,
        metalness: 0.02,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
      });

      const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(maxCount * 3),
        3,
      );
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.name = `nodes_${shape}`;

      this.meshes.set(shape, { mesh, shape, globalToLocal: new Map() });
      this.group.add(mesh);
    }

    // Risk label container
    this.riskLabelContainer = document.createElement("div");
    this.riskLabelContainer.id = "node-risk-labels";
    document.body.appendChild(this.riskLabelContainer);
  }

  /** Convenience: the primary mesh for raycasting (sphere — most common). */
  get allMeshes(): THREE.InstancedMesh[] {
    return [...this.meshes.values()].map((s) => s.mesh);
  }

  // ── Update (new bucket data) ──────────────────────────────────────

  update(nodes: SnapshotNode[]): void {
    const prevIds = new Map(this.idToGlobal);
    this.nodes = nodes;
    this.idToGlobal.clear();
    this.globalToId.clear();

    // Distribute nodes to shapes
    const shapeIndices: Map<EntityShape, number[]> = new Map([
      ["sphere", []],
      ["box", []],
      ["diamond", []],
    ]);

    const count = Math.min(nodes.length, this.maxCount);
    const positions = computePositions(nodes);

    // Resize state array
    while (this.states.length < count) {
      this.states.push({
        px: 0, py: 0, pz: 0, scale: 0, r: 0, g: 0, b: 0, emissive: 0,
        tx: 0, ty: 0, tz: 0, tScale: 0, tr: 0, tg: 0, tb: 0, tEmissive: 0,
      });
    }

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      this.idToGlobal.set(node.id, i);
      this.globalToId.set(i, node.id);

      const shape = entityShape(node.entity_type);
      shapeIndices.get(shape)!.push(i);

      // Compute targets
      const radius = volumeToRadius(node.volume);
      const jColor = jurisdictionColor(node.jurisdiction_bucket);
      const riskT = node.risk_score;
      // Blend jurisdiction color with risk tint for high-risk entities
      const finalColor = _tmpC
        .copy(jColor)
        .lerp(riskColor(riskT), Math.min(riskT * 1.45, 0.85));
      // Keep a minimum luminance floor so nodes remain legible over dramatic backgrounds.
      finalColor.lerp(_tmpB.set(0xffffff), 0.06 + riskT * 0.08);

      // B) De-emphasize low-risk nodes — dim color, lower visual weight
      if (riskT < DEEMPH_RISK_THRESHOLD) {
        finalColor.multiplyScalar(DEEMPH_BRIGHTNESS);
      } else if (riskT < 0.3) {
        // Gradual ramp from dimmed to full brightness
        const t = (riskT - DEEMPH_RISK_THRESHOLD) / (0.3 - DEEMPH_RISK_THRESHOLD);
        const brightness = DEEMPH_BRIGHTNESS + (1 - DEEMPH_BRIGHTNESS) * t;
        finalColor.multiplyScalar(brightness);
      }

      const emissive =
        riskT >= EMISSIVE_RISK_FULL
          ? 1.0
          : riskT >= EMISSIVE_RISK_MIN
            ? (riskT - EMISSIVE_RISK_MIN) / (EMISSIVE_RISK_FULL - EMISSIVE_RISK_MIN)
            : 0;

      const s = this.states[i];
      s.tx = positions[i * 3];
      s.ty = positions[i * 3 + 1];
      s.tz = positions[i * 3 + 2];
      s.tScale = radius;
      s.tr = finalColor.r;
      s.tg = finalColor.g;
      s.tb = finalColor.b;
      s.tEmissive = emissive;

      // If this node is new (wasn't in previous bucket), snap to target
      if (!prevIds.has(node.id)) {
        s.px = s.tx;
        s.py = s.ty;
        s.pz = s.tz;
        s.scale = s.tScale;
        s.r = s.tr;
        s.g = s.tg;
        s.b = s.tb;
        s.emissive = s.tEmissive;
      }
    }

    // Update per-shape meshes
    for (const [shape, sm] of this.meshes) {
      const indices = shapeIndices.get(shape) ?? [];
      sm.mesh.count = indices.length;
      sm.globalToLocal.clear();

      for (let local = 0; local < indices.length; local++) {
        const global = indices[local];
        sm.globalToLocal.set(global, local);
        this.applyInstance(sm, local, global);
      }

      sm.mesh.instanceMatrix.needsUpdate = true;
      if (sm.mesh.instanceColor) sm.mesh.instanceColor.needsUpdate = true;
      sm.mesh.computeBoundingSphere();
    }

    this.needsTransition = true;
    this.updateRiskLabels();
  }

  // ── Apply instance matrix + color ──────────────────────────────────

  private applyInstance(sm: ShapeMesh, localIdx: number, globalIdx: number): void {
    const s = this.states[globalIdx];

    _dummy.position.set(s.px, s.py, s.pz);
    _dummy.scale.setScalar(s.scale);
    _dummy.updateMatrix();
    sm.mesh.setMatrixAt(localIdx, _dummy.matrix);

    if (globalIdx === this.selectedIndex) {
      _color.copy(SELECTED_COLOR);
    } else {
      _color.setRGB(s.r, s.g, s.b);
    }

    // NLQ highlight: dim non-highlighted nodes
    if (this.highlightSet !== null) {
      const entityId = this.globalToId.get(globalIdx);
      if (entityId && !this.highlightSet.has(entityId)) {
        _color.multiplyScalar(NLQ_DIM_MULTIPLIER);
      }
    }

    sm.mesh.setColorAt(localIdx, _color);
  }

  // ── Per-frame animation tick ─────────────────────────────────────

  animate(dt: number, camera?: THREE.PerspectiveCamera): void {
    // Position transitions
    const transitioning = this.needsTransition;

    if (transitioning) {
      const alpha = Math.min(dt / TRANSITION_DURATION, 1);
      let allDone = true;

      const count = Math.min(this.nodes.length, this.maxCount);
      for (let i = 0; i < count; i++) {
        const s = this.states[i];
        s.px += (s.tx - s.px) * alpha * 3;
        s.py += (s.ty - s.py) * alpha * 3;
        s.pz += (s.tz - s.pz) * alpha * 3;
        s.scale += (s.tScale - s.scale) * alpha * 3;
        s.r += (s.tr - s.r) * alpha * 3;
        s.g += (s.tg - s.g) * alpha * 3;
        s.b += (s.tb - s.b) * alpha * 3;
        s.emissive += (s.tEmissive - s.emissive) * alpha * 3;

        if (
          Math.abs(s.tx - s.px) > 0.001 ||
          Math.abs(s.ty - s.py) > 0.001 ||
          Math.abs(s.tz - s.pz) > 0.001 ||
          Math.abs(s.tScale - s.scale) > 0.001
        ) {
          allDone = false;
        }
      }

      if (allDone) this.needsTransition = false;
    }

    // Static risk-based emissive — no animation
    for (const sm of this.meshes.values()) {
      const mat = sm.mesh.material as THREE.MeshStandardMaterial;
      let maxEmissive = 0;
      for (const [global] of sm.globalToLocal) {
        const s = this.states[global];
        if (s && s.emissive > maxEmissive) maxEmissive = s.emissive;
      }
      if (maxEmissive > 0) {
        mat.emissiveIntensity = 0.12;
        mat.emissive.set(0xff6633);
      } else {
        mat.emissiveIntensity = 0;
      }
    }

    // Write back to meshes
    for (const sm of this.meshes.values()) {
      for (const [global, local] of sm.globalToLocal) {
        this.applyInstance(sm, local, global);
      }
      sm.mesh.instanceMatrix.needsUpdate = true;
      if (sm.mesh.instanceColor) sm.mesh.instanceColor.needsUpdate = true;
    }

    // Project risk labels to screen space
    if (camera) this.projectRiskLabels(camera);
  }

  // ── Risk score labels ─────────────────────────────────────────

  private updateRiskLabels(): void {
    // Remove existing labels
    for (const label of this.riskLabels) label.remove();
    this.riskLabels = [];

    const count = Math.min(this.nodes.length, this.maxCount);
    for (let i = 0; i < count; i++) {
      const node = this.nodes[i];
      if (node.risk_score < RISK_LABEL_THRESHOLD) continue;

      const label = document.createElement("div");
      label.className = "node-risk-label";
      label.textContent = `${(node.risk_score * 100).toFixed(0)}%`;

      // Color the label text by risk level
      const c = riskColor(node.risk_score);
      label.style.color = `#${c.getHexString()}`;

      this.riskLabelContainer.appendChild(label);
      this.riskLabels.push(label);
      (label as unknown as Record<string, number>).__globalIdx = i;
    }
  }

  private projectRiskLabels(camera: THREE.PerspectiveCamera): void {
    const _v = new THREE.Vector3();
    for (const label of this.riskLabels) {
      const gi = (label as unknown as Record<string, number>).__globalIdx;
      const s = this.states[gi];
      if (!s) { label.style.display = "none"; continue; }

      _v.set(s.px, s.py + s.scale + 0.15, s.pz);
      _v.project(camera);

      if (_v.z > 1) { label.style.display = "none"; continue; }

      const rect = this.riskLabelContainer.getBoundingClientRect();
      const x = (_v.x * 0.5 + 0.5) * rect.width;
      const y = (-_v.y * 0.5 + 0.5) * rect.height;

      label.style.display = "block";
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;

      // Fade by distance
      const dist = camera.position.distanceTo(new THREE.Vector3(s.px, s.py, s.pz));
      const opacity = dist < 8 ? 1 : dist > 50 ? 0 : 1 - (dist - 8) / 42;
      label.style.opacity = String(opacity);
    }
  }

  // ── Selection ───────────────────────────────────────────────────

  select(entityId: string | null): void {
    const prevIndex = this.selectedIndex;
    this.selectedIndex = entityId ? (this.idToGlobal.get(entityId) ?? -1) : -1;

    // Refresh colors for prev and new selection
    for (const idx of [prevIndex, this.selectedIndex]) {
      if (idx < 0 || idx >= this.nodes.length) continue;
      const shape = entityShape(this.nodes[idx].entity_type);
      const sm = this.meshes.get(shape);
      if (!sm) continue;
      const local = sm.globalToLocal.get(idx);
      if (local !== undefined) {
        this.applyInstance(sm, local, idx);
        if (sm.mesh.instanceColor) sm.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  // ── NLQ Highlight ──────────────────────────────────────────────

  /** Highlight a set of entity IDs (dims everything else). */
  highlight(entityIds: string[]): void {
    this.highlightSet = new Set(entityIds);
    this.refreshAllColors();
  }

  /** Clear NLQ highlight — restore normal colors. */
  clearHighlight(): void {
    this.highlightSet = null;
    this.refreshAllColors();
  }

  private refreshAllColors(): void {
    for (const sm of this.meshes.values()) {
      for (const [global, local] of sm.globalToLocal) {
        this.applyInstance(sm, local, global);
      }
      sm.mesh.instanceMatrix.needsUpdate = true;
      if (sm.mesh.instanceColor) sm.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ── Lookup helpers ──────────────────────────────────────────────

  getEntityId(instanceId: number, mesh?: THREE.InstancedMesh): string | undefined {
    // Find which shape mesh was hit and reverse-map
    for (const sm of this.meshes.values()) {
      if (mesh && sm.mesh !== mesh) continue;
      for (const [global, local] of sm.globalToLocal) {
        if (local === instanceId) return this.globalToId.get(global);
      }
    }
    return undefined;
  }

  getInstanceId(entityId: string): number | undefined {
    return this.idToGlobal.get(entityId);
  }

  getPosition(entityId: string): THREE.Vector3 | null {
    const idx = this.idToGlobal.get(entityId);
    if (idx === undefined) return null;
    const s = this.states[idx];
    if (!s) return null;
    return new THREE.Vector3(s.px, s.py, s.pz);
  }

  /** Get risk score for an entity (for cluster visualization). */
  getRiskScore(entityId: string): number {
    const idx = this.idToGlobal.get(entityId);
    if (idx === undefined) return 0;
    return this.nodes[idx]?.risk_score ?? 0;
  }

  /** Get current snapshot nodes. */
  getNodes(): SnapshotNode[] {
    return this.nodes;
  }
}
