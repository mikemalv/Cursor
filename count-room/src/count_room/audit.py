from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from uuid import uuid4
from datetime import datetime, timezone
from pathlib import Path

from count_room.catalog import ROOT


class AuditLog:
    """Append-only trail. In a regulated environment this is the deliverable."""

    def __init__(self, incident_id: str, root: Path | None = None):
        self.dir = (root or ROOT / "runs") / incident_id / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid4().hex[:8])
        self.dir.mkdir(parents=True, exist_ok=True)
        self.tokens = {"input": 0, "output": 0}

    def event(self, kind: str, agent_id: str, payload) -> None:
        line = json.dumps(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "kind": kind,
                "agentId": agent_id,
                "payload": payload,
            },
            default=str,
        )
        with (self.dir / "events.jsonl").open("a") as fh:
            fh.write(line + "\n")

    def sdk_event(self, agent_id: str, message) -> None:
        usage = getattr(message, "usage", None)
        if usage is not None:
            self.tokens["input"] += getattr(usage, "input_tokens", 0) or 0
            self.tokens["output"] += getattr(usage, "output_tokens", 0) or 0
        self.event(getattr(message, "type", "unknown"), agent_id, _as_payload(message))

    def artifact(self, name: str, contents: str) -> Path:
        path = self.dir / name
        path.write_text(contents)
        return path

    def cost(self) -> dict:
        return {**self.tokens, "estimatedUsd": None}


def _as_payload(message) -> dict:
    if is_dataclass(message):
        return asdict(message)
    if hasattr(message, "model_dump"):
        return message.model_dump(mode="json")
    if hasattr(message, "__dict__"):
        return vars(message)
    return {"repr": repr(message)}
