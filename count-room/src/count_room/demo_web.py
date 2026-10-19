"""HTML data export and loopback-only execution bridge. No credentials in browser."""
from dataclasses import asdict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import secrets
from urllib.parse import urlparse

from count_room.catalog import ROOT, load_incident, read_sql
from count_room.pipeline import handle_incident
from count_room.verify import verify_sql


def source_code():
    """Export exact source excerpts so presentation code cannot drift into pseudocode."""
    import hashlib
    specs = {
        "apply_fix": ("pipeline.py", "    if run.patch_verified and may_auto_remediate", 14, "Apply the verified fix automatically"),
        "raise_alert": ("pipeline.py", "        alert = {", 13, "Raise an alert instead of changing SQL"),
        "dispatch": ("pipeline.py", "    if mode == \"live\":", 7, "Choose the live agent path"),
        "triage_create": ("agents.py", "    agent = Agent.create(AgentOptions(", 11, "Create the investigation agent"),
        "triage_sql_read": ("agents.py", "        sql_text = Path(workspace, incident.sql_file).read_text()", 1, "Python reads the SQL into the prompt"),
        "triage_prompt": ("agents.py", "        run = agent.send(", 23, "Send the incident as the task"),
        "triage_events": ("agents.py", "def _drain(run, audit: AuditLog, label: str)", 12, "Capture run events and require success"),
        "triage_result": ("agents.py", "    def emit(args, context: CustomToolContext):", 7, "Receive structured diagnosis"),
        "warehouse_tool": ("agents.py", "    def execute(args, context: CustomToolContext):", 7, "Connect a bounded evidence tool"),
        "trusted_target": ("pipeline.py", "    # Never let model output omit", 6, "Keep the trusted target in policy"),
        "gate_decide": ("gate.py", "def decide(", 8, "Python policy decision — no model"),
        "gate_may_fix": ("gate.py", "def may_instantiate_fix(", 2, "Whether Agent 2 may exist"),
        "gate_zones": ("gate.py", "def zone_from_tags(", 9, "Map tags to STANDARD / PII / NGCB"),
        "gate_branch": ("pipeline.py", "    if not may_instantiate_fix(decision):", 18, "Stop before creating the second agent"),
        "fix_create": ("agents.py", "        agent = Agent.create(AgentOptions(", 11, "Create the proposal agent"),
        "fix_callback": ("agents.py", "    def emit(args, context):", 7, "Receive actual SQL from Cursor"),
        "fix_prompt": ("agents.py", "            run = agent.send(", 18, "Ask Agent 2 for the complete replacement SQL"),
        "verify_proposal": ("pipeline.py", "    original = read_sql(incident.sql_file)", 10, "Persist and test the actual proposal"),
        "handoff": ("pipeline.py", "    if decision.zone.actions.output ==", 9, "Choose evidence or dossier"),
    }
    files = {}
    snippets = {}
    src = ROOT / "src" / "count_room"
    # Always ship the three interview files so line numbers in the HTML match the editor.
    for name in ("agents.py", "pipeline.py", "gate.py"):
        path = src / name
        text = path.read_text()
        files[name] = {"path": str(path), "text": text,
                       "sha256": hashlib.sha256(text.encode()).hexdigest()}
    for key, (name, anchor, count, title) in specs.items():
        lines = files[name]["text"].splitlines()
        # The original-SQL read also occurs in the apply stage; scope this
        # excerpt to the proposal verifier rather than taking the first match.
        scope_start = 1
        if key == "verify_proposal":
            scope_start = next(i for i, line in enumerate(lines, start=1)
                               if line.startswith("def _run_fix_and_clone("))
        # 1-based, same as the editor gutter (first line of the file is 1).
        start = next(i for i, line in enumerate(lines, start=1)
                     if i >= scope_start and line.startswith(anchor))
        snippets[key] = {"file": name, "start": start, "title": title,
                         "lines": lines[start - 1:start - 1 + count]}
    return {"files": files, "snippets": snippets}


def payload(incident_id, mode="fixture"):
    run = handle_incident(incident_id, mode=mode)
    folder = Path(run.artifact_path).parent
    files = {p.name: p.read_text() for p in folder.iterdir() if p.is_file()}
    data = asdict(run)
    data.update(files=files, run_id=folder.name, generated_at=datetime.now(timezone.utc).isoformat())
    return data


