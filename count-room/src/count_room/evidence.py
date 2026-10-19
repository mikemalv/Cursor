from __future__ import annotations

from count_room.types import Incident, PolicyDecision, RunResult, StageResult, TriageResult


def _stage(run: RunResult, stage_id: str) -> StageResult | None:
    return next((s for s in run.stages if s.id == stage_id), None)


def render_dossier(incident: Incident, triage: TriageResult, decision: PolicyDecision, run: RunResult) -> str:
    reviewers = ", ".join(decision.zone.actions.reviewers) or "regulatory-compliance"
    profile = _stage(run, "profiler")
    lineage = _stage(run, "lineage")
    return f"""# Change Control Dossier — {incident.id}

**Status: AUTOMATED REMEDIATION BLOCKED**

Execution: {run.mode}. Governance and impact are synthetic snapshots. No deployment.
The zone names represent this demo organization’s policy, not a legal interpretation.

| | |
|---|---|
| Incident | {incident.title} |
| Target object | `{decision.deciding_object}` |
| Zone | {decision.zone.id} — {decision.zone.label} |
| Authority | {decision.zone.authority} |
| Blocking tag | {_tag_cell(decision)} |
| Required reviewers | {reviewers} |

## Alert raised

An OPEN alert is saved in `ALERT.json` for the controller and regulatory-compliance owner.
Delivery is the local demo inbox; no external message was sent. The demo SQL is unchanged.

## Why this was not patched

{decision.zone.rationale}

{decision.explanation}

The fix agent was **never instantiated**. There is no prompt to jailbreak
because no writing agent was created.

## Root cause (advisory only)

{triage.hypothesis}

## Quantified impact

{profile.detail if profile else "n/a"}

## Blast radius

{lineage.detail if lineage else "n/a"}

## Proposed remediation (attachment, not a commit)

See `proposed-fix.sql` in this folder. It is a labeled fixture example, not SDK output. Applying it
requires change control and a restatement assessment — previously filed reports
may need amendment. That is a controller decision, not a diff.

## Re-certification checklist

- [ ] Impact assessment filed with regulatory compliance
- [ ] Restatement assessment: which filed periods, which dollar amounts
- [ ] Independent verification of the gaming-day boundary
- [ ] Approval recorded before any branch is created

## Audit

Every tool call and every SQL statement: `events.jsonl`.
"""


def render_evidence(incident: Incident, triage: TriageResult, decision: PolicyDecision, run: RunResult) -> str:
    reviewers = ", ".join(decision.zone.actions.reviewers) or "none"
    fix = _stage(run, "fix")
    clone = _stage(run, "clone")
    profile = _stage(run, "profiler")
    lineage = _stage(run, "lineage")
    privacy = _stage(run, "privacy-reviewer")
    return f"""# Evidence Package — {incident.id}

| | |
|---|---|
| Incident | {incident.title} |
| Target object | `{decision.deciding_object}` |
| Zone | {decision.zone.id} ({decision.zone.authority}) |
| Human approval required | {"YES" if decision.zone.actions.requires_human else "no"} |
| Reviews required | {decision.zone.actions.required_reviews} |
| Reviewers | {reviewers} |
| Execution mode | {run.mode} |
| Warehouse | Synthetic snapshots + executable local SQL checks |
| Patch passes local checks | {run.patch_verified} |
| Automatically applied in local demo | {"yes" if run.auto_remediated else "no"} |
| Applied file | {run.applied_path or "none"} |
| Production deployment | no |

## Final action

{_stage(run, "action").detail if _stage(run, "action") else "No action recorded."}

## Policy decision

{decision.explanation}

## Root cause

{triage.hypothesis}

## Profile

{profile.detail if profile else "n/a"}

## Proposed SQL change

{fix.detail if fix else "n/a"}

## Local SQL verification (synthetic test data; no Snowflake clone)

{clone.detail if clone else "n/a"}

## Lineage

{lineage.detail if lineage else "n/a"}

## Privacy review

{privacy.detail if privacy else "n/a"}

## Audit

`events.jsonl` — append-only trail of every tool call and SQL statement.
"""


def _tag_cell(decision: PolicyDecision) -> str:
    tag = decision.deciding_tag
    if tag is None:
        return f"lookup / fail-closed on `{decision.deciding_object}`"
    source = f" inherited from `{tag.inherited_from}`" if tag.inherited_from else ""
    return f"`{tag.name} = {tag.value}`{source}"
