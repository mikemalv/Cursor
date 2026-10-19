"""Deterministic policy gate.

No model call happens in this file and none ever should. The zone is a lookup
against warehouse governance tags (or the committed snapshot). A false negative
here misstates a filed number.
"""

from __future__ import annotations

from count_room.catalog import load_manifest, load_tags, object_for_file, tags_for
from count_room.types import ObjectVerdict, Policy, PolicyDecision, Tag, TriageResult, ZoneId

STRICTNESS: dict[str, int] = {"NGCB_MICS": 3, "RESTRICTED_PII": 2, "STANDARD": 1}

TAG_TO_ZONE: dict[tuple[str, str], ZoneId] = {
    ("GOVERNANCE.REGULATORY_SCOPE", "NGCB_MICS"): "NGCB_MICS",
    ("GOVERNANCE.DATA_CLASSIFICATION", "RESTRICTED_PII"): "RESTRICTED_PII",
}


class LookupFailed(Exception):
    """Tag snapshot or warehouse lookup could not resolve the object."""


# =====================================================================
# Tags on other objects in the same schema. Used so an untagged table in a
# regulated schema does not silently become STANDARD.
# =====================================================================
def _sibling_tags(object_name: str, schema: str, snapshot: dict) -> list[Tag]:
    prefix = schema + "."
    found: list[Tag] = []
    for name, rows in snapshot.get("objects", {}).items():
        if name == object_name or not name.startswith(prefix):
            continue
        found.extend(
            Tag(r["name"], r["value"], inherited_from=name) for r in (rows or [])
        )
    return found


# =====================================================================
# Map governance tags to a zone. NGCB_MICS beats RESTRICTED_PII beats STANDARD.
# No tag at all → STANDARD (safe to consider auto-patch).
# =====================================================================
def zone_from_tags(tags: list[Tag]) -> tuple[ZoneId, Tag | None]:
    winner: ZoneId = "STANDARD"
    deciding: Tag | None = None
    for tag in tags:
        zone = TAG_TO_ZONE.get((tag.name, tag.value))
        if zone and STRICTNESS[zone] > STRICTNESS[winner]:
            winner = zone
            deciding = tag
    return winner, deciding


# =====================================================================
# Look up one warehouse object (and its schema/database) in the tag snapshot
# and return the zone that object lives in. Fail-closed if the lookup is missing.
# =====================================================================
def resolve_object(object_name: str, snapshot: dict, policy: Policy) -> ObjectVerdict:
    parts = object_name.split(".")
    if len(parts) != 3:
        raise LookupFailed(f"object name must be DATABASE.SCHEMA.OBJECT, got {object_name!r}")
    database, schema_name, _ = parts
    schema = f"{database}.{schema_name}"

    try:
        object_tags = tags_for(object_name, snapshot, "objects")
        schema_tags = tags_for(schema, snapshot, "schemas")
        database_tags = tags_for(database, snapshot, "databases")
    except KeyError as exc:
        if policy.fail_closed_on_lookup_error:
            return ObjectVerdict(
                object_name=object_name,
                zone_id="NGCB_MICS",
                tags=(),
                deciding_tag=None,
                escalated_untagged_sibling=False,
                lookup_failed=True,
            )
        raise LookupFailed(str(exc)) from exc

    combined = list(object_tags) + [
        Tag(t.name, t.value, inherited_from=schema) for t in schema_tags
    ] + [
        Tag(t.name, t.value, inherited_from=database) for t in database_tags
    ]
    zone, deciding = zone_from_tags(combined)

    escalated = False
    if zone == "STANDARD" and policy.escalate_untagged_in_tagged_schema:
        sibling_tags = _sibling_tags(object_name, schema, snapshot)
        if schema_tags or sibling_tags:
            # Untagged object in a schema that already carries (or neighbors)
            # governance tags: do not default to safe-to-automate.
            escalated = True
            pool = schema_tags or sibling_tags
            zone = (
                "RESTRICTED_PII"
                if any(t.name == "GOVERNANCE.DATA_CLASSIFICATION" for t in pool)
                else "NGCB_MICS"
            )
            deciding = pool[0]

    return ObjectVerdict(
        object_name=object_name,
        zone_id=zone,
        tags=tuple(combined),
        deciding_tag=deciding,
        escalated_untagged_sibling=escalated,
        lookup_failed=False,
    )


