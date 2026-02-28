from pydantic import BaseModel


class EntityOut(BaseModel):
    id: str
    type: str
    bank: str
    jurisdiction_bucket: int
    kyc_level: str
    risk_score: float


class SnapshotNode(BaseModel):
    id: str
    jurisdiction_bucket: int
    kyc_level: str
    risk_score: float
    entity_type: str = "account"
    volume: float = 0.0


class SnapshotMeta(BaseModel):
    t: int
    n_buckets: int
    n_entities: int
    n_transactions: int
    bucket_size_seconds: int


class SnapshotOut(BaseModel):
    meta: SnapshotMeta
    nodes: list[SnapshotNode]
    edges: list[dict]


class ReasonOut(BaseModel):
    detector: str
    detail: str
    weight: float


class EntityDetailOut(BaseModel):
    id: str
    type: str
    bank: str
    jurisdiction_bucket: int
    kyc_level: str
    risk_score: float
    reasons: list[ReasonOut]
    evidence: dict
    activity: dict | None = None


class NeighborEdge(BaseModel):
    from_id: str
    to_id: str
    amount: float


class NeighborhoodOut(BaseModel):
    center_id: str
    k: int
    nodes: list[SnapshotNode]
    edges: list[NeighborEdge]


class ErrorOut(BaseModel):
    detail: str
