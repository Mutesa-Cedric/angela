import * as THREE from "three";

/**
 * NodeFactory — produces shared geometries by entity type.
 *
 * Entity types:
 *  - account  → sphere
 *  - merchant → rounded box (BoxGeometry)
 *  - bank     → octahedron (diamond shape)
 *
 * All geometries are unit-sized (radius/half-extent = 1) and shared via a cache.
 */

export type EntityShape = "sphere" | "box" | "diamond";

const SHAPE_MAP: Record<string, EntityShape> = {
  account: "sphere",
  individual: "sphere",
  merchant: "box",
  company: "box",
  bank: "diamond",
  government: "diamond",
};

const LOD_SEGMENTS: Record<string, { hi: number; mid: number; lo: number }> = {
  sphere: { hi: 16, mid: 8, lo: 4 },
  box: { hi: 1, mid: 1, lo: 1 }, // box segments
  diamond: { hi: 0, mid: 0, lo: 0 }, // octahedron detail
};

export function entityShape(entityType: string): EntityShape {
  return SHAPE_MAP[entityType.toLowerCase()] ?? "sphere";
}

/** Cache key = shape + lod tier */
const geoCache = new Map<string, THREE.BufferGeometry>();

function makeGeometry(
  shape: EntityShape,
  lod: "hi" | "mid" | "lo",
): THREE.BufferGeometry {
  const key = `${shape}_${lod}`;
  const cached = geoCache.get(key);
  if (cached) return cached;

  let geo: THREE.BufferGeometry;
  const segs = LOD_SEGMENTS[shape];

  switch (shape) {
    case "sphere": {
      const s = lod === "hi" ? segs.hi : lod === "mid" ? segs.mid : segs.lo;
      geo = new THREE.SphereGeometry(1, s, s);
      break;
    }
    case "box": {
      geo = new THREE.BoxGeometry(1.6, 1.6, 1.6, 1, 1, 1);
      break;
    }
    case "diamond": {
      const detail = lod === "hi" ? 1 : 0;
      geo = new THREE.OctahedronGeometry(1, detail);
      break;
    }
  }

  geoCache.set(key, geo);
  return geo;
}

export function getGeometry(
  entityType: string,
  lod: "hi" | "mid" | "lo" = "hi",
): THREE.BufferGeometry {
  return makeGeometry(entityShape(entityType), lod);
}

export function disposeCache(): void {
  for (const geo of geoCache.values()) geo.dispose();
  geoCache.clear();
}
