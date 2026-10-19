"""Orchestrator: signal → triage → gate → fan-out → evidence.

The gate runs before any writing agent exists. Fixture mode is byte-stable and
needs no API key. Live mode uses the Cursor Python SDK against the same SQL
repo and the same warehouse tool.
"""

from __future__ import annotations

import json
import difflib
import hashlib
from dataclasses import replace
from count_room.verify import verify_sql

from count_room.audit import AuditLog
from count_room.catalog import ROOT, load_incident, load_policy, read_sql
from count_room.evidence import render_dossier, render_evidence
from count_room.gate import decide, may_auto_remediate, may_instantiate_fix
from count_room import report
from count_room.types import Incident, PolicyDecision, RunResult, StageResult, TriageResult
from count_room.warehouse import Warehouse

KNOWN_TRIAGE: dict[str, TriageResult] = {
    "roi": TriageResult(
        incident_id="roi",
        hypothesis=(
            "campaign_roi.sql divides sum(spend) by sum(impressions) with no nullif. "
            "Three campaigns have had zero impressions since a launch-config change "
            "on 2 September, so the nightly mart fails with division by zero."
        ),
        suspect_files=("sql/marts/marketing/campaign_roi.sql",),
        suspect_objects=("ANALYTICS.MARKETING.CAMPAIGN_ROI",),
        confidence=0.93,
        blast_radius_hint=("ANALYTICS.MARKETING.CAMPAIGN_DASHBOARD",),
    ),
    "pii": TriageResult(
        incident_id="pii",
        hypothesis=(
            "player_segments.sql uses SELECT *. A source table gained EMAIL and "
            "DATE_OF_BIRTH two days ago and both columns flowed into a mart the "
            "marketing analyst role can read."
        ),
        suspect_files=("sql/marts/player/player_segments.sql",),
        suspect_objects=("ANALYTICS.PLAYER.PLAYER_SEGMENTS",),
        confidence=0.91,
        blast_radius_hint=("ANALYTICS.PLAYER.PLAYER_LOOKALIKE",),
    ),
    "ggr": TriageResult(
        incident_id="ggr",
        hypothesis=(
            "daily_ggr.sql uses date_trunc('day', wager_ts). The property's gaming "
            "day runs 06:00 to 06:00, not midnight to midnight. Every wager between "
            "midnight and 6am has landed in the wrong gaming day for as long as the "
            "model has existed."
        ),
        suspect_files=("sql/marts/regulatory/daily_ggr.sql",),
        suspect_objects=("ANALYTICS.REGULATORY.DAILY_GROSS_GAMING_REVENUE",),
        confidence=0.88,
        blast_radius_hint=(
            "ANALYTICS.REGULATORY.NGCB_MONTHLY_REVENUE",
            "FINANCE.EXTERNAL.SLOT_RECON",
        ),
    ),
}


# =====================================================================
# Offline stand-in for Agent 1. Same structured diagnosis as live_triage, no API key.
# Used by `demo` without --live so the gate and apply path can still be walked.
# =====================================================================
def fixture_triage(incident: Incident) -> TriageResult:
    if incident.id not in KNOWN_TRIAGE:
        raise KeyError(f"no fixture triage for {incident.id}")
    return KNOWN_TRIAGE[incident.id]


# =====================================================================
# One row in the run record (signal / triage / gate / fix / clone / action).
# =====================================================================
def _stage(id_: str, *, ran=False, blocked=False, skipped=False, summary="", detail="") -> StageResult:
    return StageResult(
        id=id_, ran=ran, blocked=blocked, skipped=skipped, summary=summary, detail=detail
    )


