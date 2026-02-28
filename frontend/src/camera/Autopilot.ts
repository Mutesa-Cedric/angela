import * as THREE from "three";
import type { SceneContext } from "../scene";
import type { NodeLayer } from "../graph/NodeLayer";
import type { AutopilotTarget } from "../types";
import { getAutopilotTargets } from "../api/client";
import { renderMarkdownInto } from "../ui/markdown";

// ── Keyframe types ─────────────────────────────────────────────────────

interface CameraKeyframe {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  duration: number; // seconds
  easing: "ease-out" | "ease-in-out" | "linear";
  annotation?: string;
}

type AutopilotState = "idle" | "running" | "paused";
type AutopilotCallback = (state: AutopilotState) => void;

// ── Overlay ────────────────────────────────────────────────────────────

const overlayEl = document.createElement("div");
overlayEl.id = "autopilot-overlay";
overlayEl.style.display = "none";
document.body.appendChild(overlayEl);
let overlayHideTimer: number | null = null;

function showOverlay(markdown: string): void {
  if (overlayHideTimer !== null) {
    window.clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }
  renderMarkdownInto(overlayEl, markdown);
  overlayEl.style.display = "block";
  overlayEl.classList.remove("fade-out");
  overlayEl.classList.add("fade-in");
}

function hideOverlay(): void {
  overlayEl.classList.remove("fade-in");
  overlayEl.classList.add("fade-out");
  if (overlayHideTimer !== null) {
    window.clearTimeout(overlayHideTimer);
  }
  overlayHideTimer = window.setTimeout(() => {
    overlayEl.style.display = "none";
    overlayHideTimer = null;
  }, 400);
}

// ── Easing functions ───────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function applyEasing(t: number, type: CameraKeyframe["easing"]): number {
  switch (type) {
    case "ease-out":
      return easeOutCubic(t);
    case "ease-in-out":
      return easeInOutCubic(t);
    default:
      return t;
  }
}

// ── Autopilot class ────────────────────────────────────────────────────

export class Autopilot {
  private ctx: SceneContext;
  private nodeLayer: NodeLayer;
  private state: AutopilotState = "idle";
  private keyframes: CameraKeyframe[] = [];
  private currentKeyframe = 0;
  private keyframeProgress = 0; // 0..1
  private startPos = new THREE.Vector3();
  private startLookAt = new THREE.Vector3();
  private onStateChange: AutopilotCallback | null = null;
  private abortController: AbortController | null = null;

  constructor(ctx: SceneContext, nodeLayer: NodeLayer) {
    this.ctx = ctx;
    this.nodeLayer = nodeLayer;
  }

  get isRunning(): boolean {
    return this.state === "running";
  }

  get isPaused(): boolean {
    return this.state === "paused";
  }

  get currentState(): AutopilotState {
    return this.state;
  }

  onState(cb: AutopilotCallback): void {
    this.onStateChange = cb;
  }

  // ── Generate keyframes from backend targets ──────────────────────

  async start(bucket: number): Promise<void> {
    if (this.state === "running") return;

    this.abortController = new AbortController();

    try {
      const { targets } = await getAutopilotTargets(bucket);
      if (targets.length === 0) {
        console.warn("Autopilot: no targets found for bucket", bucket);
        showOverlay(`### AI Autopilot\nNo high-priority targets were found for bucket **${bucket}**.`);
        setTimeout(() => hideOverlay(), 1800);
        return;
      }
      this.keyframes = this.planKeyframes(targets, bucket);
      this.currentKeyframe = 0;
      this.keyframeProgress = 0;
      this.captureStart();
      this.setState("running");

      // Disable user controls during autopilot
      this.ctx.controls.enabled = false;
    } catch (err) {
      console.error("Autopilot: failed to get targets", err);
      showOverlay("### AI Autopilot\nUnable to retrieve investigation targets right now.");
      setTimeout(() => hideOverlay(), 2200);
    }
  }

  stop(): void {
    this.setState("idle");
    hideOverlay();
    this.ctx.controls.enabled = true;
    this.abortController?.abort();
    this.abortController = null;
  }

  pause(): void {
    if (this.state !== "running") return;
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.captureStart();
    this.setState("running");
  }

  toggle(bucket: number): void {
    if (this.state === "running") {
      this.stop();
    } else if (this.state === "paused") {
      this.resume();
    } else {
      this.start(bucket);
    }
  }

  // ── Per-frame tick ───────────────────────────────────────────────

  tick(dt: number): void {
    if (this.state !== "running") return;
    if (this.currentKeyframe >= this.keyframes.length) {
      this.stop();
      return;
    }

    const kf = this.keyframes[this.currentKeyframe];
    this.keyframeProgress += dt / kf.duration;

    if (this.keyframeProgress >= 1) {
      // Snap to final position
      this.ctx.camera.position.copy(kf.position);
      this.ctx.controls.target.copy(kf.lookAt);
      this.ctx.controls.update();
      hideOverlay();

      // Advance
      this.currentKeyframe++;
      this.keyframeProgress = 0;
      this.captureStart();
      return;
    }

    const e = applyEasing(this.keyframeProgress, kf.easing);

    this.ctx.camera.position.lerpVectors(this.startPos, kf.position, e);
    this.ctx.controls.target.lerpVectors(this.startLookAt, kf.lookAt, e);
    this.ctx.controls.update();

    // Show annotation after camera settles (25% in), hold until 90%
    if (kf.annotation && this.keyframeProgress > 0.25 && this.keyframeProgress < 0.9) {
      showOverlay(kf.annotation);
    } else if (this.keyframeProgress >= 0.9) {
      hideOverlay();
    }
  }

