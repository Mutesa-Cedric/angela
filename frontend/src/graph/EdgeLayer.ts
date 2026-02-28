import * as THREE from "three";
import type { SnapshotEdge } from "../types";
import type { NodeLayer } from "./NodeLayer";

const LOW_RISK_COLOR = new THREE.Color(0x334466);
const MID_RISK_COLOR = new THREE.Color(0xffaa00);
const HIGH_RISK_COLOR = new THREE.Color(0xff4444);

export class EdgeLayer {
  private group: THREE.Group;
  private lines: THREE.LineSegments | null = null;

  constructor(parent: THREE.Scene) {
    this.group = new THREE.Group();
    parent.add(this.group);
  }

  update(
    edges: SnapshotEdge[],
    nodeLayer: NodeLayer,
    riskScores: Map<string, number>,
  ): void {
    this.clear();

    if (edges.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    for (const edge of edges) {
      const fromPos = nodeLayer.getPosition(edge.from_id);
      const toPos = nodeLayer.getPosition(edge.to_id);
      if (!fromPos || !toPos) continue;

      positions.push(fromPos.x, fromPos.y, fromPos.z);
      positions.push(toPos.x, toPos.y, toPos.z);

      // Color based on max risk of endpoints
      const fromRisk = riskScores.get(edge.from_id) ?? 0;
      const toRisk = riskScores.get(edge.to_id) ?? 0;
      const maxRisk = Math.max(fromRisk, toRisk);

      if (maxRisk > 0.5) {
        color.copy(HIGH_RISK_COLOR);
      } else if (maxRisk > 0.2) {
        color.copy(MID_RISK_COLOR);
      } else {
        color.copy(LOW_RISK_COLOR);
      }

      // Both vertices get same color
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.lines = new THREE.LineSegments(geometry, material);
    this.group.add(this.lines);
  }

  clear(): void {
    if (this.lines) {
      this.lines.geometry.dispose();
      (this.lines.material as THREE.Material).dispose();
      this.group.remove(this.lines);
      this.lines = null;
    }
  }
}
