from __future__ import annotations

import argparse
import os
from pathlib import Path

from count_room.catalog import list_incident_ids, load_incident, load_policy
from count_room.gate import decide
from count_room.pipeline import fixture_triage, handle_incident
from count_room import report

DEMO_INCIDENTS = ("roi", "ggr")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="count-room",
        description="Governed Snowflake remediation — Cursor Python SDK.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("policy", help="run every fixture through the gate (no API key)")

    run_p = sub.add_parser("run", help="full pipeline for one incident")
    run_p.add_argument("incident", choices=list_incident_ids())
    run_p.add_argument("--live", action="store_true", help="use Cursor SDK agents")
    run_p.add_argument("--no-step", action="store_true", help="print everything without waiting")

    demo_p = sub.add_parser("demo", help="roi then ggr — fixture by default")
    demo_p.add_argument("--live", action="store_true", help="use Cursor SDK agents")
    demo_p.add_argument("--no-step", action="store_true", help="print everything without waiting")

    live_p = sub.add_parser("live", help="roi then ggr with Cursor SDK agents")
    live_p.add_argument("--no-step", action="store_true", help="print everything without waiting")
    export_p = sub.add_parser("export", help="refresh the HTML data bundle")
    export_p.add_argument("--source-only", action="store_true",
                          help="refresh code and line numbers without running scenarios")
    sub.add_parser("serve", help="serve the clickable demo on loopback port 8765")
    sub.add_parser("smoke", help="one-shot Agent.prompt — needs CURSOR_API_KEY")

    args = parser.parse_args(argv)
    needs_key = args.cmd in {"smoke", "serve", "live"} or (
        args.cmd in {"run", "demo"} and getattr(args, "live", False)
    )
    if needs_key and not os.environ.get("CURSOR_API_KEY", "").strip():
        key_file = Path.home() / ".config" / "count-room" / "api-key"
        if key_file.is_file():
            os.environ["CURSOR_API_KEY"] = key_file.read_text().strip()
    if args.cmd == "export":
        from count_room.demo_web import export
        export(source_only=args.source_only)
        return 0
    if args.cmd == "serve":
        from count_room.demo_web import serve
        serve()
        return 0
    if args.cmd == "policy":
        return cmd_policy()
    if args.cmd == "run":
        return cmd_run(args.incident, live=args.live, step=not args.no_step)
    if args.cmd == "demo":
        return cmd_pipeline(live=args.live, step=not args.no_step)
    if args.cmd == "live":
        return cmd_pipeline(live=True, step=not args.no_step)
    if args.cmd == "smoke":
        return cmd_smoke()
    return 1


def cmd_policy() -> int:
    print(report.color(report.BOLD, "\nCount Room — policy gate (no model, no API key)\n"))
    for incident_id in list_incident_ids():
        incident = load_incident(incident_id)
        decision = decide(load_policy(), fixture_triage(incident))
        zone = decision.zone.id
        tint = {"STANDARD": report.GREEN, "RESTRICTED_PII": report.YELLOW, "NGCB_MICS": report.RED}[zone]
        print(report.color(report.BOLD, f"{incident.id}  {incident.title}"))
        print(f"  object  {incident.target_object}")
        print(f"  zone    {report.color(tint, zone)}  →  {decision.zone.actions.output}")
        print(f"  {report.color(report.DIM, decision.explanation)}\n")
    return 0


def cmd_run(incident_id: str, *, live: bool, step: bool = True) -> int:
    report.enable_stepping(step)
    report.header(live=live, count=1)
    runs = [_execute(incident_id, live=live, index=1, total=1)]
    report.summary(runs)
    return 0


def cmd_pipeline(*, live: bool, step: bool = True) -> int:
    report.enable_stepping(step)
    report.header(live=live, count=len(DEMO_INCIDENTS))
    runs = [
        _execute(incident_id, live=live, index=i, total=len(DEMO_INCIDENTS))
        for i, incident_id in enumerate(DEMO_INCIDENTS, start=1)
    ]
    report.summary(runs)
    return 0


def cmd_demo() -> int:
    return cmd_pipeline(live=False)


def cmd_smoke() -> int:
    from count_room.agents import smoke

    text = smoke()
    print(report.color(report.GREEN, "SDK smoke passed"))
    print(text)
    return 0


def _execute(incident_id: str, *, live: bool, index: int, total: int):
    incident = load_incident(incident_id)
    report.open_incident(incident, index, total)
    report.pause("start")
    if live:
        report.say("sdk", "local Cursor agent — first call boots the bridge", tone="dim")
    run = handle_incident(incident_id, mode="live" if live else "fixture")
    report.recap(run)
    if index < total:
        nxt_id = DEMO_INCIDENTS[index]
        nxt = report.SCENES.get(nxt_id, {})
        print(report.color(report.DIM, "  " + "─" * 62))
        print(
            report.color(nxt.get("accent", report.CYAN), "  Next: ")
            + report.color(report.BOLD, f"Scenario {nxt.get('letter', '?')}  ·  {nxt.get('lane', nxt_id)}")
            + report.color(nxt.get("accent", report.CYAN), f"  {nxt.get('path', '')}")
        )
        print()
        report.pause(f"scenario {nxt.get('letter', nxt_id)}")
    return run
