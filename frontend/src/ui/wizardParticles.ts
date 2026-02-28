import * as THREE from "three";

type Phase = "stream" | "ring" | "explode" | "fade" | "done";

const COUNT = 300;
const RING_RADIUS = 3;
const RING_Y = 2;

export class WizardParticles {
  private points: THREE.Points;
  private positions: Float32Array;
  private targets: Float32Array;
  private alphas: Float32Array;
  private phase: Phase = "stream";
  private elapsed = 0;
  private material: THREE.PointsMaterial;
  private ringAngle = 0;

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.positions = new Float32Array(COUNT * 3);
    this.targets = new Float32Array(COUNT * 3);
    this.alphas = new Float32Array(COUNT);

    // Initialize particles below the scene
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 0.8;
      this.positions[i * 3 + 1] = -3 + Math.random() * -2;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      this.alphas[i] = 0.3 + Math.random() * 0.7;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x4488ff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    scene.add(this.points);
  }

  /** Transition to stream-up mode (step 0). */
  setStream(): void {
    this.phase = "stream";
    this.elapsed = 0;
    // Set targets: column rising to y=2
    for (let i = 0; i < COUNT; i++) {
      this.targets[i * 3] = (Math.random() - 0.5) * 1.2;
      this.targets[i * 3 + 1] = Math.random() * 6;
      this.targets[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
  }

  /** Transition to ring formation (step 1). */
  setRing(): void {
    this.phase = "ring";
    this.elapsed = 0;
    this.ringAngle = 0;
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const wobble = 0.3 * Math.sin(i * 7.3);
      this.targets[i * 3] = Math.cos(angle) * (RING_RADIUS + wobble);
      this.targets[i * 3 + 1] = RING_Y + (Math.random() - 0.5) * 0.6;
      this.targets[i * 3 + 2] = Math.sin(angle) * (RING_RADIUS + wobble);
    }
  }

  /** Explode particles outward to node positions (step 2). */
  setExplode(nodePositions: Float32Array): void {
    this.phase = "explode";
    this.elapsed = 0;
    const nodeCount = nodePositions.length / 3;
    for (let i = 0; i < COUNT; i++) {
      // Map particle to a node position (wrap around if more particles than nodes)
      const ni = nodeCount > 0 ? i % nodeCount : 0;
      if (nodeCount > 0) {
        this.targets[i * 3] = nodePositions[ni * 3];
        this.targets[i * 3 + 1] = nodePositions[ni * 3 + 1];
        this.targets[i * 3 + 2] = nodePositions[ni * 3 + 2];
      } else {
        // Fallback: random scatter
        this.targets[i * 3] = (Math.random() - 0.5) * 20;
        this.targets[i * 3 + 1] = Math.random() * 10;
        this.targets[i * 3 + 2] = (Math.random() - 0.5) * 20;
      }
    }
  }

  /** Fade out (step 3 — real nodes take over). */
  setFade(): void {
    this.phase = "fade";
    this.elapsed = 0;
  }

  /** Per-frame update. */
  update(dt: number): void {
    if (this.phase === "done") return;
    this.elapsed += dt;

    const pos = this.positions;
    const tgt = this.targets;

    if (this.phase === "stream") {
      // Particles drift upward toward targets
      const speed = 3.0;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        pos[i3] += (tgt[i3] - pos[i3]) * dt * speed;
        pos[i3 + 1] += (tgt[i3 + 1] - pos[i3 + 1]) * dt * speed + dt * 1.5;
        pos[i3 + 2] += (tgt[i3 + 2] - pos[i3 + 2]) * dt * speed;
        // Wrap around if too high
        if (pos[i3 + 1] > 8) pos[i3 + 1] = -2;
      }
      this.material.opacity = Math.min(0.8, this.elapsed * 2);
    }

    if (this.phase === "ring") {
      // Lerp toward ring positions + spin
      this.ringAngle += dt * 0.8;
      const cos = Math.cos(this.ringAngle);
      const sin = Math.sin(this.ringAngle);
      const lerpSpeed = 4.0;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        // Rotate target around Y axis
        const rx = tgt[i3] * cos - tgt[i3 + 2] * sin;
        const rz = tgt[i3] * sin + tgt[i3 + 2] * cos;
        pos[i3] += (rx - pos[i3]) * dt * lerpSpeed;
        pos[i3 + 1] += (tgt[i3 + 1] - pos[i3 + 1]) * dt * lerpSpeed;
        pos[i3 + 2] += (rz - pos[i3 + 2]) * dt * lerpSpeed;
      }
      this.material.opacity = 0.9;
      this.material.color.setHex(0x22aa88);
    }

    if (this.phase === "explode") {
      // Fast lerp to node positions
      const lerpSpeed = 3.0;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        pos[i3] += (tgt[i3] - pos[i3]) * dt * lerpSpeed;
        pos[i3 + 1] += (tgt[i3 + 1] - pos[i3 + 1]) * dt * lerpSpeed;
        pos[i3 + 2] += (tgt[i3 + 2] - pos[i3 + 2]) * dt * lerpSpeed;
      }
      this.material.opacity = Math.max(0.3, 0.9 - this.elapsed * 0.5);
    }

    if (this.phase === "fade") {
      this.material.opacity = Math.max(0, 0.5 - this.elapsed * 1.5);
      if (this.material.opacity <= 0) {
        this.phase = "done";
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }

  /** Remove from scene and clean up. */
  dispose(): void {
    this.phase = "done";
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
