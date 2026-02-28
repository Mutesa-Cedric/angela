import * as THREE from "three";
import type { SnapshotNode } from "../types";
import { computePositions } from "../layout";

const NODE_RADIUS = 0.15;
const NODE_SEGMENTS = 12;
const DEFAULT_COLOR = new THREE.Color(0x4488ff);
const ENHANCED_COLOR = new THREE.Color(0xff8844);
const SELECTED_COLOR = new THREE.Color(0xffff00);

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export class NodeLayer {
  mesh: THREE.InstancedMesh;
  private idToIndex: Map<string, number> = new Map();
  private indexToId: Map<number, string> = new Map();
  private nodes: SnapshotNode[] = [];
  private selectedIndex: number = -1;
  private maxCount: number;

  constructor(maxCount: number = 5000) {
    this.maxCount = maxCount;
    const geometry = new THREE.SphereGeometry(NODE_RADIUS, NODE_SEGMENTS, NODE_SEGMENTS);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      roughness: 0.6,
      metalness: 0.2,
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

      // Position
      _dummy.position.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      );
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
    } else if (node.kyc_level === "enhanced") {
      _color.copy(ENHANCED_COLOR);
    } else {
      _color.copy(DEFAULT_COLOR);
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
