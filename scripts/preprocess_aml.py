#!/usr/bin/env python3
"""
Preprocess IBM AML dataset into ANGELA snapshot JSON.

Usage:
    python scripts/preprocess_aml.py --input data/raw/HI-Small_Trans.csv
    python scripts/preprocess_aml.py --input data/raw/HI-Small_Trans.csv --entities 500 --tx 5000
"""

import argparse
import csv
import hashlib
import json
import logging
import random
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

N_JURISDICTIONS = 8


def parse_timestamp(ts_str: str) -> int | None:
    """Parse timestamp string to epoch seconds (UTC)."""
    ts_str = ts_str.strip()
    for fmt in ("%Y/%m/%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(ts_str, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            continue
    return None


def make_entity_id(bank: str, account: str) -> str:
    """Create composite entity ID."""
    return f"{bank.strip()}_{account.strip()}"


def jurisdiction_bucket(entity_id: str, seed: int) -> int:
    """Deterministic jurisdiction assignment via hash."""
    h = hashlib.sha256(f"{seed}:{entity_id}".encode()).hexdigest()
    return int(h, 16) % N_JURISDICTIONS


def load_and_normalize(input_path: Path) -> list[dict]:
    """Load raw CSV and normalize into transaction dicts.

    Uses positional indexing because the raw CSV has duplicate 'Account' columns.
    Columns: 0=Timestamp, 1=From Bank, 2=Account(from), 3=To Bank, 4=Account(to),
             5=Amount Received, 6=Receiving Currency, 7=Amount Paid,
             8=Payment Currency, 9=Payment Format, 10=Is Laundering
    """
    transactions = []
    skipped = 0

    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for i, cols in enumerate(reader):
            if len(cols) < 11:
                skipped += 1
                continue

            ts_str = cols[0].strip()
            from_bank = cols[1].strip()
            from_acct = cols[2].strip()
            to_bank = cols[3].strip()
            to_acct = cols[4].strip()
            amount_str = cols[7].strip()
            currency = cols[8].strip()
            pay_fmt = cols[9].strip()
            label_str = cols[10].strip()

            # Validate required fields
            if not all([ts_str, from_bank, from_acct, to_bank, to_acct, amount_str]):
                skipped += 1
                continue

            timestamp = parse_timestamp(ts_str)
            if timestamp is None:
                skipped += 1
                continue

            try:
                amount = float(amount_str)
            except ValueError:
                skipped += 1
                continue

            try:
                is_laundering = int(float(label_str))
            except ValueError:
                is_laundering = 0

            transactions.append({
                "tx_id": f"tx_{i:06d}",
                "from_id": make_entity_id(from_bank, from_acct),
                "to_id": make_entity_id(to_bank, to_acct),
                "amount": round(amount, 2),
                "currency": currency or "USD",
                "timestamp": timestamp,
                "payment_format": pay_fmt,
                "is_laundering": is_laundering,
            })

    log.info(f"Loaded {len(transactions)} transactions ({skipped} skipped)")
    return transactions


def build_entities(transactions: list[dict], seed: int) -> list[dict]:
    """Build entity list from transaction participants."""
    entity_ids = set()
    entity_tx_counts: dict[str, int] = defaultdict(int)

    for tx in transactions:
        entity_ids.add(tx["from_id"])
        entity_ids.add(tx["to_id"])
        entity_tx_counts[tx["from_id"]] += 1
        entity_tx_counts[tx["to_id"]] += 1

    # Compute 90th percentile for KYC level
    counts = sorted(entity_tx_counts.values())
    p90_idx = int(len(counts) * 0.9)
    p90_threshold = counts[p90_idx] if counts else 0

    entities = []
    for eid in sorted(entity_ids):
        bank = eid.split("_")[0] if "_" in eid else "unknown"
        kyc = "enhanced" if entity_tx_counts[eid] >= p90_threshold else "standard"
        entities.append({
            "id": eid,
            "type": "account",
            "bank": bank,
            "jurisdiction_bucket": jurisdiction_bucket(eid, seed),
            "kyc_level": kyc,
        })

    log.info(f"Built {len(entities)} entities ({sum(1 for e in entities if e['kyc_level'] == 'enhanced')} enhanced KYC)")
    return entities


def sample_connected(
    transactions: list[dict],
    entities: list[dict],
    n_entities: int,
    n_tx: int,
    seed: int,
) -> tuple[list[dict], list[dict]]:
    """Sample a connected subgraph deterministically."""
    rng = random.Random(seed)

    entity_set = {e["id"] for e in entities}
    # Build adjacency from transactions (skip self-loops)
    adj: dict[str, set[str]] = defaultdict(set)
    for tx in transactions:
        if tx["from_id"] != tx["to_id"]:
            adj[tx["from_id"]].add(tx["to_id"])
            adj[tx["to_id"]].add(tx["from_id"])

    # Start from a high-degree node for better connectivity
    nodes_by_degree = sorted(adj.keys(), key=lambda n: len(adj[n]), reverse=True)
    # Pick from top 1% deterministically
    top_n = max(1, len(nodes_by_degree) // 100)
    start = nodes_by_degree[rng.randint(0, top_n - 1)] if nodes_by_degree else rng.choice(sorted(entity_set))
    selected = {start}
    frontier = [start]

    while len(selected) < n_entities and frontier:
        rng.shuffle(frontier)
        next_frontier = []
        for node in frontier:
            for neighbor in sorted(adj.get(node, set())):
                if neighbor not in selected:
                    selected.add(neighbor)
                    next_frontier.append(neighbor)
                    if len(selected) >= n_entities:
                        break
            if len(selected) >= n_entities:
                break
        frontier = next_frontier

    # Collect transactions between selected entities
    sampled_tx = []
    for tx in transactions:
        if tx["from_id"] in selected and tx["to_id"] in selected:
            sampled_tx.append(tx)

    # Cap transactions if needed
    if len(sampled_tx) > n_tx:
        rng.shuffle(sampled_tx)
        sampled_tx = sampled_tx[:n_tx]
        sampled_tx.sort(key=lambda t: t["timestamp"])

    # Re-derive entity set from sampled transactions
    final_entity_ids = set()
    for tx in sampled_tx:
        final_entity_ids.add(tx["from_id"])
        final_entity_ids.add(tx["to_id"])

    sampled_entities = [e for e in entities if e["id"] in final_entity_ids]

    # Re-index tx_ids
    for idx, tx in enumerate(sampled_tx):
        tx["tx_id"] = f"tx_{idx:06d}"

    log.info(f"Sampled {len(sampled_entities)} entities, {len(sampled_tx)} transactions")
    return sampled_entities, sampled_tx


def apply_buckets(
    transactions: list[dict], bucket_size: int
) -> tuple[int, dict[str, list[int]], dict[str, dict[str, dict]]]:
    """Assign bucket indices and build precomputed indices."""
    if not transactions:
        return 0, {}, {}

    t0 = min(tx["timestamp"] for tx in transactions)

    for tx in transactions:
        tx["bucket_index"] = (tx["timestamp"] - t0) // bucket_size

    n_buckets = max(tx["bucket_index"] for tx in transactions) + 1

    # Build bucket_index: bucket -> list of tx indices
    bucket_index: dict[str, list[int]] = defaultdict(list)
    for i, tx in enumerate(transactions):
        bucket_index[str(tx["bucket_index"])].append(i)

    # Build entity_activity: bucket -> entity -> aggregates
    entity_activity: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {
        "in_count": 0, "out_count": 0, "in_sum": 0.0, "out_sum": 0.0
    }))
    for tx in transactions:
        b = str(tx["bucket_index"])
        entity_activity[b][tx["from_id"]]["out_count"] += 1
        entity_activity[b][tx["from_id"]]["out_sum"] += tx["amount"]
        entity_activity[b][tx["to_id"]]["in_count"] += 1
        entity_activity[b][tx["to_id"]]["in_sum"] += tx["amount"]

    # Round sums
    for b in entity_activity:
        for eid in entity_activity[b]:
            entity_activity[b][eid]["in_sum"] = round(entity_activity[b][eid]["in_sum"], 2)
            entity_activity[b][eid]["out_sum"] = round(entity_activity[b][eid]["out_sum"], 2)

    log.info(f"Bucketed into {n_buckets} buckets (t0={t0}, size={bucket_size}s)")

    # Log bucket distribution
    sizes = [len(bucket_index.get(str(i), [])) for i in range(n_buckets)]
    if sizes:
        log.info(f"Bucket distribution: min={min(sizes)}, max={max(sizes)}, avg={sum(sizes)/len(sizes):.0f}")

    return t0, dict(bucket_index), {b: dict(v) for b, v in entity_activity.items()}


