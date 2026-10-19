from __future__ import annotations

import json
from pathlib import Path

import yaml

from count_room.types import Incident, Policy, Tag, Zone, ZoneActions

ROOT = Path(__file__).resolve().parents[2]


def load_policy(path: Path | None = None) -> Policy:
    raw = yaml.safe_load((path or ROOT / "policy.yaml").read_text())
    zones = {}
    for zone_id, z in raw["zones"].items():
        a = z["actions"]
        zones[zone_id] = Zone(
            id=zone_id,
            label=z["label"],
            authority=z["authority"],
            rationale=z["rationale"].strip(),
            actions=ZoneActions(
                may_patch=a["may_patch"],
                may_open_pr=a["may_open_pr"],
                requires_human=a["requires_human"],
                required_reviews=a.get("required_reviews", 0),
                output=a["output"],
                reviewers=tuple(a.get("reviewers") or []),
                mandatory_agents=tuple(a.get("mandatory_agents") or []),
            ),
        )
    return Policy(
        version=raw["version"],
        organization=raw["organization"],
        default_zone=raw["default_zone"],
        escalate_untagged_in_tagged_schema=raw["escalate_untagged_in_tagged_schema"],
        fail_closed_on_lookup_error=raw["fail_closed_on_lookup_error"],
        escalate_if_confidence_below=raw["escalate_if_confidence_below"],
        zones=zones,
    )


def load_manifest(path: Path | None = None) -> dict:
    return json.loads((path or ROOT / "manifest.json").read_text())


def load_tags(path: Path | None = None) -> dict:
    return json.loads((path or ROOT / "fixtures" / "tags.json").read_text())


def load_queries(path: Path | None = None) -> dict:
    return json.loads((path or ROOT / "fixtures" / "queries.json").read_text())


def load_incident(incident_id: str, path: Path | None = None) -> Incident:
    raw = json.loads((path or ROOT / "fixtures" / "incidents" / f"{incident_id}.json").read_text())
    return Incident(
        id=raw["id"],
        detected_at=raw["detectedAt"],
        severity=raw["severity"],
        title=raw["title"],
        body=raw["body"],
        target_object=raw["targetObject"],
        sql_file=raw["sqlFile"],
        expected_zone=raw["expectedZone"],
        expected_suspect_files=tuple(raw.get("expectedSuspectFiles") or [raw["sqlFile"]]),
    )


def list_incident_ids() -> list[str]:
    return sorted(p.stem for p in (ROOT / "fixtures" / "incidents").glob("*.json"))


def object_for_file(sql_file: str, manifest: dict | None = None) -> str:
    entry = (manifest or load_manifest()).get(sql_file)
    if not entry:
        raise KeyError(f"manifest has no entry for {sql_file}")
    return entry["object"]


def tags_for(name: str, snapshot: dict, kind: str) -> list[Tag]:
    rows = snapshot.get(kind, {}).get(name)
    if rows is None:
        raise KeyError(f"{kind} snapshot missing {name}")
    return [Tag(name=r["name"], value=r["value"], inherited_from=r.get("inherited_from")) for r in rows]


def read_sql(sql_file: str) -> str:
    return (ROOT / sql_file).read_text()