# =====================================================================
# One incident, start to finish. Order is fixed: triage → gate → maybe fix →
# verify → apply or alert. Agents are imported only when mode="live".
# =====================================================================
def handle_incident(incident_id: str, *, mode: str = "fixture") -> RunResult:
    if mode not in {"fixture", "live"}:
        raise ValueError("mode must be fixture or live")
    incident = load_incident(incident_id)
    policy = load_policy()
    warehouse = Warehouse()
    audit = AuditLog(incident.id)
    audit.event("incident_received", "orchestrator", {"id": incident.id, "title": incident.title, "mode": mode})

    report.pause("triage")
    report.stage("triage" if mode == "live" else "triage_fixture", incident_id=incident.id)
    if mode == "live":
        from count_room.agents import live_triage

        # FIND: Cursor Agent 1 (agents.py live_triage → Agent.create / agent.send).
        triage = live_triage(incident, warehouse, audit)
    else:
        triage = fixture_triage(incident)
    audit.event("triage_result", "orchestrator", triage)
    report.say("triage", triage.hypothesis, tone="ok")
    report.pause("gate")
    report.stage("gate")

    # Never let model output omit the trusted incident target from authorization.
    triage = replace(triage, incident_id=incident.id,
        suspect_files=tuple(dict.fromkeys((incident.sql_file, *triage.suspect_files))),
        suspect_objects=tuple(dict.fromkeys((incident.target_object, *triage.suspect_objects))))
    decision = decide(policy, triage)
    audit.event("policy_decision", "policy-gate", decision.explanation)
    gate_tone = {"STANDARD": "ok", "RESTRICTED_PII": "warn", "NGCB_MICS": "bad"}.get(decision.zone.id)
    report.say("gate", report.gate_brief(decision), tone=gate_tone)
    report.pause("fix")

    run = RunResult(incident=incident, triage=triage, decision=decision, mode=mode)
    run.stages.append(
        _stage(
            "signal",
            ran=True,
            summary=incident.title,
            detail=incident.body,
        )
    )
    run.stages.append(
        _stage("triage", ran=True, summary=triage.hypothesis, detail=triage.hypothesis)
    )
    run.stages.append(
        _stage("gate", ran=True, summary=decision.zone.id, detail=decision.explanation)
    )

    run.stages.append(_run_profiler(incident, warehouse, audit))
    run.stages.extend(_run_fix_and_clone(incident, decision, warehouse, audit, mode))
    run.stages.append(_run_lineage(incident, warehouse, audit))
    if decision.zone.id == "RESTRICTED_PII":
        run.stages.append(_run_privacy_review(incident, warehouse, audit))

    run.patch_verified = any(s.id == "clone" and s.summary == "PASS — local SQL checks" for s in run.stages)
    report.pause("apply")
    _apply_or_alert(run, audit)
    if decision.zone.actions.output == "compliance_dossier":
        path = audit.artifact("DOSSIER.md", render_dossier(incident, triage, decision, run))
        proposed = ROOT / "fixtures" / "patches" / f"{incident.id}.sql"
        if proposed.exists():
            audit.artifact("proposed-fix.sql", proposed.read_text())
        run.artifact_path = str(path)
    else:
        path = audit.artifact("EVIDENCE.md", render_evidence(incident, triage, decision, run))
        run.artifact_path = str(path)

    audit.artifact("result.json", json.dumps({
        "mode": mode, "sdk_executed": mode == "live", "warehouse": "synthetic / snapshots",
        "patch_verified": run.patch_verified, "deployed": False,
        "auto_applied_locally": run.auto_remediated, "applied_path": run.applied_path,
        "alert_path": run.alert_path, "action_scope": run.action_scope,
    }, indent=2))
    audit.event("assemble", "orchestrator", {"output": decision.zone.actions.output, "path": run.artifact_path})
    return run


