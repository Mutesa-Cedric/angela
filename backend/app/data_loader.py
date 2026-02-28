import json
import logging
from pathlib import Path
from collections import defaultdict

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

    def load(self, path: Path) -> None:
        """Load snapshot JSON and build runtime indices."""
        log.info(f"Loading data from {path}...")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.metadata = data["metadata"]
        self.entities = data["entities"]
        self.transactions = data["transactions"]
        self.bucket_index = data.get("bucket_index", {})
        self.entity_activity = data.get("entity_activity", {})
        self.n_buckets = self.metadata.get("n_buckets", 0)

        self._build_indices()

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