# =====================================================================
# The gate: given triage suspects, pick the strictest zone among them.
# This is Python, not a model. Pipeline calls this before Agent 2 exists.
# =====================================================================
def decide(
    policy: Policy,
    triage: TriageResult,
    snapshot: dict | None = None,
    manifest: dict | None = None,
) -> PolicyDecision:
    if not triage.suspect_files and not triage.suspect_objects:
        raise ValueError("policy gate refuses to decide with no suspect files or objects")

    snapshot = snapshot if snapshot is not None else load_tags()
    manifest = manifest if manifest is not None else load_manifest()

    objects: list[str] = list(triage.suspect_objects)
    for path in triage.suspect_files:
        if path not in manifest:
            raise ValueError(f"Unmapped suspect file {path!r}; refusing to authorize a proposal")
        objects.append(object_for_file(path, manifest))
    if not objects:
        raise ValueError("suspect files are not in the manifest and no objects were named")

    # Preserve order, drop dupes.
    seen: list[str] = []
    for name in objects:
        if name not in seen:
            seen.append(name)

    verdicts = tuple(resolve_object(name, snapshot, policy) for name in seen)

    winner = verdicts[0]
    for v in verdicts[1:]:
        if STRICTNESS[v.zone_id] > STRICTNESS[winner.zone_id]:
            winner = v
        elif v.lookup_failed and not winner.lookup_failed:
            winner = v

    zone = policy.zones[winner.zone_id]
    low = triage.confidence < policy.escalate_if_confidence_below
    fail_closed = winner.lookup_failed or winner.escalated_untagged_sibling

    tag_clause = (
        f"lookup failed for {winner.object_name} — fail-closed to {zone.id}"
        if winner.lookup_failed
        else (
            f"tag {winner.deciding_tag.name}={winner.deciding_tag.value}"
            + (
                f" inherited from {winner.deciding_tag.inherited_from}"
                if winner.deciding_tag and winner.deciding_tag.inherited_from
                else f" on {winner.object_name}"
            )
            if winner.deciding_tag
            else f"no governance tag on {winner.object_name}, its schema, or its database"
        )
    )

    if zone.actions.may_patch:
        action = (
            f"Automated patching permitted; "
            f"{'human approval required' if zone.actions.requires_human else 'no human gate'}."
        )
    else:
        action = f"AUTOMATED PATCHING PROHIBITED. Output: {zone.actions.output}."

    extra = []
    if winner.escalated_untagged_sibling:
        extra.append("Untagged object sits in a schema that carries governance tags — escalated, not STANDARD.")
    if low:
        extra.append(
            f"Escalated: triage confidence {triage.confidence} below "
            f"{policy.escalate_if_confidence_below}."
        )

    explanation = (
        f"Incident {triage.incident_id} touches {len(verdicts)} object(s). "
        f"Governed by {zone.id} ({zone.authority}) because {tag_clause}. {action}"
        + ((" " + " ".join(extra)) if extra else "")
    )

    return PolicyDecision(
        incident_id=triage.incident_id,
        zone=zone,
        deciding_object=winner.object_name,
        deciding_tag=winner.deciding_tag,
        per_object=verdicts,
        escalated_for_low_confidence=low,
        fail_closed=fail_closed,
        explanation=explanation,
    )


# =====================================================================
# True only for STANDARD with a clean lookup: Python may write the verified
# patch into the demo workspace without a human in the loop.
# =====================================================================
def may_auto_remediate(decision: PolicyDecision) -> bool:
    return (
        decision.zone.actions.may_patch
        and not decision.zone.actions.requires_human
        and not decision.escalated_for_low_confidence
        and not decision.fail_closed
    )


# =====================================================================
# True if Agent 2 is allowed to exist at all. False for NGCB_MICS: no prompt,
# no jailbreak surface — the writing agent is never created.
# =====================================================================
def may_instantiate_fix(decision: PolicyDecision) -> bool:
    return decision.zone.actions.may_patch and not decision.fail_closed