# =====================================================================
# Last step: write verified SQL into this run's demo workspace, or leave it
# unchanged and open ALERT.json. Never deploys to production.
# =====================================================================
def _apply_or_alert(run: RunResult, audit: AuditLog) -> None:
    incident = run.incident
    workspace = audit.dir / "workspace"
    target = workspace / incident.sql_file
    target.parent.mkdir(parents=True, exist_ok=True)
    original = read_sql(incident.sql_file)
    target.write_text(original)
    if run.patch_verified and may_auto_remediate(run.decision):
        proposed = (audit.dir / "proposed.sql").read_text()
        # Recheck exactly what will be applied, not a success flag from a model.
        if not verify_sql(incident.id, proposed)["passed"]:
            raise RuntimeError("pre-apply verification failed; demo SQL left unchanged")
        staged = target.with_suffix(".pending")
        staged.write_text(proposed)
        staged.replace(target)
        applied = target.read_text()
        if applied != proposed:
            raise RuntimeError("applied SQL differs from verified proposal")
        run.auto_remediated = True
        run.applied_path = str(target)
        audit.artifact("applied.sql", applied)
        receipt = {"status": "APPLIED", "scope": run.action_scope, "path": str(target),
                   "before_sha256": hashlib.sha256(original.encode()).hexdigest(),
                   "after_sha256": hashlib.sha256(applied.encode()).hexdigest(),
                   "production_deployed": False}
        audit.artifact("APPLIED.json", json.dumps(receipt, indent=2))
        audit.event("auto_applied", "orchestrator", receipt)
        report.stage("action_apply")
        report.say("action", "FIX APPLIED  ·  local demo only", tone="ok")
        run.stages.append(_stage("action", ran=True, summary="FIX APPLIED — local demo workspace",
            detail=f"Verified SQL automatically replaced {target}. Production is unchanged."))
    else:
        alert = {"status": "OPEN", "incident": incident.id,
                 "reason": run.decision.explanation if not run.decision.zone.actions.may_patch else "Automatic application withheld: verification or review requirements not satisfied.",
                 "owners": list(run.decision.zone.actions.reviewers) or ["data-platform-on-call"],
                 "delivery": "local demo inbox", "external_message_sent": False,
                 "sql_unchanged": target.read_text() == original,
                 "required_action": "Controller and compliance review before any change" if incident.id == "ggr" else "Review the failed checks and approval requirements"}
        run.alert_path = str(audit.artifact("ALERT.json", json.dumps(alert, indent=2)))
        audit.event("alert_raised", "orchestrator", alert)
        report.stage("action_alert")
        report.say(
            "action",
            f"ALERT OPEN  ·  SQL unchanged  ·  {', '.join(alert['owners'])}",
            tone="bad" if run.decision.zone.id == "NGCB_MICS" else "warn",
        )
        run.stages.append(_stage("action", ran=True, summary="ALERT OPEN — change not applied",
            detail=json.dumps(alert, indent=2)))


# =====================================================================
# Attach a canned profile (and access history if any) so the dossier shows
# "what was happening" without a live warehouse query.
# =====================================================================
def _run_profiler(incident: Incident, warehouse: Warehouse, audit: AuditLog) -> StageResult:
    profile = warehouse.profile(incident.id)
    audit.event("sql", "profiler", {"key": f"{incident.id}.profile", "sql": profile.get("sql")})
    detail = profile["summary"]
    access = warehouse.access_history(incident.id)
    if access:
        audit.event("sql", "profiler", {"key": f"{incident.id}.access_history"})
        detail += "\n\n" + access["summary"]
    return _stage("profiler", ran=True, summary="profile snapshot (example data)", detail="SNAPSHOT — synthetic scenario facts, not a live warehouse query.\n" + detail)