def export(*, source_only=False):
    target = ROOT / "web" / "demo-data.js"
    if source_only:
        # Refresh source without executing fixtures or replacing live evidence.
        data = json.loads(target.read_text().split("=", 1)[1].strip().removesuffix(";"))
        data["source_code"] = source_code()
        target.write_text("window.COUNT_ROOM_DATA = " + json.dumps(data, ensure_ascii=True).replace("</", "<\\/") + ";\n")
        print(target)
        return
    data = {name: payload(name) for name in ("roi", "ggr")}
    data["source_code"] = source_code()
    data["incident_inputs"] = {name: (ROOT / "fixtures" / "incidents" / f"{name}.json").read_text() for name in ("roi", "ggr")}
    data["sql_sources"] = {name: read_sql(load_incident(name).sql_file) for name in ("roi", "ggr")}
    # Deliberately run the unfixed SQL to prove the verifier rejects a bad proposal.
    data["bad_patch"] = verify_sql("roi", read_sql(load_incident("roi").sql_file))
    target = ROOT / "web" / "demo-data.js"
    target.write_text("window.COUNT_ROOM_DATA = " + json.dumps(data, default=str, ensure_ascii=True).replace("</", "<\\/") + ";\n")
    print(target)


def serve():
    token = secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def respond(self, code, value, mime="application/json"):
            body = value if isinstance(value, bytes) else value.encode() if isinstance(value, str) else json.dumps(value, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", mime)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def authorized_host(self):
            return self.headers.get("Host") in {"127.0.0.1:8765", "localhost:8765"}

        def do_GET(self):
            if not self.authorized_host():
                return self.respond(403, {"error":"loopback host required"})
            path = urlparse(self.path).path
            if path == "/api/status":
                return self.respond(200,{"token":token, "live_available": bool(os.environ.get("CURSOR_API_KEY"))})
            files = {"/": (ROOT.parent / "sdlc-cicd-overview.html", "text/html; charset=utf-8"),
                     "/cursor-spacex.html": (ROOT.parent / "cursor-spacex.html", "text/html; charset=utf-8"),
                     "/sdlc-cicd-overview.html": (ROOT.parent / "sdlc-cicd-overview.html", "text/html; charset=utf-8"),
                     "/count-room/web/demo-data.js": (ROOT / "web/demo-data.js", "text/javascript"),
                     "/count-room/web/demo.js": (ROOT / "web/demo.js", "text/javascript"),
                     "/count-room/web/workflow-whiteboard.png": (ROOT / "web/workflow-whiteboard.png", "image/png")}
            for name, mime in (("index.html", "text/html; charset=utf-8"),
                               ("style.css", "text/css"), ("demo.js", "text/javascript"),
                               ("demo-data.js", "text/javascript")):
                files["/pipeline-doctor/" + name] = (ROOT.parent / "pipeline-doctor" / name, mime)
            if path not in files:
                return self.respond(404, {"error":"not found"})
            file, mime = files[path]
            return self.respond(200, file.read_bytes() if mime.startswith("image/") else file.read_text(), mime)

        def do_POST(self):
            if not self.authorized_host() or self.headers.get("X-Count-Room-Token") != token or self.headers.get("Origin") not in {"http://localhost:8765","http://127.0.0.1:8765"}:
                return self.respond(403,{"error":"same-origin session token required"})
            if self.path != "/api/run":
                return self.respond(404,{"error":"not found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > 1024:
                    raise ValueError("invalid request size")
                args = json.loads(self.rfile.read(length))
                if args.get("incident") not in {"roi","ggr","pii"} or args.get("mode") not in {"fixture","live"}:
                    raise ValueError("unsupported incident or mode")
                if args["mode"] == "live" and not os.environ.get("CURSOR_API_KEY"):
                    return self.respond(409,{"error":"CURSOR_API_KEY is not set in the server environment. No SDK call was made."})
                self.respond(200,payload(args["incident"],args["mode"]))
            except (Exception, SystemExit) as exc:
                self.respond(500,{"error":str(exc),"deployed":False})
    print("Count Room: http://127.0.0.1:8765/#sdk-demo", flush=True)
    ThreadingHTTPServer(("127.0.0.1",8765),Handler).serve_forever()
