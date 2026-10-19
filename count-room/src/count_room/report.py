"""Terminal pipeline view for one or both incidents."""

from __future__ import annotations

import json
import os
import sys
import textwrap
from pathlib import Path

from count_room.catalog import ROOT
from count_room.types import Incident, PolicyDecision, RunResult

_stepping = False
_scene: dict | None = None
_last_stage: str | None = None

CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

SCENES = {
    "roi": {
        "letter": "A",
        "lane": "Marketing",
        "path": "AUTO-FIX",
        "promise": "Diagnose → patch → verify → apply locally",
        "accent": GREEN,
    },
    "ggr": {
        "letter": "B",
        "lane": "Regulated revenue",
        "path": "STOP + ALERT",
        "promise": "Diagnose only. Policy forbids a writing agent",
        "accent": RED,
    },
    "pii": {
        "letter": "C",
        "lane": "Restricted PII",
        "path": "REVIEW",
        "promise": "Propose a fix, fail privacy review, require humans",
        "accent": YELLOW,
    },
}

GATE_BRIEF = {
    "STANDARD": "no governance tag  ·  automated patch allowed",
    "RESTRICTED_PII": "PII tag  ·  patch + human review",
    "NGCB_MICS": "regulated  ·  patch forbidden  ·  no fix agent",
}

# One-line “what this stage does” shown in the terminal demo.
STAGES = {
    "alert": (
        "Incoming incident JSON. Title, SQL path, and target object start the run.",
        "fixtures/incidents/{id}.json  ·  not events.jsonl",
    ),
    "triage": (
        "Diagnose the broken SQL. Do not patch.",
        "Agent 1: create → send SQL+alert → emit_triage  ·  agents.py",
    ),
    "triage_fixture": (
        "Diagnose the broken SQL. Do not patch.",
        "Fixture diagnosis (same fields as emit_triage). No SDK call.",
    ),
    "gate": (
        "Python only. Look up warehouse tags. Decide if a writing agent may exist.",
        "gate.decide() → may_instantiate_fix()  ·  gate.py  ·  no model",
    ),
    "fix": (
        "Propose replacement SQL. Agent 2 has read + emit_patch, no write tools.",
        "Agent 2: create → send broken SQL → emit_patch  ·  agents.py",
    ),
    "fix_fixture": (
        "Propose replacement SQL from a recorded patch. Still verified by Python.",
        "fixtures/patches/{id}.sql  ·  no SDK call",
    ),
    "fix_blocked": (
        "Stop. Diagnosis exists; a patching agent does not.",
        "may_instantiate_fix is false  ·  live_fix() never called  ·  pipeline.py",
    ),
    "verify": (
        "Run original vs proposed SQL on synthetic data. Python, not the model.",
        "verify_sql()  ·  local checks  ·  a PASS from the agent is not enough",
    ),
    "action_apply": (
        "Checks passed and zone is STANDARD. Write SQL in this run’s demo workspace only.",
        "may_auto_remediate  ·  production is unchanged",
    ),
    "action_alert": (
        "Leave the SQL unchanged. Open a local owner alert.",
        "ALERT.json  ·  no deploy  ·  no second agent if the gate forbade it",
    ),
}


def enable_stepping(on: bool) -> None:
    """Wait for Enter between stages. Off when not a TTY, in pytest, or --no-step."""
    global _stepping
    if os.environ.get("COUNTROOM_NO_STEP") or os.environ.get("PYTEST_CURRENT_TEST"):
        _stepping = False
        return
    _stepping = bool(on) and sys.stdin.isatty() and sys.stdout.isatty()


def pause(next_step: str = "") -> None:
    if not _stepping:
        return
    tag = _tag()
    nxt = f"next: {next_step}" if next_step else "continue"
    print(color(DIM, f"  {tag}  ▸  enter  {nxt}          q quit"), end="", flush=True)
    try:
        reply = input()
    except EOFError:
        print()
        return
    if reply.strip().lower() in {"q", "quit"}:
        raise SystemExit(0)


def color(code: str, text: str) -> str:
    if not sys.stdout.isatty():
        return text
    return f"{code}{text}{RESET}"