# =====================================================================
# The branch the demo is about: create Agent 2 only if the gate allows a patch;
# otherwise skip clone and return "fix agent never instantiated".
# =====================================================================
def _run_fix_and_clone(
    incident: Incident,
    decision: PolicyDecision,
    warehouse: Warehouse,
    audit: AuditLog,
    mode: str,
) -> list[StageResult]:
    if not may_instantiate_fix(decision):
        # STOP: no second Agent.create. Diagnosis exists; a writing agent does not.
        audit.event("fix_blocked", "orchestrator", {"zone": decision.zone.id})
        report.stage("fix_blocked")
        report.say("fix", f"NEVER CREATED  ·  {decision.zone.id} may_patch=false", tone="bad")
        return [
            _stage(
                "fix",
                blocked=True,
                summary="fix agent never instantiated",
                detail=(
                    f"Zone {decision.zone.id} sets may_patch=false. "
                    "No writing agent was created."
                ),
            ),
            _stage("clone", skipped=True, summary="no diff to verify"),
        ]

    if mode == "live":
        from count_room.agents import live_fix
        # FIX: Cursor Agent 2 (agents.py live_fix → Agent.create / emit_patch).
        report.stage("fix")
        proposed = live_fix(incident, decision, audit)
    else:
        report.stage("fix_fixture", incident_id=incident.id)
        proposed = (ROOT / "fixtures" / "patches" / f"{incident.id}.sql").read_text()

    original = read_sql(incident.sql_file)
    audit.artifact("original.sql", original)
    audit.artifact("proposed.sql", proposed)
    diff = "".join(difflib.unified_diff(original.splitlines(True), proposed.splitlines(True), fromfile=incident.sql_file, tofile="proposed.sql"))
    audit.artifact("patch.diff", diff)
    audit.event("fix_proposed", "fix", {"file": incident.sql_file, "source": "cursor-sdk" if mode == "live" else "fixture"})
    verification = {"before": verify_sql(incident.id, original), "after": verify_sql(incident.id, proposed)}
    audit.artifact("verification.json", json.dumps(verification, indent=2, default=str))
    audit.event("verification", "local-verifier", verification)
    passed = verification["after"]["passed"]
    report.stage("verify")
    report.say("verify", "PASS" if passed else "FAIL  ·  will not apply", tone="ok" if passed else "bad")
    return [
        _stage("fix", ran=True, summary="SQL proposal saved", detail=f"Proposal source: {mode}. Source repo unchanged.\n\n{diff}"),
        _stage("clone", ran=True, blocked=not passed,
               summary="PASS — local SQL checks" if passed else "FAIL — local SQL checks",
               detail="Real execution on synthetic test data; no Snowflake clone.\n" + json.dumps(verification, indent=2, default=str)),
    ]


# =====================================================================
# Attach a canned lineage snapshot: which objects sit downstream of this model.
# =====================================================================
def _run_lineage(incident: Incident, warehouse: Warehouse, audit: AuditLog) -> StageResult:
    lineage = warehouse.lineage(incident.id)
    audit.event("sql", "lineage", {"key": f"{incident.id}.lineage"})
    return _stage("lineage", ran=True, summary="lineage snapshot", detail="SNAPSHOT — synthetic scenario facts.\n" + lineage["summary"])


# =====================================================================
# RESTRICTED_PII only: a deterministic FAIL. The SQL change does not un-leak
# already-materialized columns, so auto-apply still requires humans.
# =====================================================================
def _run_privacy_review(incident: Incident, warehouse: Warehouse, audit: AuditLog) -> StageResult:
    access = warehouse.access_history(incident.id)
    lineage = warehouse.lineage(incident.id)
    detail = (
        "VERDICT: FAIL (deterministic rule over synthetic exposure snapshot)\n\n"
        "The code fix drops EMAIL and DATE_OF_BIRTH from the model. It does not "
        "remove rows already materialized in PLAYER_SEGMENTS, and OBJECT_DEPENDENCIES "
        "shows the same columns flowing into PLAYER_LOOKALIKE — a hand-created view "
        "that was not in the SQL repo.\n\n"
        f"{(access or {}).get('summary', '')}\n\n{(lineage or {}).get('summary', '')}"
    )
    audit.event("privacy_review", "privacy-reviewer", {"verdict": "FAIL"})
    return _stage("privacy-reviewer", ran=True, summary="VERDICT: FAIL", detail=detail)
