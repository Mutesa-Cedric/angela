export interface SnapshotNode {
  id: string;
  jurisdiction_bucket: number;
  kyc_level: string;
  risk_score: number;
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

export interface EntityDetail {
  id: string;
  type: string;
  bank: string;
  jurisdiction_bucket: number;
  kyc_level: string;
  risk_score: number;
  reasons: EntityReason[];
  evidence: Record<string, unknown>;
  activity: {
    in_count: number;
    out_count: number;
    in_sum: number;
    out_sum: number;
  } | null;
}
