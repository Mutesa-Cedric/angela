import * as THREE from "three";
import type { SnapshotNode } from "../types";
import { computePositions } from "../layout";
import { entityShape, getGeometry, type EntityShape } from "./NodeFactory";

const SELECTED_COLOR = new THREE.Color(0xffffff);

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

// ── Visual encoding constants ──────────────────────────────────────────

/** Log-scaled volume → radius. */
const MIN_RADIUS = 0.10;
const MAX_RADIUS = 0.55;

/** Risk glow thresholds. */
const GLOW_RISK_MIN = 0.25;
const GLOW_RISK_FULL = 0.65;

/** De-emphasis: low-risk nodes get dimmed. */
const DEEMPH_RISK_THRESHOLD = 0.15;
const DEEMPH_BRIGHTNESS = 0.35; // multiplier for low-risk node color

/** Risk pulse period (seconds) for high-risk emissive cycle. */
const PULSE_PERIOD = 3.0;
const PULSE_AMPLITUDE = 0.25;

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

/** Map risk [0,1] to a continuous color gradient. */
function riskColor(risk: number): THREE.Color {
  if (risk < 0.3) {
    return _tmpA.set(0x1a3366).lerp(_tmpB.set(0x22aa88), risk / 0.3);
  } else if (risk < 0.6) {
    return _tmpA.set(0x22aa88).lerp(_tmpB.set(0xffaa00), (risk - 0.3) / 0.3);
  } else {
    return _tmpA.set(0xffaa00).lerp(_tmpB.set(0xff2222), (risk - 0.6) / 0.4);
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
  const t = Math.log1p(volume) / Math.log1p(500_000); // ~500k as "large"
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

  /** Glow sprites for high-risk nodes. */
  private glowSprites: THREE.Sprite[] = [];
  private glowMap: THREE.Texture;

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
        roughness: 0.3,
        metalness: 0.15,
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

    // Glow texture — procedural radial gradient
    this.glowMap = this.createGlowTexture();
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
      const finalColor = _tmpA
        .copy(jColor)
        .lerp(riskColor(riskT), Math.min(riskT * 1.5, 0.8));

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
        riskT >= GLOW_RISK_FULL
          ? 1.0
          : riskT >= GLOW_RISK_MIN
            ? (riskT - GLOW_RISK_MIN) / (GLOW_RISK_FULL - GLOW_RISK_MIN)
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
    this.updateGlowSprites();
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
    sm.mesh.setColorAt(localIdx, _color);

    // Per-instance emissive via material (shared) — we'll drive it from glow sprites instead
  }

  // ── Per-frame animation tick ─────────────────────────────────────

  animate(dt: number): void {
    const time = performance.now() * 0.001;

    // Always animate glow + pulse even when position transitions are done
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

    // C) Subtle ambient emissive pulse — very low intensity since it's shared across all instances
    for (const sm of this.meshes.values()) {
      const mat = sm.mesh.material as THREE.MeshStandardMaterial;
      let maxEmissive = 0;
      for (const [global] of sm.globalToLocal) {
        const s = this.states[global];
        if (s && s.emissive > maxEmissive) maxEmissive = s.emissive;
      }
      if (maxEmissive > 0) {
        const pulse = 1 + Math.sin(time * (Math.PI * 2 / PULSE_PERIOD)) * PULSE_AMPLITUDE;
        // Very subtle — just enough to make the mesh "breathe" without washing out
        mat.emissiveIntensity = 0.08 * pulse;
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

    // Animate glow sprites
    this.animateGlowSprites();
  }

  // ── Glow sprites ────────────────────────────────────────────────

  // D) Softer, wider halo texture with gentle falloff
  private createGlowTexture(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d")!;
    const gradient = c.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    // Softer center, wider falloff, no harsh edges
    gradient.addColorStop(0, "rgba(255,200,150,0.45)");
    gradient.addColorStop(0.15, "rgba(255,140,80,0.30)");
    gradient.addColorStop(0.4, "rgba(255,80,40,0.12)");
    gradient.addColorStop(0.7, "rgba(255,40,20,0.04)");
    gradient.addColorStop(1, "rgba(255,30,15,0.0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private updateGlowSprites(): void {
    // Remove existing
    for (const sprite of this.glowSprites) {
      this.group.remove(sprite);
      sprite.material.dispose();
    }
    this.glowSprites = [];

    const count = Math.min(this.nodes.length, this.maxCount);
    for (let i = 0; i < count; i++) {
      const s = this.states[i];
      if (s.tEmissive <= 0) continue;

      // D) Softer halo — warm tones blended with node color, lower opacity
      const glowColor = new THREE.Color().setRGB(s.tr, s.tg, s.tb);
      glowColor.lerp(new THREE.Color(0xff6633), 0.5); // warm risk tint

      const mat = new THREE.SpriteMaterial({
        map: this.glowMap,
        color: glowColor,
        transparent: true,
        opacity: s.tEmissive * 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      // Wider halo for premium feel
      const glowScale = s.tScale * (3.0 + s.tEmissive * 2.5);
      sprite.scale.setScalar(glowScale);
      sprite.position.set(s.px, s.py, s.pz);
      (sprite as unknown as Record<string, number>).__globalIdx = i;

      this.group.add(sprite);
      this.glowSprites.push(sprite);
    }
  }

  private animateGlowSprites(): void {
    const time = performance.now() * 0.001;
    for (const sprite of this.glowSprites) {
      const gi = (sprite as unknown as Record<string, number>).__globalIdx;
      const s = this.states[gi];
      if (!s) continue;
      sprite.position.set(s.px, s.py, s.pz);

      // Smooth breathing pulse — slower, more organic
      const phase = time * (Math.PI * 2 / PULSE_PERIOD) + gi * 0.9;
      const pulse = 1 + Math.sin(phase) * 0.12 * s.emissive;
      const glowScale = s.scale * (3.0 + s.emissive * 2.5) * pulse;
      sprite.scale.setScalar(glowScale);

      // Gentle opacity breathing
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.opacity = s.emissive * 0.4 * (0.88 + Math.sin(phase * 0.7) * 0.12);
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
