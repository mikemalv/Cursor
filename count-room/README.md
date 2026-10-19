# Count Room — fix automatically or alert the owner

“An analytics job breaks overnight. Cursor investigates and writes a fix. Python
applies it automatically when checks and policy allow. State-regulated revenue
stays unchanged; the controller receives an alert in the demo inbox.”

This addresses **Example B: Bug, Vulnerability & Incident Response** in the Cursor
Field Engineering exercise. It demonstrates a multi-step SDLC workflow, a real
enterprise constraint, concrete artifacts, failure behavior, and a live extension.

## Run the clickable demo

```bash
cd /Users/mmalveira/Interview_Prep/count-room
source .venv/bin/activate
pip install -e '.[dev]'
pytest -q
python -m count_room export
python -m count_room serve
```

Open **http://127.0.0.1:8765/#sdk-demo**. The HTML is also usable directly from disk
with the adjacent `count-room/web/` files present: it displays exported Python
results and disables execution buttons. `export` reruns the two synthetic
scenarios and embeds their real files in `web/demo-data.js`.

For a fresh setup, create `.venv` first with `python3 -m venv .venv`.

For live Cursor, the CLI automatically reads `~/.config/count-room/api-key`
when `CURSOR_API_KEY` is not already set. The saved key is private (0600) and
outside the repository. Run:

```bash
python -m count_room smoke
python -m count_room live
python -m count_room serve
```

`live` runs marketing (`roi`) then regulated revenue (`ggr`) as one pipeline. Press Enter to advance each stage. Same thing: `python -m count_room demo --live`. One incident: `python -m count_room run roi --live`. Dump without pauses: `--no-step`.

Restart an already-running server after setting the key. No key is sent to the
browser. `COUNTROOM_MODEL` optionally overrides `composer-2.5`; account model
availability still needs a live check. Dependency: `cursor-sdk==1.0.31`.

## Keep the story small

1. **Marketing:** failure → Cursor diagnosis → policy allows → Cursor fix →
   independent checks → automatic application to the local demo workspace.
   Show `applied.sql`, `APPLIED.json`, and the actual changed file.
2. **Regulated revenue:** Cursor diagnoses, but the company policy for
   Nevada-regulated reporting prevents the fix agent from being created.
   SQL stays unchanged. `ALERT.json` identifies the controller/compliance owner
   and required action; `DOSSIER.md` carries the supporting evidence.

Alerts are raised in the **local demo inbox**, not emailed or posted externally.
The restriction represents company policy for regulated reporting, not a claim
that state law specifically prohibits AI changes. The older privacy backend case
is retained for regression coverage but is not part of the walkthrough.

The inherited field called `roi` computes spend per impression, not financial
return on investment. The prototype preserves that legacy output contract.
The simulated Snowflake division-by-zero incident reproduces as a failed finite-
number/NULL assertion in DuckDB, whose division-by-zero behavior differs.

## Why the SDK matters

The SDK supplies the coding-agent loop, workspace tools, custom tool callbacks,
and run events. Python can start repository investigation from an incident rather
than requiring an engineer at an editor. The application supplies deterministic
policy and independent correctness checks. A raw model API would require building
the tool loop; a script alone cannot generalize diagnosis across unfamiliar bugs.

| Stage | SDK work | Application work |
|---|---|---|
| Triage | `Agent.create(AgentOptions(...))`, read tools, `warehouse_select`, `emit_triage` | Fresh SQL workspace; synthetic snapshot adapter |
| Policy | None | Include the trusted incident target; resolve tags; strictest decision |
| Proposal | Second agent, only after permission; `emit_patch` | Persist actual returned SQL; no fixture fallback |
| Verification | None | Execute original/proposed SQL in DuckDB and check independent expectations |
| Evidence | `run.messages()` events during live execution | Diff, checks, report, unique run directory |

Both agents have read tools; only the proposal agent has `emit_patch`. Python owns
artifact writes. These are constrained workspaces and tool surfaces, not a claim
of OS-level containment. No agent has a warehouse write tool.

## Truth boundaries

- **Executed locally:** orchestration, gate, actual SQL verification, diffs,
  artifacts, and the loopback HTTP execution endpoint.
- **Fixture mode:** hypotheses/proposals, alerts, impact/lineage metadata, and tags
  are synthetic. It makes zero SDK calls. Snapshots do not execute SELECTs.
- **Live mode:** triage and proposal call Cursor; returned SQL is the exact SQL
  tested. Warehouse metadata remains synthetic. A failed/empty SDK result stops
  the run rather than replacing it with a canned result.
- **Not built:** Snowflake connection/clone, GitHub PRs, deployment, queued jobs,
  resumable execution, and a full human approval service. `auto_remediated`
  means applied in the isolated local demo workspace, never production. A fresh
  copy of the seeded SQL is created per run; the source templates stay unchanged.
- **Live connection verified:** the real SDK smoke check returned `count-room smoke ok`.
  This validates authentication and a one-shot agent run. The full two-incident
  live workflow still needs an end-to-end rehearsal. Local tests also use a
  test-double transport; those are not live agent runs.
- The governance zone names encode the demo company's policy, not a statement
  of legal requirements. The financial and privacy figures are examples.

Reports are under `runs/<incident>/<unique-run-id>/`. Root-level legacy files under
`runs/<incident>/` predate this revision and are not used by the walkthrough.

## Presenter timing and extension

- 0–2: incident and business constraint.
- 2–9: marketing run, actual diff, before/after checks, evidence.
- 9–13: regulated refusal and dossier.
- 13–16: inspect the applied file and the blocked case’s open owner alert.
- 16–20: two SDK calls, Python gate, and trade-offs.

Live extension: add a synthetic multi-row/fractional-spend campaign to `verify.py`
and independently specify its expected aggregate. Run tests, export, refresh.
Another extension is a new trusted governance tag and a gate regression test.

## Files

- `src/count_room/agents.py`: installed SDK options, tools, callbacks, streaming.
- `src/count_room/pipeline.py`: authorization, proposal persistence, verification.
- `src/count_room/verify.py`: DuckDB SELECT execution, synthetic datasets/assertions.
- `src/count_room/demo_web.py`: export and loopback server; no arbitrary file serving.
- `web/demo.js`: ten-step guided story, clickable architecture, six-stage black terminal replay, and artifact viewer. Terminal summaries are derived from run artifacts and labeled as replay.
- `web/overview-before.html`: backup of the original HTML before this revision.

## Production trade-offs

Keep the pilot metric honest: measure time from alert to a correct, policy-compliant
handoff, plus rejected proposals and unnecessary escalations. Next add queued runs
with cancellation and deadlines, trusted live metadata with warehouse RBAC,
Snowflake-native tests, and an authorized PR/review integration. A browser request
currently waits for completion; live events are written to the run directory rather
than streamed into the page. The server binds loopback only and requires a same-origin
session token for execution. It is a local demo server, not a production service.

### Refresh displayed source after editing Python

From this folder, run:

```bash
.venv/bin/python -m count_room export --source-only
```

Then refresh the HTML. This updates code excerpts and their line numbers without
running agents or replacing saved incident results. Plain `export` still runs
fixture scenarios and replaces the displayed results.
