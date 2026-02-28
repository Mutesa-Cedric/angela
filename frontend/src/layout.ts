import type { SnapshotNode } from "./types";

/**
 * Risk Space layout:
 *   X = jurisdiction_bucket lane (spread evenly)
 *   Y = risk_score * height scale (risky = higher)
 *   Z = kyc_level offset (standard=0, enhanced=1)
 *
 * Nodes within the same lane are jittered deterministically to avoid overlap.
 */

export const RISK_LAYOUT = {
  laneSpacing: 5.8,
  heightScale: 10.2,
  kycZOffset: 4.8,
  jitterRadiusMin: 0.45,
  jitterRadiusMax: 2.35,
  yJitter: 0.6,
  laneWave: 0.42,
} as const;

function deterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

export function computePositions(
  nodes: SnapshotNode[],
  nJurisdictions: number = 8,
): Float32Array {
  const positions = new Float32Array(nodes.length * 3);

  // Center lanes around origin
  const laneOffset = ((nJurisdictions - 1) * RISK_LAYOUT.laneSpacing) / 2;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const hash = deterministicHash(node.id) >>> 0;
    const hash2 = deterministicHash(`${node.id}_z`) >>> 0;
    const hash3 = deterministicHash(`${node.id}_y`) >>> 0;

    // Deterministic radial jitter within each jurisdiction lane.
    const radialSeed = (hash & 0xffffff) / 0xffffff;
    const angleSeed = (hash2 & 0xffffff) / 0xffffff;
    const ySeed = (hash3 & 0xffffff) / 0xffffff;
    const angle = angleSeed * Math.PI * 2;
    const radius = RISK_LAYOUT.jitterRadiusMin
      + Math.sqrt(radialSeed) * (RISK_LAYOUT.jitterRadiusMax - RISK_LAYOUT.jitterRadiusMin);

    const jitterX = Math.cos(angle) * radius;
    const jitterZ = Math.sin(angle) * radius;
    const wave = Math.sin(node.jurisdiction_bucket * 0.9 + angle) * RISK_LAYOUT.laneWave;

    const x = node.jurisdiction_bucket * RISK_LAYOUT.laneSpacing - laneOffset + jitterX;
    const y = Math.max(0, node.risk_score * RISK_LAYOUT.heightScale + (ySeed - 0.5) * RISK_LAYOUT.yJitter);
    const z = (node.kyc_level === "enhanced" ? RISK_LAYOUT.kycZOffset : 0) + jitterZ + wave;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}