def stage(name: str, *, incident_id: str = "") -> None:
    """Print the stage label plus a two-line snippet of exactly what it does."""
    global _last_stage
    label = name.split("_")[0].upper()
    _last_stage = label
    what, how = STAGES[name]
    how = how.replace("{id}", incident_id)
    print(f"  {color(_accent(), _tag())}  {color(BOLD, label)}")
    for line in _wrap(what):
        print(f"         {line}")
    print(color(DIM, f"         {how}"))
    print()


def say(actor: str, msg: str, *, tone: str | None = None) -> None:
    global _last_stage
    tint = {"ok": GREEN, "warn": YELLOW, "bad": RED, "dim": DIM}.get(tone or "", "")
    label = actor.upper()
    if _last_stage != label:
        print(f"  {color(_accent(), _tag())}  {color(CYAN, label)}")
        _last_stage = label
    for line in _wrap(msg):
        print(f"         {color(tint, line) if tint else line}", flush=True)
    print()


def detail(msg: str, *, tone: str | None = None) -> None:
    tint = {"ok": GREEN, "warn": YELLOW, "bad": RED, "dim": DIM}.get(tone or "", "")
    print(f"         {color(tint, msg) if tint else msg}", flush=True)


BANNER = """\
                 *
                /|\\
               / | \\
              /  |  \\
             /___|___\\
                |||
               / | \\
              *  *  *

     SPACEX   /   CURSOR SDK
"""


def header(*, live: bool, count: int) -> None:
    mode = "live Cursor agents" if live else "fixture"
    extra = "  ·  Enter steps each stage, q quits" if _stepping else ""
    print()
    print(color(CYAN, BANNER.rstrip("\n")))
    print()
    print(color(BOLD, "  COUNT ROOM"))
    print(color(DIM, f"  {count} scenarios  ·  {mode}{extra}"))
    print()
    print(f"  {color(GREEN, 'A')}  Marketing            {color(GREEN, 'AUTO-FIX')}     patch when checks pass")
    print(f"  {color(RED, 'B')}  Regulated revenue    {color(RED, 'STOP + ALERT')}  diagnose, then refuse")
    print()


def open_incident(incident: Incident, index: int, total: int) -> None:
    global _scene
    _scene = dict(SCENES.get(incident.id, {"letter": str(index), "lane": incident.id, "path": "", "promise": "", "accent": CYAN}))
    _scene["id"] = incident.id
    accent = _accent()
    print(color(accent, "  " + "━" * 62))
    print(
        color(BOLD, f"  {index}/{total}  {incident.id}  ·  {_scene['lane']}")
        + "    "
        + color(accent, _scene["path"])
    )
    print(color(DIM, f"  {_scene['promise']}"))
    print(color(accent, "  " + "━" * 62))
    print()
    print(color(YELLOW, "  ALERT") + color(DIM, f"  {incident.severity}  ·  {incident.detected_at}"))
    print(f"  {incident.title}")
    what, how = STAGES["alert"]
    print(color(DIM, f"         {what}"))
    print(color(DIM, f"         {how.replace('{id}', incident.id)}"))
    print()
    for line in _wrap(incident.body):
        print(f"  {line}")
    print()
    print(color(DIM, f"  {incident.target_object}"))
    print(color(DIM, f"  {incident.sql_file}"))
    print()


