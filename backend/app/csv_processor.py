"""Process uploaded CSV files into ANGELA snapshot format.

Supports two CSV formats:
1. IBM AML format (positional, 11+ columns)
2. Simple header-based format (Timestamp, From Bank, From Account, To Bank, To Account, Amount, ...)
"""

import csv
import hashlib
import io
import logging
from collections import defaultdict
from datetime import datetime, timezone

log = logging.getLogger(__name__)

N_JURISDICTIONS = 8
BUCKET_SIZE_SECONDS = 86400  # 1 day
SEED = 42

# Required headers for simple format
REQUIRED_HEADERS = {"timestamp", "from bank", "from account", "to bank", "to account", "amount"}

# IBM format has exactly these positional columns
IBM_MIN_COLS = 11


def parse_timestamp(ts_str: str) -> int | None:
    ts_str = ts_str.strip()
    for fmt in ("%Y/%m/%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(ts_str, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            continue
    return None


def make_entity_id(bank: str, account: str) -> str:
    return f"{bank.strip()}_{account.strip()}"


def jurisdiction_bucket(entity_id: str, seed: int) -> int:
    h = hashlib.sha256(f"{seed}:{entity_id}".encode()).hexdigest()
    return int(h, 16) % N_JURISDICTIONS


SMART_MATCH: dict[str, list[str]] = {
    "from_id": ["from account", "from_account", "from_id", "sender", "source", "originator", "from acct", "sender_id"],
    "to_id": ["to account", "to_account", "to_id", "receiver", "destination", "beneficiary", "to acct", "receiver_id"],
    "amount": ["amount", "value", "sum", "amt", "amount received", "amount paid"],
    "timestamp": ["timestamp", "date", "datetime", "time", "transaction_date", "tx_date", "created_at"],
    "from_bank": ["from bank", "from_bank", "sender_bank", "source_bank", "originator_bank"],
    "to_bank": ["to bank", "to_bank", "receiver_bank", "dest_bank", "beneficiary_bank"],
    "label": ["is laundering", "is_laundering", "label", "suspicious", "fraud", "is_fraud"],
    "currency": ["currency", "ccy", "cur"],
    "payment_format": ["payment format", "payment_format", "payment_type", "type", "method"],
}


def preview_csv(file_bytes: bytes, max_rows: int = 5) -> dict:
    """Read CSV header + sample rows and suggest column mappings."""
    text = file_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))

    try:
        header = next(reader)
    except StopIteration:
        raise ValueError("CSV file is empty")

    columns = [h.strip() for h in header]
    rows: list[list[str]] = []
    for i, cols in enumerate(reader):
        if i >= max_rows:
            break
        rows.append([c.strip() for c in cols])

    # Smart-match: for each target field, find best matching column
    suggested: dict[str, str | None] = {}
    for field, patterns in SMART_MATCH.items():
        match = None
        for col in columns:
            if col.strip().lower() in patterns:
                match = col
                break
        suggested[field] = match

    return {
        "columns": columns,
        "sample_rows": rows,
        "suggested_mapping": suggested,
        "row_count": len(rows),
    }


def _detect_format(header: list[str]) -> str:
    """Detect CSV format from header row."""
    normalized = {h.strip().lower() for h in header}
    if REQUIRED_HEADERS.issubset(normalized):
        return "simple"
    if len(header) >= IBM_MIN_COLS:
        return "ibm"
    raise ValueError(
        f"Unrecognized CSV format. Need either:\n"
        f"  - Headers: Timestamp, From Bank, From Account, To Bank, To Account, Amount\n"
        f"  - Or IBM AML format (11+ columns)\n"
        f"Got headers: {', '.join(header[:8])}"
    )


def _parse_ibm_row(cols: list[str], row_idx: int) -> dict | None:
    """Parse a row in IBM positional format."""
    if len(cols) < IBM_MIN_COLS:
        return None

    ts_str = cols[0].strip()
    from_bank = cols[1].strip()
    from_acct = cols[2].strip()
    to_bank = cols[3].strip()
    to_acct = cols[4].strip()
    amount_str = cols[7].strip()
    currency = cols[8].strip()
    pay_fmt = cols[9].strip()
    label_str = cols[10].strip()

    if not all([ts_str, from_bank, from_acct, to_bank, to_acct, amount_str]):
        return None

    timestamp = parse_timestamp(ts_str)
    if timestamp is None:
        return None

    try:
        amount = float(amount_str)
    except ValueError:
        return None

    try:
        is_laundering = int(float(label_str))
    except ValueError:
        is_laundering = 0

    return {
        "tx_id": f"tx_{row_idx:06d}",
        "from_id": make_entity_id(from_bank, from_acct),
        "to_id": make_entity_id(to_bank, to_acct),
        "amount": round(amount, 2),
        "currency": currency or "USD",
        "timestamp": timestamp,
        "payment_format": pay_fmt,
        "is_laundering": is_laundering,
    }


