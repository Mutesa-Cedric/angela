import * as THREE from "three";
import type { SnapshotNode } from "../types";
import { computePositions } from "../layout";

const SELECTED_COLOR = new THREE.Color(0xffffff);

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

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

export class NodeLayer {
  mesh: THREE.InstancedMesh;
  private idToIndex: Map<string, number> = new Map();
  private indexToId: Map<number, string> = new Map();
  private nodes: SnapshotNode[] = [];
  private selectedIndex: number = -1;
  private maxCount: number;

  constructor(maxCount: number = 5000) {
    this.maxCount = maxCount;
    // Unit sphere — scaled per-instance by risk
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.25,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Enable instance color
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * 3),
      3,
    );
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  update(nodes: SnapshotNode[]): void {
    this.nodes = nodes;
    this.idToIndex.clear();
    this.indexToId.clear();

    const count = Math.min(nodes.length, this.maxCount);
    this.mesh.count = count;

    const positions = computePositions(nodes);

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      this.idToIndex.set(node.id, i);
      this.indexToId.set(i, node.id);

      // Position + risk-based scale
      const radius = 0.08 + node.risk_score * 0.37;
      _dummy.position.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      );
      _dummy.scale.setScalar(radius);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);

      // Color
      this.setInstanceColor(i, node);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  private setInstanceColor(i: number, node: SnapshotNode): void {
    if (i === this.selectedIndex) {
      _color.copy(SELECTED_COLOR);
    } else {
      _color.copy(riskColor(node.risk_score));
    }
    this.mesh.setColorAt(i, _color);
  }

  getEntityId(instanceId: number): string | undefined {
    return this.indexToId.get(instanceId);
  }

  getInstanceId(entityId: string): number | undefined {
    return this.idToIndex.get(entityId);
  }

  select(entityId: string | null): void {
    const prevIndex = this.selectedIndex;
    this.selectedIndex = entityId ? (this.idToIndex.get(entityId) ?? -1) : -1;

    // Restore previous color
    if (prevIndex >= 0 && prevIndex < this.nodes.length) {
      this.setInstanceColor(prevIndex, this.nodes[prevIndex]);
    }

    // Set new selection color
    if (this.selectedIndex >= 0 && this.selectedIndex < this.nodes.length) {
      this.setInstanceColor(this.selectedIndex, this.nodes[this.selectedIndex]);
    }

    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  getPosition(entityId: string): THREE.Vector3 | null {
    const idx = this.idToIndex.get(entityId);
    if (idx === undefined) return null;
    const matrix = new THREE.Matrix4();
    this.mesh.getMatrixAt(idx, matrix);
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(matrix);
    return pos;
  }
}
