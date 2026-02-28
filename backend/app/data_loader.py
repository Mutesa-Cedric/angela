import json
import logging
from pathlib import Path
from collections import defaultdict

from .risk.scoring import compute_risk_for_bucket

log = logging.getLogger(__name__)


class DataStore:
    """In-memory store for processed AML snapshot data."""

    def __init__(self) -> None:
        self.metadata: dict = {}
        self.entities: list[dict] = []
        self.transactions: list[dict] = []
        self.bucket_index: dict[str, list[int]] = {}
        self.entity_activity: dict[str, dict[str, dict]] = {}

        # Runtime indices
        self.entities_by_id: dict[str, dict] = {}
        self.adjacency: dict[str, set[str]] = defaultdict(set)
        self.n_buckets: int = 0

        # Risk scores per bucket: bucket -> entity_id -> {risk_score, reasons, evidence}
        self.risk_by_bucket: dict[int, dict[str, dict]] = {}

    @property
    def is_loaded(self) -> bool:
        return len(self.entities) > 0

    def load(self, path: Path) -> None:
        """Load snapshot JSON and build runtime indices."""
        log.info(f"Loading data from {path}...")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.load_from_dict(data)

    def load_from_dict(self, data: dict) -> None:
        """Load snapshot from a dict and build runtime indices."""
        self.metadata = data["metadata"]
        self.entities = data["entities"]
        self.transactions = data["transactions"]
        self.bucket_index = data.get("bucket_index", {})
        self.entity_activity = data.get("entity_activity", {})
        self.n_buckets = self.metadata.get("n_buckets", 0)
        self.risk_by_bucket = {}

        self._build_indices()
        self._compute_risk()

        log.info(
            f"Loaded: {len(self.entities)} entities, "
            f"{len(self.transactions)} transactions, "
            f"{self.n_buckets} buckets"
        )

    def _build_indices(self) -> None:
        """Build fast-lookup indices from loaded data."""
        # Entity by ID
        self.entities_by_id = {e["id"]: e for e in self.entities}

        # Global adjacency (skip self-loops)
        self.adjacency = defaultdict(set)
        for tx in self.transactions:
            if tx["from_id"] != tx["to_id"]:
                self.adjacency[tx["from_id"]].add(tx["to_id"])
                self.adjacency[tx["to_id"]].add(tx["from_id"])

    def _compute_risk(self) -> None:
        """Precompute risk scores for all buckets."""
        bucket_size = self.metadata.get("bucket_size_seconds", 86400)
        for b in range(self.n_buckets):
            bucket_tx = self.get_bucket_transactions(b)
            self.risk_by_bucket[b] = compute_risk_for_bucket(bucket_tx, bucket_size)

        # Log risk distribution
        all_scores = [
            r["risk_score"]
            for bucket_risks in self.risk_by_bucket.values()
            for r in bucket_risks.values()
        ]
        if all_scores:
            nonzero = [s for s in all_scores if s > 0]
            log.info(
                f"Risk computed: {len(all_scores)} entity-buckets, "
                f"{len(nonzero)} with score > 0, "
                f"max={max(all_scores):.3f}"
            )

    def get_entity_risk(self, bucket: int, entity_id: str) -> dict:
        """Get risk data for an entity in a bucket."""
        bucket_risks = self.risk_by_bucket.get(bucket, {})
        return bucket_risks.get(entity_id, {
            "risk_score": 0.0,
            "reasons": [],
            "evidence": {},
        })

    def get_entity(self, entity_id: str) -> dict | None:
        return self.entities_by_id.get(entity_id)

    def get_bucket_transactions(self, bucket: int) -> list[dict]:
        indices = self.bucket_index.get(str(bucket), [])
        return [self.transactions[i] for i in indices]

    def get_bucket_entities(self, bucket: int) -> list[str]:
        """Get entity IDs active in a given bucket."""
        activity = self.entity_activity.get(str(bucket), {})
        return list(activity.keys())

    def get_entity_activity(self, bucket: int, entity_id: str) -> dict | None:
        return self.entity_activity.get(str(bucket), {}).get(entity_id)


# Singleton
store = DataStore()
