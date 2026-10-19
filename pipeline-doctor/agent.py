"""Pipeline Doctor: one real Cursor agent edits a broken reporting script."""
from __future__ import annotations
import argparse
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
import difflib
import json
import os
from pathlib import Path
import shutil
import threading
import uuid
from checks import verify

ROOT = Path(__file__).resolve().parent


def credentials():
    if not os.environ.get("CURSOR_API_KEY", "").strip():
        saved = Path.home() / ".config/count-room/api-key"
        if saved.is_file():
            os.environ["CURSOR_API_KEY"] = saved.read_text().strip()
    if not os.environ.get("CURSOR_API_KEY", "").strip():
        raise RuntimeError("Set CURSOR_API_KEY or use the existing private Count Room key file.")


def live_repair(workspace: Path, record):
    from cursor_sdk import Agent, AgentOptions, LocalAgentOptions
    credentials()
    # Same task shape as the reference quickstart: the agent edits a real file.
    agent = Agent.create(AgentOptions(
        api_key=os.environ["CURSOR_API_KEY"],
        model=os.environ.get("PIPELINE_DOCTOR_MODEL", "composer-2.5"),
        tools=["read", "edit"],
        local=LocalAgentOptions(cwd=str(workspace), setting_sources=[]),
    ))
    record("agent_created", {"agent_id":agent.agent_id,"tools":["read","edit"]})
    timer = None
    try:
        run = agent.send(
            "Read CONTRACT.md and campaign_report.py in this workspace. "
            "Repair the Python implementation so it satisfies the contract, including zero-click "
            "campaigns and an empty result list. Edit campaign_report.py directly using your edit tool. "
            "Do not change CONTRACT.md, create other files, or use external dependencies. "
            "The host runs independent regression checks after you finish. "
            "When the edit is complete, briefly describe the changes."
        )
        timer = threading.Timer(150, run.cancel)
        timer.daemon = True
        timer.start()
        for message in run.messages():
            payload = asdict(message) if is_dataclass(message) else {"type":getattr(message,"type","event"),"name":getattr(message,"name",None)}
            record("sdk_event", payload)
            if getattr(message, "type", "") in {"tool_call", "status"}:
                print(f"[cursor] {getattr(message,'type','')} {getattr(message,'name','')} {getattr(message,'status','')}", flush=True)
        result = run.wait()
        record("agent_completed", {"status":result.status,"agent_id":agent.agent_id})
        if result.status != "finished":
            raise RuntimeError(f"Cursor run ended with {result.status}; no successful repair claimed")
    finally:
        if timer:
            timer.cancel()
        try:
            agent.close()
        except Exception as error:
            record("cleanup_warning", {"type":type(error).__name__})


def execute(mode="fixture"):
    if mode not in {"fixture", "live"}:
        raise ValueError("mode must be fixture or live")
    folder = ROOT / "runs" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")+"-"+uuid.uuid4().hex[:8])
    workspace = folder / "workspace"
    workspace.mkdir(parents=True)
    target = workspace / "campaign_report.py"
    shutil.copyfile(ROOT / "fixtures/broken_report.py", target)
    shutil.copyfile(ROOT / "CONTRACT.md", workspace / "CONTRACT.md")
    original = target.read_text()
    (folder / "before.py").write_text(original)
    def record(kind,payload):
        with (folder / "events.jsonl").open("a") as stream:
            stream.write(json.dumps({"at":datetime.now(timezone.utc).isoformat(),"kind":kind,"payload":payload},default=str)+"\n")
    record("started", {"mode":mode,"workspace":str(workspace)})
    print(f"[run] {folder}\n[mode] {mode}",flush=True)
    before = verify(target)
    print_checks("BEFORE",before)
    error = None
    try:
        if mode == "live":
            live_repair(workspace, record)
        else:
            print("[fixture] Applying the reference patch; no SDK call",flush=True)
            shutil.copyfile(ROOT / "fixtures/fixed_report.py", target)
        if (workspace / "CONTRACT.md").read_text() != (ROOT / "CONTRACT.md").read_text():
            raise RuntimeError("Agent changed the contract")
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        record("repair_error", {"error":error})
    updated = target.read_text()
    after = verify(target)
    passed = error is None and updated != original and after["passed"]
    print_checks("AFTER",after)
    diff = "".join(difflib.unified_diff(original.splitlines(True),updated.splitlines(True),fromfile="before/campaign_report.py",tofile="after/campaign_report.py"))
    (folder / "after.py").write_text(updated)
    (folder / "patch.diff").write_text(diff)
    (folder / "checks.json").write_text(json.dumps({"before":before,"after":after},indent=2))
    result = {"run_id":folder.name,"mode":mode,"passed":passed,"error":error,
              "workspace":str(workspace),"before":before,"after":after,"production_deployed":False}
    (folder / "result.json").write_text(json.dumps(result,indent=2))
    record("completed",result)
    report = f"# Pipeline Doctor\n\nStatus: {'REPAIRED' if passed else 'FAILED'}\nMode: {mode}\nWorkspace: {workspace}\n\n"
    report += "Independent checks:\n" + "\n".join(f"- {'PASS' if c['passed'] else 'FAIL'}: {c['name']}" for c in after.get("checks",[]))
    if error:
        report += f"\n\nError: {error}"
    report += "\n\nThis run edits a local copy of a synthetic pipeline. No warehouse or production deployment.\n"
    (folder / "REPORT.md").write_text(report)
    print(f"[{'REPAIRED' if passed else 'FAILED'}] {target}",flush=True)
    result["files"] = {p.name:p.read_text() for p in folder.iterdir() if p.is_file()}
    return result


def print_checks(label,result):
    print(f"\n{label}",flush=True)
    for check in result.get("checks",[]):
        print(f"  {'PASS' if check['passed'] else 'FAIL'} {check['name']}" + (" — "+check["error"] if "error" in check else ""),flush=True)
    if result.get("error"):
        print(result["error"],flush=True)


def export(result):
    result["source"] = {name:(ROOT/name).read_text() for name in ("agent.py","checks.py","CONTRACT.md")}
    (ROOT / "demo-data.js").write_text("window.PIPELINE_DOCTOR = "+json.dumps(result,ensure_ascii=True).replace("</","<\\/")+";\n")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live",action="store_true",help="Use Cursor to edit the reporting script")
    parser.add_argument("--export",action="store_true",help="Refresh the HTML with this exact completed run")
    args=parser.parse_args()
    result=execute("live" if args.live else "fixture")
    if args.export:
        export(result)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