def _parse_simple_row(row: dict, row_idx: int) -> dict | None:
    """Parse a row using header-based column names."""
    # Normalize keys to lowercase
    r = {k.strip().lower(): v.strip() for k, v in row.items()}

    ts_str = r.get("timestamp", "")
    from_bank = r.get("from bank", "")
    from_acct = r.get("from account", "")
    to_bank = r.get("to bank", "")
    to_acct = r.get("to account", "")
    amount_str = r.get("amount", "")

    if not all([ts_str, from_bank, from_acct, to_bank, to_acct, amount_str]):
        return None

    timestamp = parse_timestamp(ts_str)
    if timestamp is None:
        return None

    try:
        amount = float(amount_str)
    except ValueError:
        return None

    try:
        is_laundering = int(float(r.get("is laundering", "0")))
    except ValueError:
        is_laundering = 0

    return {
        "tx_id": f"tx_{row_idx:06d}",
        "from_id": make_entity_id(from_bank, from_acct),
        "to_id": make_entity_id(to_bank, to_acct),
        "amount": round(amount, 2),
        "currency": r.get("currency", "USD") or "USD",
        "timestamp": timestamp,
        "payment_format": r.get("payment format", ""),
        "is_laundering": is_laundering,
    }


def _build_entities(transactions: list[dict], seed: int) -> list[dict]:
    """Build entity list from transaction participants."""
    entity_tx_counts: dict[str, int] = defaultdict(int)
    for tx in transactions:
        entity_tx_counts[tx["from_id"]] += 1
        entity_tx_counts[tx["to_id"]] += 1

    counts = sorted(entity_tx_counts.values())
    p90_idx = int(len(counts) * 0.9)
    p90_threshold = counts[p90_idx] if counts else 0

    entities = []
    for eid in sorted(entity_tx_counts.keys()):
        bank = eid.split("_")[0] if "_" in eid else "unknown"
        kyc = "enhanced" if entity_tx_counts[eid] >= p90_threshold else "standard"
        entities.append({
            "id": eid,
            "type": "account",
            "bank": bank,
            "jurisdiction_bucket": jurisdiction_bucket(eid, seed),
            "kyc_level": kyc,
        })

    return entities


def _apply_buckets(
    transactions: list[dict], bucket_size: int
) -> tuple[int, int, dict[str, list[int]], dict[str, dict[str, dict]]]:
    """Assign bucket indices and build precomputed indices."""
    if not transactions:
        return 0, 0, {}, {}

    t0 = min(tx["timestamp"] for tx in transactions)
    for tx in transactions:
        tx["bucket_index"] = (tx["timestamp"] - t0) // bucket_size

    n_buckets = max(tx["bucket_index"] for tx in transactions) + 1

    bucket_index: dict[str, list[int]] = defaultdict(list)
    for i, tx in enumerate(transactions):
        bucket_index[str(tx["bucket_index"])].append(i)

    entity_activity: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {
        "in_count": 0, "out_count": 0, "in_sum": 0.0, "out_sum": 0.0
    }))
    for tx in transactions:
        b = str(tx["bucket_index"])
        entity_activity[b][tx["from_id"]]["out_count"] += 1
        entity_activity[b][tx["from_id"]]["out_sum"] += tx["amount"]
        entity_activity[b][tx["to_id"]]["in_count"] += 1
        entity_activity[b][tx["to_id"]]["in_sum"] += tx["amount"]

    for b in entity_activity:
        for eid in entity_activity[b]:
            entity_activity[b][eid]["in_sum"] = round(entity_activity[b][eid]["in_sum"], 2)
            entity_activity[b][eid]["out_sum"] = round(entity_activity[b][eid]["out_sum"], 2)

    return t0, n_buckets, dict(bucket_index), {b: dict(v) for b, v in entity_activity.items()}


