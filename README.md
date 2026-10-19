# Cursor — Field Engineering Technical Exercise

Working prototypes built with the **Cursor SDK**, for the Cursor Field Engineering
technical exercise. The prompt is in
[`Cursor_Excercise/field-eng-cursor-sdk (1).pdf`](Cursor_Excercise/field-eng-cursor-sdk%20(1).pdf).

The submitted prototype is **Count Room** — see below. The other folders are
earlier/alternate builds and supporting material, indexed at the bottom so the
repo root stays readable.

---

## Count Room — fix automatically, or alert the owner

**Example B: Bug, Vulnerability & Incident Response.**

An analytics job breaks overnight. Cursor investigates and writes a fix.
Python applies it automatically when checks and policy allow. State-regulated
revenue stays unchanged; the controller receives an alert in the demo inbox.

> Cursor finds the bug. Python decides whether anyone is allowed to write.

Live Cursor SDK agents diagnose broken warehouse SQL. A deterministic Python
gate — no model involved — decides, *before any writing agent exists*, whether
one may patch at all. Python then verifies the proposed SQL itself: apply
locally only if the checks pass, otherwise stop and alert the owner. Nothing
is deployed to production.

```
triage agent (Cursor) → policy gate (Python) → fix agent, iff allowed (Cursor)
                      → independent SQL verification (Python) → apply locally / alert owner
```

### Two outcomes, one pipeline

| Incident | What happened | What the demo does |
|---|---|---|
| Marketing (`roi`) | Nightly job crashes on division by zero | Agent 1 diagnoses. The gate allows a patch. Agent 2 proposes SQL. Python checks it and applies it in a local demo workspace. |
| Regulated revenue (`ggr`) | The job succeeds, but revenue lands on the wrong gaming day | Agent 1 diagnoses. The gate is `NGCB_MICS`. Agent 2 is **never created**. SQL stays unchanged and an owner alert is recorded. |

In production the incident JSON would be determined by **Dagster (or
Airflow/dbt Cloud)** — it detects the failed job or reconciliation mismatch and
its manifest maps the model to the SQL file and target object — and
**PagerDuty** would notify on it, paging the on-call. A thin webhook adapter
joins the two into the normalized incident JSON this pipeline consumes. In the
demo, `fixtures/incidents/*.json` is the synthetic stand-in, same schema.

### Run it

```bash
cd count-room
source .venv/bin/activate

# Live: two incidents, real Cursor agents (reads CURSOR_API_KEY,
# or ~/.config/count-room/api-key if the env var is unset)
.venv/bin/python -m count_room live

# Fixture mode: no API key, no SDK calls — gate, verification and apply still run
.venv/bin/python -m count_room demo --no-step

# Tests
.venv/bin/python -m pytest -q
```

Clickable walkthrough (loopback only, no key ever reaches the browser):

```bash
.venv/bin/python -m count_room serve
# Open http://127.0.0.1:8765/#sdk-demo
```

### Code to walk

| File | Role |
|---|---|
| [`count-room/src/count_room/agents.py`](count-room/src/count_room/agents.py) | Cursor SDK. Agent 1 returns a diagnosis via `emit_triage`. Agent 2 returns SQL via `emit_patch`. Neither writes the repo. |
| [`count-room/src/count_room/pipeline.py`](count-room/src/count_room/pipeline.py) | Orchestrator. Order is fixed: triage → gate → maybe fix → verify → apply or alert. |
| [`count-room/src/count_room/gate.py`](count-room/src/count_room/gate.py) | Deterministic tag → zone lookup. No model. Decides whether a writing agent may exist. |

Full detail — truth boundaries, presenter timing, trade-offs, and the live
extension — is in [`count-room/README.md`](count-room/README.md).

### Scope, honestly

Executed locally: orchestration, the gate, real SQL verification (DuckDB on
synthetic data), diffs, evidence artifacts, and the loopback demo server.
Simulated: warehouse tags/lineage/impact snapshots, incident fixtures, alert
delivery (local demo inbox). Not built: Snowflake connection, GitHub PRs,
production deployment, queued/resumable runs. "Auto-applied" means applied in
an isolated per-run demo workspace — never production.

---

## Repo map

| Path | What it is |
|---|---|
| [`count-room/`](count-room/) | **Count Room** (Python, `cursor-sdk`) — the submitted prototype above. |
| [`sdlc-cicd-overview.html`](sdlc-cicd-overview.html) | The clickable presentation/walkthrough served by `count_room serve` at `/`. |
| [`cursor-spacex.html`](cursor-spacex.html) | Count Room live-demo page, served at `/cursor-spacex.html`. |
| [`Cursor_Excercise/`](Cursor_Excercise/) | The exercise brief (PDF). |
| [`pit-boss/`](pit-boss/) | Earlier TypeScript build on the same governance thesis for regulated gaming. See its `PLAN.md`. |
| [`drift-fleet/`](drift-fleet/) | Alternate exercise build: warehouse schema drift → sequenced cross-repo migration plan. |
| [`pipeline-doctor/`](pipeline-doctor/) | Small standalone Cursor SDK demo: an agent repairs a Python reporting job, host-verified. |
| [`git-tutorial/`](git-tutorial/) | Hands-on, press-Enter-to-run Git walkthrough (unrelated supporting material). |

## Notes

- No API keys in this repo. Live mode reads `CURSOR_API_KEY` or the private
  `~/.config/count-room/api-key` file.
- Each Count Room run writes its evidence to `count-room/runs/<incident>/<run-id>/`
  (`EVIDENCE.md` / `DOSSIER.md`, `APPLIED.json` / `ALERT.json`, diffs, event log).
