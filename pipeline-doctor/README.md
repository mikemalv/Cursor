# Pipeline Doctor — Cursor repairs a Python reporting job

A separate, deliberately small Cursor SDK demo inspired by the
[Snowflake Cortex Code SDK quickstart](https://docs.snowflake.com/en/user-guide/cortex-code-agent-sdk/quickstart).
The reference teaches an agent repairing a local campaign-reporting script.
This adaptation uses one Cursor agent, a new implementation, and independent tests.

## Story

The morning campaign report crashes on zero-click campaigns and empty query
results. Cursor reads the contract and Python source, edits the actual workspace
file, and returns. The host checks the result before calling it repaired.
Zero-click campaigns stay visible with an undefined rate (`None`); an empty
input returns a valid empty report. No warehouse connection is needed.

## Run

```bash
cd /Users/mmalveira/Interview_Prep/pipeline-doctor
.venv/bin/python agent.py --live --export
```

`CURSOR_API_KEY` takes precedence; otherwise the CLI reads the existing private
`~/.config/count-room/api-key`. No key belongs in this folder or the HTML.
`PIPELINE_DOCTOR_MODEL` can override the default `composer-2.5` model.

A fresh environment can be created with:

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
```

Offline rehearsal and tests:

```bash
.venv/bin/python agent.py --export
.venv/bin/python -m pytest -q
```

Fixture mode copies a labeled reference repair. Live mode uses the Cursor edit
tool and never substitutes a fixture if the agent fails. Every run creates a
fresh `runs/<id>/workspace/campaign_report.py`, preserving the broken seed.

## HTML

The parent interview-prep HTML has a **Cursor → Pipeline Doctor** tab.
With the Count Room server running, open:

**http://127.0.0.1:8765/#pipeline-doctor**

The new scenario also has its own `index.html`, `style.css`, `demo.js`, and
`demo-data.js`. Open `index.html` directly, or serve this directory independently:

```bash
.venv/bin/python -m http.server 8766 --bind 127.0.0.1
# http://127.0.0.1:8766/
```

After a terminal run with `--export`, click **Reload latest run** in the new tab.
The page shows the exact exported run and labels fixture versus live provenance.
Running the terminal command does not stream into an already open page.

## SDK mapping

| Reference pattern | This Cursor implementation |
|---|---|
| Create an agent from application code | `Agent.create(AgentOptions(...))` |
| Supply a workspace and tools | `LocalAgentOptions(cwd=...)`, `tools=["read", "edit"]` |
| Ask it to fix the script | `agent.send(...)` |
| Observe tool calls and completion | `run.messages()`, `run.wait()` |
| Inspect its edit | actual workspace file, `patch.diff`, independent checks |

The code excerpt shown by the HTML is exported from `agent.py`, not handwritten
pseudocode. The [Cursor Python SDK reference](https://cursor.com/docs/sdk/python)
documents the option types and local tool names.

## Evidence

Each run retains `before.py`, `after.py`, `patch.diff`, `checks.json`,
`events.jsonl`, `result.json`, and `REPORT.md`. The UI shows the two reproduced
failures, the SDK implementation, a colored diff, final checks, and sample output.

Six behavior cases cover ordinary math, zero clicks, empty input, mixed inputs,
zero conversions, and stable ties. Every case also checks that input is unchanged.
Tests live outside the agent workspace. The test child process does not inherit
API credentials and has a ten-second timeout. This is a local development demo,
not an OS sandbox. Model-produced Python runs locally; no production deployment,
Snowflake query, or notification delivery is part of this scenario.

## Live rehearsal result

The initial live rehearsal succeeded: Cursor read the contract and source, used
its edit tool on the reporting script, and all six independent behavior cases
passed. The exported HTML was populated from that real live run. Look at its
current mode badge and run id after subsequent exports; a fixture export can
replace the displayed result and will be labeled accordingly.