  // ── Keyframe planning (cinematic) ───────────────────────────────

  private planKeyframes(targets: AutopilotTarget[], bucket: number): CameraKeyframe[] {
    const keyframes: CameraKeyframe[] = [];

    // Find highest-risk target for dramatic emphasis
    const maxRisk = Math.max(...targets.map((t) => t.risk_score), 0);

    // 1. Cinematic establishing shot — slow dramatic sweep
    keyframes.push({
      position: new THREE.Vector3(22, 16, 22),
      lookAt: new THREE.Vector3(0, 2, 0),
      duration: 3.5,
      easing: "ease-in-out",
      annotation: `### AI Autopilot\nScanning **${targets.length}** investigation targets in bucket **${bucket}**.`,
    });

    // 2. Visit each target with settle + hold pattern
    for (const [idx, target] of targets.entries()) {
      // Higher-risk targets get longer hold times
      const riskMultiplier = target.risk_score >= maxRisk * 0.9 ? 1.4 : 1.0;

      if (target.type === "entity") {
        const pos = this.nodeLayer.getPosition(target.entity_ids[0]);
        if (!pos) continue;

        // Approach — ease in from wider angle
        keyframes.push({
          position: new THREE.Vector3(pos.x + 6, pos.y + 4, pos.z + 6),
          lookAt: new THREE.Vector3(pos.x, pos.y, pos.z),
          duration: 2.5 * riskMultiplier,
          easing: "ease-in-out",
          annotation: `### Target ${idx + 1}/${targets.length}: ${target.label}\n${target.reason}`,
        });

        // Settle — close orbit, hold for annotation to land
        keyframes.push({
          position: new THREE.Vector3(pos.x + 2.5, pos.y + 1.5, pos.z - 2.5),
          lookAt: new THREE.Vector3(pos.x, pos.y, pos.z),
          duration: 2.0 * riskMultiplier,
          easing: "ease-out",
          annotation: `AI is focusing on \`${target.entity_ids[0]}\` due to: ${target.reason}`,
        });

        // Hold — very slight drift (barely perceptible camera movement)
        keyframes.push({
          position: new THREE.Vector3(pos.x + 2.3, pos.y + 1.6, pos.z - 2.3),
          lookAt: new THREE.Vector3(pos.x, pos.y, pos.z),
          duration: 1.8 * riskMultiplier,
          easing: "linear",
        });
      } else if (target.type === "cluster") {
        // Compute cluster centroid
        const centroid = new THREE.Vector3();
        let count = 0;
        for (const eid of target.entity_ids) {
          const p = this.nodeLayer.getPosition(eid);
          if (p) {
            centroid.add(p);
            count++;
          }
        }
        if (count === 0) continue;
        centroid.divideScalar(count);

        // Wider approach for clusters
        const radius = Math.max(count * 0.5, 4);
        keyframes.push({
          position: new THREE.Vector3(
            centroid.x + radius * 1.2,
            centroid.y + radius * 0.8,
            centroid.z + radius * 1.2,
          ),
          lookAt: centroid.clone(),
          duration: 3.5 * riskMultiplier,
          easing: "ease-in-out",
          annotation: `### Target ${idx + 1}/${targets.length}: ${target.label}\n${target.reason}`,
        });

        // Slow cinematic sweep around cluster
        keyframes.push({
          position: new THREE.Vector3(
            centroid.x - radius * 0.9,
            centroid.y + radius * 0.5,
            centroid.z + radius * 0.7,
          ),
          lookAt: centroid.clone(),
          duration: 3.5 * riskMultiplier,
          easing: "ease-out",
          annotation: `Inspecting **cluster behavior** to validate AI suspicion pattern.`,
        });

        // Hold on cluster
        keyframes.push({
          position: new THREE.Vector3(
            centroid.x - radius * 0.85,
            centroid.y + radius * 0.55,
            centroid.z + radius * 0.65,
          ),
          lookAt: centroid.clone(),
          duration: 2.0,
          easing: "linear",
        });
      }
    }

    // 3. Graceful return to overview
    keyframes.push({
      position: new THREE.Vector3(18, 14, 18),
      lookAt: new THREE.Vector3(0, 2, 0),
      duration: 3.0,
      easing: "ease-in-out",
      annotation: `### Investigation Complete\nAI reviewed **${targets.length}** targets. Click any entity ID in notes to inspect details.`,
    });

    return keyframes;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private captureStart(): void {
    this.startPos.copy(this.ctx.camera.position);
    this.startLookAt.copy(this.ctx.controls.target);
  }

  private setState(s: AutopilotState): void {
    this.state = s;
    this.onStateChange?.(s);
  }
}
