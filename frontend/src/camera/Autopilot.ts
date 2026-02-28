import * as THREE from "three";
import type { SceneContext } from "../scene";
import type { NodeLayer } from "../graph/NodeLayer";
import type { AutopilotTarget } from "../types";
import { getAutopilotTargets } from "../api/client";

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

function showOverlay(text: string): void {
  overlayEl.textContent = text;
  overlayEl.style.display = "block";
  overlayEl.classList.remove("fade-out");
  overlayEl.classList.add("fade-in");
}

function hideOverlay(): void {
  overlayEl.classList.remove("fade-in");
  overlayEl.classList.add("fade-out");
  setTimeout(() => {
    overlayEl.style.display = "none";
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
        return;
      }
      this.keyframes = this.planKeyframes(targets);
      this.currentKeyframe = 0;
      this.keyframeProgress = 0;
      this.captureStart();
      this.setState("running");

      // Disable user controls during autopilot
      this.ctx.controls.enabled = false;
    } catch (err) {
      console.error("Autopilot: failed to get targets", err);
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

    // Show annotation at 20% progress
    if (kf.annotation && this.keyframeProgress > 0.15 && this.keyframeProgress < 0.85) {
      showOverlay(kf.annotation);
    }
  }

  // ── Keyframe planning ────────────────────────────────────────────

  private planKeyframes(targets: AutopilotTarget[]): CameraKeyframe[] {
    const keyframes: CameraKeyframe[] = [];

    // 1. Overview establishing shot
    keyframes.push({
      position: new THREE.Vector3(18, 14, 18),
      lookAt: new THREE.Vector3(0, 2, 0),
      duration: 2.5,
      easing: "ease-in-out",
      annotation: "Overview — scanning network for anomalies",
    });

    // 2. Visit each target
    for (const target of targets) {
      if (target.type === "entity") {
        const pos = this.nodeLayer.getPosition(target.entity_ids[0]);
        if (!pos) continue;

        // Approach shot
        keyframes.push({
          position: new THREE.Vector3(pos.x + 5, pos.y + 3, pos.z + 5),
          lookAt: new THREE.Vector3(pos.x, pos.y, pos.z),
          duration: 2.0,
          easing: "ease-in-out",
          annotation: target.label,
        });

        // Close orbit
        keyframes.push({
          position: new THREE.Vector3(pos.x + 2.5, pos.y + 1.5, pos.z - 2),
          lookAt: new THREE.Vector3(pos.x, pos.y, pos.z),
          duration: 2.5,
          easing: "ease-out",
          annotation: target.reason,
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

        // Wide view of cluster
        const radius = Math.max(count * 0.5, 4);
        keyframes.push({
          position: new THREE.Vector3(
            centroid.x + radius,
            centroid.y + radius * 0.7,
            centroid.z + radius,
          ),
          lookAt: centroid.clone(),
          duration: 3.0,
          easing: "ease-in-out",
          annotation: target.label,
        });

        // Sweep around cluster
        keyframes.push({
          position: new THREE.Vector3(
            centroid.x - radius * 0.8,
            centroid.y + radius * 0.4,
            centroid.z + radius * 0.6,
          ),
          lookAt: centroid.clone(),
          duration: 3.0,
          easing: "ease-out",
          annotation: target.reason,
        });
      }
    }

    // 3. Return to overview
    keyframes.push({
      position: new THREE.Vector3(15, 12, 15),
      lookAt: new THREE.Vector3(0, 2, 0),
      duration: 2.5,
      easing: "ease-in-out",
      annotation: "Investigation complete",
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