def recap(run: RunResult) -> None:
    diffs = _diff_hits(run)
    if diffs:
        print(color(DIM, f"  {_tag()}  CHANGE"))
        for change in diffs:
            print(f"         {change}")
        print()
    checks = _checks(run)
    if checks:
        bits = []
        for name, ok in checks:
            mark = color(GREEN, "pass") if ok else color(RED, "fail")
            bits.append(f"{mark} {_short_check(name)}")
        print(f"  {color(DIM, _tag() + '  CHECKS')}  " + "  ·  ".join(bits))
        print()
    if run.applied_path:
        print(color(DIM, f"         wrote    {_rel(run.applied_path)}"))
    if run.alert_path:
        owners = _alert_owners(run)
        who = f"  ·  {', '.join(owners)}" if owners else ""
        print(color(YELLOW, f"         inbox    {_rel(run.alert_path)}{who}"))
    print(color(DIM, f"         receipt  {_rel(run.artifact_path)}"))
    print()
    if run.auto_remediated:
        print(color(GREEN, f"  {_tag()}  OUTCOME  FIX APPLIED  ·  local demo only"))
    elif _stage(run, "fix") and _stage(run, "fix").blocked:
        print(color(RED, f"  {_tag()}  OUTCOME  STOPPED  ·  no fix agent  ·  owner alert"))
    else:
        print(color(YELLOW, f"  {_tag()}  OUTCOME  ALERT  ·  not applied"))
    print()


def summary(runs: list[RunResult]) -> None:
    print(color(DIM, "  " + "━" * 62))
    print(color(BOLD, "  SUMMARY"))
    print()
    for run in runs:
        scene = SCENES.get(run.incident.id, {})
        letter = scene.get("letter", "?")
        lane = scene.get("lane", run.incident.id)
        accent = scene.get("accent", CYAN)
        d = run.decision
        if run.auto_remediated:
            outcome = color(GREEN, "FIX APPLIED")
        elif _stage(run, "fix") and _stage(run, "fix").blocked:
            outcome = color(RED, "STOPPED  ·  no fix agent")
        else:
            outcome = color(YELLOW, "ALERT  ·  not applied")
        print(f"  {color(accent, letter)}  {run.incident.id:<6} {lane:<22} {color(accent, f'{d.zone.id:<12}')} {outcome}")
    print()
    print(color(DIM, "  Same pipeline. Different authority to write."))
    print()


def gate_brief(decision: PolicyDecision) -> str:
    return f"{decision.zone.id}  ·  {GATE_BRIEF.get(decision.zone.id, decision.zone.authority)}"


def _tag() -> str:
    if not _scene:
        return "·"
    return _scene["letter"]


def _accent() -> str:
    if not _scene:
        return CYAN
    return _scene["accent"]


def _wrap(text: str, width: int = 68) -> list[str]:
    return textwrap.wrap(text, width=width) or [""]


def _rel(path: str) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT.resolve()))
    except ValueError:
        return path


def _short_check(name: str) -> str:
    if name.startswith("Output contract"):
        return "output contract"
    if "zero/missing" in name or "denominator" in name:
        return "zero denom → NULL"
    if "infinite" in name or "NaN" in name:
        return "no inf/NaN"
    return _clip(name, 36)


def _stage(run: RunResult, stage_id: str):
    return next((s for s in run.stages if s.id == stage_id), None)


def _checks(run: RunResult) -> list[tuple[str, bool]]:
    path = Path(run.artifact_path).parent / "verification.json"
    if not path.is_file():
        return []
    after = json.loads(path.read_text()).get("after") or {}
    return [(c["name"], bool(c["passed"])) for c in after.get("checks") or []]


def _alert_owners(run: RunResult) -> list[str]:
    if not run.alert_path:
        return []
    path = Path(run.alert_path)
    if not path.is_file():
        return []
    return list(json.loads(path.read_text()).get("owners") or [])


def _diff_hits(run: RunResult) -> list[str]:
    path = Path(run.artifact_path).parent / "patch.diff"
    if not path.is_file():
        return []
    removed, added = [], []
    for raw in path.read_text().splitlines():
        if raw.startswith("---") or raw.startswith("+++") or raw.startswith("@@"):
            continue
        if raw.startswith("-") and raw[1:].strip():
            removed.append(raw[1:].strip())
        elif raw.startswith("+") and raw[1:].strip():
            added.append(raw[1:].strip())
    if not removed and not added:
        return [color(DIM, "no textual diff")]
    lines = []
    if removed:
        lines.append(color(RED, "−  " + _clip(removed[0])))
    if added:
        lines.append(color(GREEN, "+  " + _clip(added[0])))
    return lines


def _clip(text: str, width: int = 72) -> str:
    return textwrap.shorten(text, width=width, placeholder=" …")
