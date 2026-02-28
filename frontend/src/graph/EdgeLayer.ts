import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { SnapshotEdge } from "../types";
import type { NodeLayer } from "./NodeLayer";

const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

/** Continuous risk-to-color gradient for edges. */
function edgeRiskColor(risk: number): THREE.Color {
  if (risk < 0.3) {
    return _tmpA.set(0x1a3355).lerp(_tmpB.set(0x338866), risk / 0.3);
  } else if (risk < 0.6) {
    return _tmpA.set(0x338866).lerp(_tmpB.set(0xdd8800), (risk - 0.3) / 0.3);
  } else {
    return _tmpA.set(0xdd8800).lerp(_tmpB.set(0xff3333), (risk - 0.6) / 0.4);
  }
}

interface Tier {
  maxAmount: number;
  linewidth: number;
  edges: SnapshotEdge[];
}

export class EdgeLayer {
  private group: THREE.Group;
  private segments: LineSegments2[] = [];
  private materials: LineMaterial[] = [];

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

    // Bucket edges into thickness tiers by amount
    const tiers: Tier[] = [
      { maxAmount: 1000, linewidth: 0.03, edges: [] },
      { maxAmount: 10000, linewidth: 0.06, edges: [] },
      { maxAmount: Infinity, linewidth: 0.1, edges: [] },
    ];

    for (const edge of edges) {
      const tier = tiers.find((t) => edge.amount <= t.maxAmount)!;
      tier.edges.push(edge);
    }

    for (const tier of tiers) {
      if (tier.edges.length === 0) continue;

      const positions: number[] = [];
      const colors: number[] = [];

      for (const edge of tier.edges) {
        const fromPos = nodeLayer.getPosition(edge.from_id);
        const toPos = nodeLayer.getPosition(edge.to_id);
        if (!fromPos || !toPos) continue;

        positions.push(fromPos.x, fromPos.y, fromPos.z);
        positions.push(toPos.x, toPos.y, toPos.z);

        const maxRisk = Math.max(
          riskScores.get(edge.from_id) ?? 0,
          riskScores.get(edge.to_id) ?? 0,
        );
        const c = edgeRiskColor(maxRisk);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }

      if (positions.length === 0) continue;

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);

      const material = new LineMaterial({
        linewidth: tier.linewidth,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        dashed: true,
        dashScale: 1,
        dashSize: 0.8,
        gapSize: 0.4,
        dashOffset: 0,
        worldUnits: true,
        depthWrite: false,
      });
      material.resolution.set(window.innerWidth, window.innerHeight);

      const seg = new LineSegments2(geometry, material);
      seg.computeLineDistances();
      this.group.add(seg);
      this.segments.push(seg);
      this.materials.push(material);
    }
  }

  /** Animate dash flow — call per frame. */
  animate(dt: number): void {
    for (const mat of this.materials) {
      mat.dashOffset -= dt * 0.5;
    }
  }

  /** Show counterfactual removed edges as red, thicker lines. */
  showCounterfactual(
    removedEdges: { from_id: string; to_id: string; amount: number }[],
    nodeLayer: NodeLayer,
  ): void {
    this.clear();
    if (removedEdges.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of removedEdges) {
      const fromPos = nodeLayer.getPosition(edge.from_id);
      const toPos = nodeLayer.getPosition(edge.to_id);
      if (!fromPos || !toPos) continue;

      positions.push(fromPos.x, fromPos.y, fromPos.z);
      positions.push(toPos.x, toPos.y, toPos.z);

      // Red color for suspicious edges
      colors.push(1.0, 0.25, 0.3, 1.0, 0.25, 0.3);
    }

    if (positions.length === 0) return;

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);

    const material = new LineMaterial({
      linewidth: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      dashed: true,
      dashScale: 1,
      dashSize: 0.5,
      gapSize: 0.3,
      dashOffset: 0,
      worldUnits: true,
      depthWrite: false,
    });
    material.resolution.set(window.innerWidth, window.innerHeight);

    const seg = new LineSegments2(geometry, material);
    seg.computeLineDistances();
    this.group.add(seg);
    this.segments.push(seg);
    this.materials.push(material);
  }

  clear(): void {
    for (const seg of this.segments) {
      seg.geometry.dispose();
      (seg.material as LineMaterial).dispose();
      this.group.remove(seg);
    }
    this.segments = [];
    this.materials = [];
  }
}
