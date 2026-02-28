import * as THREE from "three";
import type { NodeLayer } from "./NodeLayer";
import type { ClusterData } from "../api/client";

// ── Cluster visual constants ──────────────────────────────────────────

const RING_SEGMENTS = 64;
const LABEL_Y_OFFSET = 1.2;

// ── ClusterLayer ──────────────────────────────────────────────────────

interface ClusterVisual {
  id: string;
  ring: THREE.Mesh;
  label: HTMLDivElement;
  centroid: THREE.Vector3;
  radius: number;
  riskScore: number;
}

export class ClusterLayer {
  private group: THREE.Group;
  private visuals: ClusterVisual[] = [];
  private labelContainer: HTMLDivElement;
  private camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.group.name = "ClusterLayer";
    scene.add(this.group);
    this.camera = camera;

    // Create label container overlay
    this.labelContainer = document.createElement("div");
    this.labelContainer.id = "cluster-labels";
    document.body.appendChild(this.labelContainer);
  }

  update(clusters: ClusterData[], nodeLayer: NodeLayer): void {
    this.clear();

    for (const cluster of clusters) {
      if (cluster.size < 2) continue;

      // Compute centroid and spread from entity positions
      const positions: THREE.Vector3[] = [];
      for (const eid of cluster.entity_ids) {
        const pos = nodeLayer.getPosition(eid);
        if (pos) positions.push(pos);
      }
      if (positions.length < 2) continue;

      const centroid = new THREE.Vector3();
      for (const p of positions) centroid.add(p);
      centroid.divideScalar(positions.length);

      // Compute radius as max distance from centroid (XZ plane)
      let maxDist = 0;
      for (const p of positions) {
        const dx = p.x - centroid.x;
        const dz = p.z - centroid.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > maxDist) maxDist = dist;
      }
      const ringRadius = Math.max(maxDist + 0.5, 1.5);

      // Risk-based color
      const riskColor = this.riskToColor(cluster.risk_score);

      // Static ring — analytical boundary marker
      const ringGeo = new THREE.RingGeometry(ringRadius - 0.04, ringRadius + 0.04, RING_SEGMENTS);
      const ringMat = new THREE.MeshBasicMaterial({
        color: riskColor,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(centroid);
      ring.position.y = centroid.y - 0.15;
      this.group.add(ring);

      // HTML label anchored to 3D position
      const label = document.createElement("div");
      label.className = "cluster-label";
      label.innerHTML = `
        <span class="cl-name">${cluster.cluster_id.replace("_", " ")}</span>
        <span class="cl-stats">${cluster.size} entities · ${(cluster.risk_score * 100).toFixed(0)}% risk</span>
      `;
      this.labelContainer.appendChild(label);

      this.visuals.push({
        id: cluster.cluster_id,
        ring,
        label,
        centroid: centroid.clone(),
        radius: ringRadius,
        riskScore: cluster.risk_score,
      });
    }
  }

  /** Call per frame — project labels to screen. */
  animate(): void {
    for (const vis of this.visuals) {
      // Project label to screen
      const screenPos = vis.centroid.clone();
      screenPos.y += LABEL_Y_OFFSET;
      screenPos.project(this.camera);

      if (screenPos.z > 1) {
        vis.label.style.display = "none";
        continue;
      }

      const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
      vis.label.style.display = "block";
      vis.label.style.left = `${x}px`;
      vis.label.style.top = `${y}px`;

      // Fade by distance
      const dist = this.camera.position.distanceTo(vis.centroid);
      const labelOpacity = dist < 5 ? 1 : dist > 40 ? 0 : 1 - (dist - 5) / 35;
      vis.label.style.opacity = String(labelOpacity);
    }
  }

  clear(): void {
    for (const vis of this.visuals) {
      this.group.remove(vis.ring);
      vis.ring.geometry.dispose();
      (vis.ring.material as THREE.Material).dispose();
      vis.label.remove();
    }
    this.visuals = [];
  }

  private riskToColor(risk: number): THREE.Color {
    if (risk < 0.4) return new THREE.Color(0x238551);
    if (risk < 0.6) return new THREE.Color(0xf39f41);
    return new THREE.Color(0xcd4246);
  }
}