def process_csv(file_bytes: bytes, filename: str = "upload.csv") -> dict:
    """Process a CSV file into ANGELA snapshot format.

    Returns the same dict structure expected by DataStore.load_from_dict().
    Raises ValueError on invalid input.
    """
    text = file_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))

    # Read header
    try:
        header = next(reader)
    except StopIteration:
        raise ValueError("CSV file is empty")

    fmt = _detect_format(header)
    log.info(f"Detected CSV format: {fmt}")

    # Parse transactions
    transactions: list[dict] = []
    skipped = 0

    if fmt == "ibm":
        for i, cols in enumerate(reader):
            tx = _parse_ibm_row(cols, i)
            if tx:
                transactions.append(tx)
            else:
                skipped += 1
    else:
        # Re-read with DictReader
        dict_reader = csv.DictReader(io.StringIO(text))
        for i, row in enumerate(dict_reader):
            tx = _parse_simple_row(row, i)
            if tx:
                transactions.append(tx)
            else:
                skipped += 1

    if not transactions:
        raise ValueError(f"No valid transactions found ({skipped} rows skipped)")

    # Sort by timestamp
    transactions.sort(key=lambda t: t["timestamp"])

    # Re-index tx_ids after sort
    for idx, tx in enumerate(transactions):
        tx["tx_id"] = f"tx_{idx:06d}"

    log.info(f"Parsed {len(transactions)} transactions ({skipped} skipped)")

    # Build entities
    entities = _build_entities(transactions, SEED)

    # Apply bucketing
    t0, n_buckets, bucket_index, entity_activity = _apply_buckets(transactions, BUCKET_SIZE_SECONDS)

    metadata = {
        "seed": SEED,
        "source_file": filename,
        "n_entities": len(entities),
        "n_transactions": len(transactions),
        "n_buckets": n_buckets,
        "bucket_size_seconds": BUCKET_SIZE_SECONDS,
        "t0": t0,
        "sample_type": "upload",
    }

    log.info(f"Processed: {len(entities)} entities, {len(transactions)} tx, {n_buckets} buckets")

    return {
        "metadata": metadata,
        "entities": entities,
        "transactions": transactions,
        "bucket_index": bucket_index,
        "entity_activity": entity_activity,
    }


def process_csv_mapped(
    file_bytes: bytes,
    mapping: dict[str, str],
    filename: str = "upload.csv",
) -> dict:
    """Process CSV using explicit column mapping from the schema mapping step.

    mapping keys: from_id, to_id, amount, timestamp (required)
                  from_bank, to_bank, label, currency, payment_format (optional)
    mapping values: actual CSV column names
    """
    required = {"from_id", "to_id", "amount", "timestamp"}
    missing = required - set(mapping.keys())
    if missing:
        raise ValueError(f"Missing required mappings: {', '.join(sorted(missing))}")

    text = file_bytes.decode("utf-8", errors="replace")
    dict_reader = csv.DictReader(io.StringIO(text))

    transactions: list[dict] = []
    skipped = 0

    for i, row in enumerate(dict_reader):
        try:
            from_id_val = row[mapping["from_id"]].strip()
            to_id_val = row[mapping["to_id"]].strip()
            amount_str = row[mapping["amount"]].strip()
            ts_str = row[mapping["timestamp"]].strip()

            if not all([from_id_val, to_id_val, amount_str, ts_str]):
                skipped += 1
                continue

            timestamp = parse_timestamp(ts_str)
            if timestamp is None:
                skipped += 1
                continue

            amount = float(amount_str)

            # Build entity IDs: use bank prefix if mapped, otherwise raw ID
            from_bank = row.get(mapping.get("from_bank", ""), "").strip() if "from_bank" in mapping else ""
            to_bank = row.get(mapping.get("to_bank", ""), "").strip() if "to_bank" in mapping else ""

            from_id = make_entity_id(from_bank, from_id_val) if from_bank else from_id_val
            to_id = make_entity_id(to_bank, to_id_val) if to_bank else to_id_val

            is_laundering = 0
            if "label" in mapping and mapping["label"] in row:
                try:
                    is_laundering = int(float(row[mapping["label"]].strip()))
                except ValueError:
                    pass

            currency = "USD"
            if "currency" in mapping and mapping["currency"] in row:
                currency = row[mapping["currency"]].strip() or "USD"

            pay_fmt = ""
            if "payment_format" in mapping and mapping["payment_format"] in row:
                pay_fmt = row[mapping["payment_format"]].strip()

            transactions.append({
                "tx_id": f"tx_{i:06d}",
                "from_id": from_id,
                "to_id": to_id,
                "amount": round(amount, 2),
                "currency": currency,
                "timestamp": timestamp,
                "payment_format": pay_fmt,
                "is_laundering": is_laundering,
            })
        except (KeyError, ValueError):
            skipped += 1

    if not transactions:
        raise ValueError(f"No valid transactions found ({skipped} rows skipped)")

    transactions.sort(key=lambda t: t["timestamp"])
    for idx, tx in enumerate(transactions):
        tx["tx_id"] = f"tx_{idx:06d}"

    log.info(f"Mapped CSV: {len(transactions)} transactions ({skipped} skipped)")

    entities = _build_entities(transactions, SEED)
    t0, n_buckets, bucket_index, entity_activity = _apply_buckets(transactions, BUCKET_SIZE_SECONDS)

    return {
        "metadata": {
            "seed": SEED,
            "source_file": filename,
            "n_entities": len(entities),
            "n_transactions": len(transactions),
            "n_buckets": n_buckets,
            "bucket_size_seconds": BUCKET_SIZE_SECONDS,
            "t0": t0,
            "sample_type": "upload",
        },
        "entities": entities,
        "transactions": transactions,
        "bucket_index": bucket_index,
        "entity_activity": entity_activity,
    }
