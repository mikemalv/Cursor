from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ZoneId = Literal["STANDARD", "RESTRICTED_PII", "NGCB_MICS"]
OutputKind = Literal["pull_request", "evidence_package", "compliance_dossier"]


@dataclass(frozen=True)
class Tag:
    name: str
    value: str
    inherited_from: str | None = None


@dataclass(frozen=True)
class ZoneActions:
    may_patch: bool
    may_open_pr: bool
    requires_human: bool
    required_reviews: int
    output: OutputKind
    reviewers: tuple[str, ...] = ()
    mandatory_agents: tuple[str, ...] = ()


@dataclass(frozen=True)
class Zone:
    id: ZoneId
    label: str
    authority: str
    rationale: str
    actions: ZoneActions


@dataclass(frozen=True)
class Policy:
    version: int
    organization: str
    default_zone: ZoneId
    escalate_untagged_in_tagged_schema: bool
    fail_closed_on_lookup_error: bool
    escalate_if_confidence_below: float
    zones: dict[str, Zone]


@dataclass(frozen=True)
class Incident:
    id: str
    detected_at: str
    severity: str
    title: str
    body: str
    target_object: str
    sql_file: str
    expected_zone: ZoneId
    expected_suspect_files: tuple[str, ...] = ()


@dataclass(frozen=True)
class TriageResult:
    incident_id: str
    hypothesis: str
    suspect_files: tuple[str, ...]
    suspect_objects: tuple[str, ...]
    confidence: float
    blast_radius_hint: tuple[str, ...] = ()


@dataclass(frozen=True)
class ObjectVerdict:
    object_name: str
    zone_id: ZoneId
    tags: tuple[Tag, ...]
    deciding_tag: Tag | None
    escalated_untagged_sibling: bool
    lookup_failed: bool


@dataclass(frozen=True)
class PolicyDecision:
    incident_id: str
    zone: Zone
    deciding_object: str
    deciding_tag: Tag | None
    per_object: tuple[ObjectVerdict, ...]
    escalated_for_low_confidence: bool
    fail_closed: bool
    explanation: str


@dataclass
class StageResult:
    id: str
    ran: bool
    blocked: bool
    skipped: bool
    summary: str
    detail: str = ""


@dataclass
class RunResult:
    incident: Incident
    triage: TriageResult
    decision: PolicyDecision
    stages: list[StageResult] = field(default_factory=list)
    artifact_path: str = ""
    auto_remediated: bool = False
    mode: str = "fixture"
    patch_verified: bool = False
    applied_path: str = ""
    alert_path: str = ""
    action_scope: str = "local demo workspace"
