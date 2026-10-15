"""Append-only audit trail: output/audit_trail.json, one JSON list that only ever grows.

Every agent loop step, delegation, run start/end and human decision is appended as it
happens, so a crash still leaves the steps that ran. The file is never wiped: if it ever
can't be parsed, it is moved aside (audit_trail.corrupt-<time>.json) and a new list starts.
"""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
from datetime import datetime, timezone

from backend.config import AUDIT_PATH
from backend.models import AuditEntry


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _read() -> list:
    if not AUDIT_PATH.exists() or AUDIT_PATH.stat().st_size == 0:
        return []
    try:
        data = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        AUDIT_PATH.rename(AUDIT_PATH.with_name(f"audit_trail.corrupt-{now().replace(':', '')}.json"))
        return []
    return data if isinstance(data, list) else [data]


def append_audit(entry: AuditEntry) -> None:
    """Add one record under an exclusive lock, then atomically replace the file."""
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_PATH.with_name("audit_trail.json.lock"), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            records = _read()
            records.append(entry.model_dump(mode="json", exclude_none=True, exclude_defaults=False))
            fd, tmp = tempfile.mkstemp(dir=AUDIT_PATH.parent, prefix=".audit_trail.", suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(records, f, indent=1, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, AUDIT_PATH)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
