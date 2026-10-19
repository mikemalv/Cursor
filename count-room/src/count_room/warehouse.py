"""Read-only warehouse surface.

The analysis agents share exactly one capability: run a SELECT. No DML, no DDL,
no grants. Creating a clone is a write, so it is a separate identity the
triage/profiler agents do not hold.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from count_room.catalog import ROOT, load_queries

_COMMENT = re.compile(r"--[^\n]*|/\*.*?\*/", re.S)
_WRITE = re.compile(
    r"\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|"
    r"call|execute|copy|put|remove|undrop|swap|clone)\b",
    re.I,
)


class WarehouseDenied(ValueError):
    """Statement is not a single SELECT."""


def assert_select_only(sql: str) -> str:
    cleaned = _COMMENT.sub("", sql).strip()
    if not cleaned:
        raise WarehouseDenied("empty statement")
    if ";" in cleaned.rstrip(";"):
        raise WarehouseDenied("multiple statements are not allowed")
    head = cleaned.lstrip("(").lstrip().lower()
    if not (head.startswith("select") or head.startswith("with")):
        raise WarehouseDenied("only SELECT (or WITH … SELECT) is permitted")
    if _WRITE.search(cleaned):
        raise WarehouseDenied("statement contains a write keyword")
    return cleaned


class Warehouse:
    """Fixture-backed SELECT. Live Snowflake is a later swap behind the same method."""

    def __init__(self, queries: dict | None = None):
        self.queries = queries if queries is not None else load_queries()

    def select(self, sql: str, *, incident_id: str | None = None) -> dict:
        cleaned = assert_select_only(sql)
        key = _lookup_key(cleaned, incident_id)
        recorded = self.queries.get(key)
        if recorded is None:
            raise KeyError(
                f"no fixture for query {key!r}. "
                "Record it in fixtures/queries.json or pass a known profile/lineage SQL."
            )
        return {**recorded, "source": "synthetic snapshot", "sql_executed": False}

    def profile(self, incident_id: str) -> dict:
        return self.queries[f"{incident_id}.profile"]

    def lineage(self, incident_id: str) -> dict:
        return self.queries[f"{incident_id}.lineage"]

    def access_history(self, incident_id: str) -> dict | None:
        return self.queries.get(f"{incident_id}.access_history")

    def clone_verify(self, incident_id: str) -> dict | None:
        return self.queries.get(f"{incident_id}.clone")


def _lookup_key(sql: str, incident_id: str | None) -> str:
    lowered = " ".join(sql.lower().split())
    if "access_history" in lowered:
        return f"{incident_id or 'unknown'}.access_history"
    if "object_dependencies" in lowered:
        return f"{incident_id or 'unknown'}.lineage"
    if "nullif" in lowered or "proposed" in lowered:
        return f"{incident_id or 'unknown'}.clone"
    if incident_id:
        return f"{incident_id}.profile"
    return lowered


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def sql_root() -> Path:
    return ROOT
