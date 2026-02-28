import type { SnapshotNode } from "./types";

/**
 * Risk Space layout:
 *   X = jurisdiction_bucket lane (spread evenly)
 *   Y = risk_score * height scale (risky = higher)
 *   Z = kyc_level offset (standard=0, enhanced=1)
 *
 * Nodes within the same lane are jittered deterministically to avoid overlap.
 */

const LANE_SPACING = 4;
const HEIGHT_SCALE = 8;
const KYC_Z_OFFSET = 3;
const JITTER_SCALE = 1.5;

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
  const laneOffset = ((nJurisdictions - 1) * LANE_SPACING) / 2;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const hash = deterministicHash(node.id);
    const hash2 = deterministicHash(node.id + "_z");

    // Deterministic jitter within lane
    const jitterX = ((hash & 0xffff) / 0xffff - 0.5) * JITTER_SCALE;
    const jitterZ = ((hash2 & 0xffff) / 0xffff - 0.5) * JITTER_SCALE;

    const x = node.jurisdiction_bucket * LANE_SPACING - laneOffset + jitterX;
    const y = node.risk_score * HEIGHT_SCALE;
    const z = (node.kyc_level === "enhanced" ? KYC_Z_OFFSET : 0) + jitterZ;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}
