import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { NodeLayer } from "./NodeLayer";

interface PlacedAsset {
  id: string;
  object: THREE.Object3D;
  type: "cluster_blob" | "beacon";
  entityIds: string[];
  bucket: number;
  pulse: number; // animation phase
}

const loader = new GLTFLoader();
const PULSE_SPEED = 2.0;
const PULSE_SCALE_MIN = 0.9;
const PULSE_SCALE_MAX = 1.15;

export class AssetLayer {
  private group: THREE.Group;
  private assets: Map<string, PlacedAsset> = new Map();
  private clock: THREE.Clock;

  constructor(parent: THREE.Scene) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.clock = new THREE.Clock();
  }

  /**
   * Load a GLB from URL and place at the centroid of entity positions.
   */
  async loadGLB(
    assetId: string,
    url: string,
    assetType: "cluster_blob" | "beacon",
    entityIds: string[],
    bucket: number,
    nodeLayer: NodeLayer,
  ): Promise<void> {
    // Remove existing asset with same ID
    this.remove(assetId);

    try {
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

      const object = gltf.scene;
      const centroid = this.computeCentroid(entityIds, nodeLayer);
      object.position.copy(centroid);

      // Scale based on asset type
      if (assetType === "cluster_blob") {
        object.scale.setScalar(1.5);
      } else {
        object.scale.setScalar(0.8);
      }

      this.group.add(object);
      this.assets.set(assetId, {
        id: assetId,
        object,
        type: assetType,
        entityIds,
        bucket,
        pulse: Math.random() * Math.PI * 2, // random phase offset
      });
    } catch (err) {
      console.warn(`Failed to load GLB ${url}, using fallback`, err);
      this.addFallback(assetId, assetType, entityIds, bucket, nodeLayer);
    }
  }

  /**
   * Create a procedural Three.js fallback when GLB loading fails.
   */
  addFallback(
    assetId: string,
    assetType: "cluster_blob" | "beacon",
    entityIds: string[],
    bucket: number,
    nodeLayer: NodeLayer,
  ): void {
    this.remove(assetId);

    const centroid = this.computeCentroid(entityIds, nodeLayer);
    let object: THREE.Object3D;

    if (assetType === "cluster_blob") {
      // Semi-transparent pulsing sphere
      const geo = new THREE.SphereGeometry(0.6 + entityIds.length * 0.05, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0.4,
        emissive: 0xff2222,
        emissiveIntensity: 0.3,
        roughness: 0.3,
      });
      object = new THREE.Mesh(geo, mat);
    } else {
      // Beacon: cone
      const group = new THREE.Group();

      const cylGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8);
      const cylMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff4400,
        emissiveIntensity: 0.5,
      });
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.position.y = 0.25;
      group.add(cyl);

      const coneGeo = new THREE.ConeGeometry(0.12, 0.25, 8);
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xff6600,
        emissiveIntensity: 0.5,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 0.65;
      group.add(cone);

      object = group;
    }

    object.position.copy(centroid);
    // Offset above nodes so it doesn't overlap
    object.position.y += 0.8;

    this.group.add(object);
    this.assets.set(assetId, {
      id: assetId,
      object,
      type: assetType,
      entityIds,
      bucket,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Animate all assets (pulse effect). Call in render loop.
   */
  animate(): void {
    const dt = this.clock.getDelta();
    for (const asset of this.assets.values()) {
      asset.pulse += dt * PULSE_SPEED;
      const s = PULSE_SCALE_MIN + (PULSE_SCALE_MAX - PULSE_SCALE_MIN) * (0.5 + 0.5 * Math.sin(asset.pulse));
      const baseScale = asset.type === "cluster_blob" ? 1.5 : 0.8;
      asset.object.scale.setScalar(baseScale * s);
    }
  }

  /**
   * Remove a specific asset by ID.
   */
  remove(assetId: string): void {
    const existing = this.assets.get(assetId);
    if (existing) {
      this.group.remove(existing.object);
      existing.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.assets.delete(assetId);
    }
  }

  /**
   * Remove all assets for a specific bucket.
   */
  clearBucket(bucket: number): void {
    for (const [id, asset] of this.assets) {
      if (asset.bucket === bucket) {
        this.remove(id);
      }
    }
  }

  /**
   * Remove all assets.
   */
  clear(): void {
    for (const id of [...this.assets.keys()]) {
      this.remove(id);
    }
  }

  private computeCentroid(entityIds: string[], nodeLayer: NodeLayer): THREE.Vector3 {
    const centroid = new THREE.Vector3();
    let count = 0;

    for (const eid of entityIds) {
      const pos = nodeLayer.getPosition(eid);
      if (pos) {
        centroid.add(pos);
        count++;
      }
    }

    if (count > 0) {
      centroid.divideScalar(count);
    }
    // Offset above nodes
    centroid.y += 0.8;

    return centroid;
  }
}
