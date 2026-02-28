export interface SnapshotNode {
  id: string;
  jurisdiction_bucket: number;
  kyc_level: string;
  risk_score: number;
  entity_type: string;
  volume: number;
}

export interface SnapshotEdge {
  from_id: string;
  to_id: string;
  amount: number;
}

export interface SnapshotMeta {
  t: number;
  n_buckets: number;
  n_entities: number;
  n_transactions: number;
  bucket_size_seconds: number;
}

export interface Snapshot {
  meta: SnapshotMeta;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
}

export interface EntityReason {
  detector: string;
  detail: string;
  weight: number;
}

export interface VelocityEvidence {
  tx_count: number;
  tx_per_minute: number;
  population_median: number;
  population_p95: number;
}

export interface StructuringEvidence {
  near_threshold_count: number;
  threshold: number;
  delta: number;
}

export interface CircularFlowEvidence {
  cycle_count: number;
  shortest_cycle_length: number;
  counterparties: string[];
}

export interface EntityEvidence {
  velocity?: VelocityEvidence;
  structuring?: StructuringEvidence;
  circular_flow?: CircularFlowEvidence;
  flagged_tx_ids?: string[];
}

export interface EntityDetail {
  id: string;
  type: string;
  bank: string;
  jurisdiction_bucket: number;
  kyc_level: string;
  risk_score: number;
  reasons: EntityReason[];
  evidence: EntityEvidence;
  activity: {
    in_count: number;
    out_count: number;
    in_sum: number;
    out_sum: number;
  } | null;
}

export interface Neighborhood {
  center_id: string;
  k: number;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
}

export interface AutopilotTarget {
  type: "entity" | "cluster";
  id: string;
  entity_ids: string[];
  risk_score: number;
  label: string;
  reason: string;
}
