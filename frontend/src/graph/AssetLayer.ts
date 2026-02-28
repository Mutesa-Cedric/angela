import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { NodeLayer } from "./NodeLayer";

interface PlacedAsset {
  id: string;
  object: THREE.Object3D;
  type: "cluster_blob" | "beacon";
  entityIds: string[];
  bucket: number;
}

const loader = new GLTFLoader();

export class AssetLayer {
  private group: THREE.Group;
  private assets: Map<string, PlacedAsset> = new Map();

  constructor(parent: THREE.Scene) {
    this.group = new THREE.Group();
    parent.add(this.group);
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
      const geo = new THREE.SphereGeometry(0.6 + entityIds.length * 0.05, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcd4246,
        transparent: true,
        opacity: 0.3,
        roughness: 0.6,
      });
      object = new THREE.Mesh(geo, mat);
    } else {
      const group = new THREE.Group();

      const cylGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8);
      const cylMat = new THREE.MeshStandardMaterial({
        color: 0xf39f41,
        roughness: 0.5,
      });
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.position.y = 0.25;
      group.add(cyl);

      const coneGeo = new THREE.ConeGeometry(0.12, 0.25, 8);
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0xf39f41,
        roughness: 0.5,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 0.65;
      group.add(cone);

      object = group;
    }

    object.position.copy(centroid);
    object.position.y += 0.8;

    this.group.add(object);
    this.assets.set(assetId, {
      id: assetId,
      object,
      type: assetType,
      entityIds,
      bucket,
    });
  }

  /** Per-frame tick — static assets, no animation. */
  animate(): void {
    // No-op: assets are static
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