def write_snapshot(
    path: Path,
    entities: list[dict],
    transactions: list[dict],
    bucket_index: dict,
    entity_activity: dict,
    metadata: dict,
) -> None:
    """Write snapshot JSON file."""
    snapshot = {
        "metadata": metadata,
        "entities": entities,
        "transactions": transactions,
        "bucket_index": bucket_index,
        "entity_activity": entity_activity,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, separators=(",", ":"))
    size_mb = path.stat().st_size / (1024 * 1024)
    log.info(f"Wrote {path} ({size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser(description="Preprocess IBM AML data for ANGELA")
    parser.add_argument("--input", required=True, help="Path to raw CSV (e.g. HI-Small_Trans.csv)")
    parser.add_argument("--out_dir", default="data/processed", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for determinism")
    parser.add_argument("--entities", type=int, default=500, help="Target entity count for sample_small")
    parser.add_argument("--tx", type=int, default=5000, help="Target tx count for sample_small")
    parser.add_argument("--bucket_size", type=int, default=86400, help="Bucket size in seconds (default: 1 day)")
    args = parser.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.out_dir)

    if not input_path.exists():
        log.error(f"Input file not found: {input_path}")
        sys.exit(1)

    # Step 1: Load and normalize
    log.info(f"Loading {input_path}...")
    all_tx = load_and_normalize(input_path)
    if not all_tx:
        log.error("No valid transactions found")
        sys.exit(1)

    # Step 2: Build full entity list
    all_entities = build_entities(all_tx, args.seed)

    # Step 3: Create sample_small (connected subgraph)
    log.info(f"Sampling small: {args.entities} entities, {args.tx} tx...")
    small_entities, small_tx = sample_connected(
        all_tx, all_entities, args.entities, args.tx, args.seed
    )

    # Step 4: Create sample (larger demo set: 2k-5k entities)
    log.info("Sampling demo set: 3000 entities, 30000 tx...")
    demo_entities, demo_tx = sample_connected(
        all_tx, all_entities, 3000, 30000, args.seed + 1
    )

    # Step 5: Bucket both samples
    source_file = input_path.name

    # sample_small
    t0_small, bi_small, ea_small = apply_buckets(small_tx, args.bucket_size)
    n_buckets_small = max((tx["bucket_index"] for tx in small_tx), default=0) + 1
    write_snapshot(
        out_dir / "sample_small.json",
        small_entities, small_tx, bi_small, ea_small,
        {
            "seed": args.seed,
            "source_file": source_file,
            "n_entities": len(small_entities),
            "n_transactions": len(small_tx),
            "n_buckets": n_buckets_small,
            "bucket_size_seconds": args.bucket_size,
            "t0": t0_small,
            "sample_type": "small",
        },
    )

    # sample (demo)
    t0_demo, bi_demo, ea_demo = apply_buckets(demo_tx, args.bucket_size)
    n_buckets_demo = max((tx["bucket_index"] for tx in demo_tx), default=0) + 1
    write_snapshot(
        out_dir / "sample.json",
        demo_entities, demo_tx, bi_demo, ea_demo,
        {
            "seed": args.seed + 1,
            "source_file": source_file,
            "n_entities": len(demo_entities),
            "n_transactions": len(demo_tx),
            "n_buckets": n_buckets_demo,
            "bucket_size_seconds": args.bucket_size,
            "t0": t0_demo,
            "sample_type": "demo",
        },
    )

    # Validation
    log.info("--- Validation ---")
    for label, ents, txs in [("small", small_entities, small_tx), ("demo", demo_entities, demo_tx)]:
        eid_set = {e["id"] for e in ents}
        orphans = sum(1 for tx in txs if tx["from_id"] not in eid_set or tx["to_id"] not in eid_set)
        launder = sum(1 for tx in txs if tx["is_laundering"] == 1)
        log.info(f"  {label}: {len(ents)} entities, {len(txs)} tx, {launder} laundering, {orphans} orphan refs")

    log.info("Done!")


if __name__ == "__main__":
    main()
