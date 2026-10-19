# Pit Boss — Cursor SDK Technical Exercise

**Problem space B — Bug, Vulnerability & Incident Response · Vertical: casino gaming**
Build window: ~10 working days. Live session: 45 min (≈20 min demo + architecture + live extension).

---

## 1. The bet

Most candidates will build *"agent reads Sentry alert → agent opens PR."* That is a demo, not an
enterprise workflow. It gets a polite nod and a hard question you can't answer: *"we'd never let
that near our codebase — then what?"*

**Pit Boss is opinionated about the actual hard part: the fix is not the hard part. Routing the fix
through a governance boundary is.** In a regulated enterprise, an agent that can change any file is
an agent that can never be turned on. So Pit Boss is built around a deterministic policy gate that
decides — before any agent is allowed to write a byte — whether this incident is even *eligible* for
automated remediation, and what evidence a human will need to approve it.

The demo's climax is not the agent fixing something. **It's the agent refusing to.**

Why that wins for a *Field Engineering* role specifically: this artifact is exactly what a Cursor FE
would put in front of a regulated customer as a reference architecture. You're not just answering
"can you code" — you're demonstrating the instinct the job is actually about: meeting an enterprise
where its constraints are.

---

## 2. Problem statement (why gaming, why this matters)

A large casino operator runs a platform that never has a maintenance window. Slot floor, sportsbook,
cage/payments, PMS, and loyalty all run 24/7/365; peak load is precisely when you least want to
deploy (Friday night, an NFL slate, a fight weekend). Incident response is therefore chronically
under-resourced at exactly the hours incidents happen.

Three constraints make naive auto-remediation illegal, not just risky:

| Constraint | What it means for an agent |
|---|---|
| **Gaming regulation** (NV Reg 14, GLI-33 certification) | Code governing RNG, wagering, and payout calculation is *certified*. Changing it requires submission and re-certification. An agent must not patch it — full stop. |
| **PCI-DSS** | Payments/cage code is in scope. Changes are allowed but need independent security review, no new dependencies, and proof that no PAN/PII is logged. |
| **Auditability** | Regulators subpoena change history. "The AI did it" is not an answer. Every tool call, every model decision, every approval needs an immutable record. |

Everything else — loyalty, comps, web, internal tooling — is ordinary software where full
auto-remediation is genuinely valuable.

**So: one incident pipeline, three different outcomes, decided by where the blast radius lands.**

---

## 3. Architecture

```
incident (webhook / fixture)
        │
        ▼
┌───────────────────┐   read-only agent: tools ["read","grep","ls"]
│  TRIAGE AGENT     │   structurally incapable of mutating the repo
└───────────────────┘   emits structured JSON via a custom MCP tool
        │  { suspect files, hypothesis, confidence, blast radius }
        ▼
╔═══════════════════╗
║  POLICY GATE      ║   *** DETERMINISTIC CODE, NOT AN LLM ***
║  .pitboss/        ║   path globs → regulatory zone → allowed actions
║  policy.yaml      ║
╚═══════════════════╝
        │
        ├── GAMING_REGULATED ──► NO PATCHING. Generate compliance dossier.
        │
        ├── PCI_SCOPE ─────────► Patch + mandatory adversarial review + human gate
        │
        └── STANDARD ──────────► Full auto-remediation → PR
                                          │
        ┌─────────────────────────────────┴──────────────┐
        │        PARALLEL SPECIALIST FAN-OUT             │
        │  (Promise.all over independent Agent instances)│
        ├────────────┬────────────┬─────────────┬────────┤
        │  REPRO     │   FIX      │  SECURITY   │ BLAST  │
        │  writes a  │  minimal   │ ADVERSARIAL │ RADIUS │
        │  failing   │  patch;    │ review of   │ same   │
        │  test      │  must make │ the diff;   │ bug    │
        │            │  repro     │ separate    │ else-  │
        │            │  pass      │ agent+model │ where? │
        └────────────┴────────────┴─────────────┴────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  EVIDENCE PACKAGE     │  runs/<incident>/
              │  diff · repro test    │  events.jsonl (every tool call)
              │  security verdict     │  report.html
              │  blast radius         │  cost + token accounting
              │  policy rule that fired│
              └───────────────────────┘
                          │
                          ▼
              human approve / reject  ──►  PR  |  dossier  |  reject
                   (hours later — Agent.resume())
```

### The five design decisions you will be asked to defend

1. **The policy gate is deterministic, not a model call.** The LLM is everywhere except the one
   place where being wrong is a regulatory violation. Path globs → zones, in version-controlled
   YAML, reviewable by a compliance officer who doesn't read TypeScript.
2. **Triage is read-only by construction**, via the SDK's `tools` allowlist — not by prompting.
   Capability boundaries you can enforce beat instructions you can only hope are followed.
3. **The security agent is a separate agent with a separate model and no shared context.** The fix
   agent cannot grade its own homework. This costs latency and tokens; it buys independence.
4. **Async by design, resumable.** Real incident response has multi-hour human waits. `Agent.resume()`
   means a run started at 02:00 survives until someone approves it at 09:00, process restarts included.
5. **Everything is data, not code** — zones, agent specs, model routing, prompts. Which is also how
   you survive the live-extension prompt (§7).

---

## 4. The three demo scenarios

Seeded monorepo `demo-repo/regal-gaming-platform/` with planted bugs, one per zone:

| # | Bug | Path / zone | Outcome you demo |
|---|---|---|---|
| 1 | Off-by-one in comp-tier rollover | `services/loyalty/` · **STANDARD** | Happy path. Triage → repro test → fix → tests green → PR. ~4 min. |
| 2 | Full card number written to logs in an error branch | `services/payments/` · **PCI_SCOPE** | Fix is produced; security agent flags a *second* logging path the fix missed; run halts at human gate with an evidence package. |
| 3 | Rounding error in parlay payout | `services/wagering/` · **GAMING_REGULATED** | **Agent refuses to patch.** Emits a change-control dossier: root cause, proposed fix as an *attachment not a commit*, the GLI-33 rule that blocked it, re-cert checklist. |
| 4 | CVE in a transitive dep used by 3 services | cross-cutting | Optional 4th if time allows — blast-radius agent shows the same pattern in two other services nobody filed a ticket for. |

Scenario 3 is the one they'll remember. Build it first, not last.

---

## 5. Day-by-day build plan

### Day 0 — TODAY, blocking, do before anything else
- [ ] Create a **personal** Cursor account at cursor.com (the PDF is explicit: a company-managed
      account restricts models and advanced features).
- [ ] Email that address to your recruiter and ask for the credits they offered. This is a
      *lead-time* item — do not discover on day 6 that you're rate-limited.
- [ ] `npm i @cursor/sdk`, export `CURSOR_API_KEY`, run a 5-line "hello agent" smoke test.
      **Nothing else in this plan is real until this returns text.**

### Days 1–2 — Skeleton + the thing that can't fail
- Seeded demo repo with all four zones and bugs #1 and #3 planted. Commit it; it's demo infrastructure.
- `policy.yaml` + deterministic classifier + unit tests. Runs with no API key. (Scaffolded already.)
- Triage agent working end-to-end on bug #1: structured JSON out, read-only tools enforced.
- **Gate:** by end of day 2 you can run `pitboss triage inc-001` and get correct suspect files.

### Days 3–4 — The fan-out
- Repro, fix, security, blast-radius agents as data-driven specs.
- `Promise.all` orchestration; per-agent model routing; timeouts and max-turn budgets.
- Audit log: every SDK event → `events.jsonl` with timestamps, tool names, token usage.
- **Gate:** bug #1 goes incident → green PR, unattended.

### Day 5 — The refusal path (the money shot)
- Bug #3 end to end: gate blocks, dossier generator runs, output is a document a compliance officer
  would actually accept.
- Make the *refusal* as polished as the fix. This is your differentiator; do not leave it rough.

### Day 6 — PCI path + adversarial review
- Bug #2. Tune the security agent until it reliably catches the second logging path.
- Human gate + `Agent.resume()` across a process restart — demo it by literally killing the process.

### Day 7 — Evidence package + surface
- `report.html` audit report: timeline, diff, verdicts, cost per incident.
- Minimal CLI surface (`pitboss run|approve|reject|replay`). A web dashboard is *nice to have* and
  the first thing on the cut list.

### Day 8 — Evals and numbers
- 8–10 golden incidents. Measure: file-localization precision, did the repro test actually fail
  before and pass after, security-agent false-approve rate, wall-clock and **$ per incident**.
- Real numbers here are disproportionately credible. Most candidates will have none.

### Day 9 — Demo hardening
- Record golden runs; build `--replay` mode that streams saved JSONL at realistic pace.
- Full dry run, timed, out loud, screen shared. Then a second one.
- Prep the extension seams (§7).

### Day 10 — Buffer
- Third dry run. Fix only what the dry runs broke. **Add no features.**

---

## 6. Demo script — 20 minutes

| Time | Beat |
|---|---|
| 0:00–1:30 | **Problem, not product.** 24/7 floor, no maintenance window, regulated code paths, 2am incidents. One sentence on why "agent opens a PR" is not deployable here. |
| 1:30–3:00 | Architecture, one diagram, 90 seconds. Name the policy gate as the load-bearing idea. |
| 3:00–3:30 | **Kick off the live run of scenario 2 in a second terminal, in the background.** Say you're doing it. It cooks while you talk. |
| 3:30–8:00 | **Scenario 1 (STANDARD)** — full auto-remediation, replayed at speed. Show the events log scrolling: this is the audit trail, not decoration. End on the PR. |
| 8:00–13:00 | **Scenario 3 (REGULATED)** — the refusal. Slow down here. Show the policy rule that fired, the dossier, and say plainly: *the agent's most valuable action was declining to act.* |
| 13:00–17:00 | Cut back to the **live** scenario 2 run. Security agent disagrees with the fix agent. Human gate. Kill the process, `Agent.resume()`, approve. |
| 17:00–19:00 | **Limitations, unprompted.** (§8) Cost per incident. What you'd build next. |
| 19:00–20:00 | Hand them the wheel: *"where do you want to take it?"* |

Volunteering the limitations before they ask is worth more than one extra feature.

---

## 7. Live-extension readiness

They *will* ask you to extend it live. Pre-build the seams so each of these is a small, calm edit:

| Likely ask | Your seam | Time |
|---|---|---|
| "Add a new regulatory zone / regulator" | `policy.yaml` — add a block | 2 min |
| "Add another specialist agent" | `agentSpecs` array — one object literal | 5 min |
| "Route this zone to a different model" | already per-spec `model.id` | 1 min |
| "Switch to cloud runtime" | `runtime` config flag, wired from day 1, never hardcoded | 1 min |
| "What if the fix agent loops forever?" | timeout + max-turn budget already stubbed | show, don't build |
| "Make triage able to search Jira/Confluence" | inline `mcpServers` block, stub server ready | 5 min |
| "Handle a second incident source" | ingest adapters keyed by source, one already generic | 5 min |

**Rule: anything you can imagine them asking for should be data, not code.** Rehearse two of these
against a stopwatch on day 9.

---

## 8. Q&A prep — the questions that are coming

- **"Why local runtime, not cloud?"** Local for the demo: deterministic, custom tools and system-prompt
  override are local-only. Cloud is the production answer — isolation from the caller's machine,
  parallel agents without VM management, PR/branch handling built in. Have the flag ready to flip.
- **"Why not let a model classify regulatory scope?"** Because a false negative there is a regulatory
  violation, and a compliance officer must be able to audit the rule without reading TypeScript.
  Models are used for everything judgment-shaped; the boundary itself is code.
- **"How do you know the fix is right?"** The repro test must fail before and pass after — generated
  by a different agent than the one that wrote the fix. Plus adversarial review. It's evidence, not proof.
- **"How do you evaluate this?"** Golden incident set; localization precision; repro validity;
  security false-approve rate; cost and latency per incident. Show your day-8 numbers.
- **"How does this fail?"** (Volunteer these.) A confident wrong fix that passes weak tests. Agents
  thrashing on flaky repros. Over-triggering on noisy alerting. And the one nobody expects:
  **prompt injection through attacker-controlled incident text** — a stack trace or issue body is
  untrusted input, which is another reason triage is read-only and the gate is deterministic.
- **"Scale to 500 repos?"** Policy-as-code checked in per repo, central zone registry, cloud runtime,
  a queue, and per-team budget caps. Cost governance is a real answer, not a hand-wave.
- **"Why not just use Cursor in the IDE?"** Because at 02:00 nobody is in the IDE. The value is the
  asynchronous gap between detection and a human being awake.
- **"What would you cut?"** The dashboard. The evidence package matters; the UI on top of it doesn't.

---

## 9. Risks and the cut list

| Risk | Mitigation |
|---|---|
| Credits/API access not ready | Day 0 item. Blocking. |
| Live agent runs are slow and nondeterministic | Golden recorded runs + `--replay`; one live run started early and returned to. Be transparent that replay is replay. |
| Network flakiness in the room | Everything local, repo committed, no external services beyond Cursor. |
| Scope creep | Cut list, in order: web dashboard → bug #4 → real GitHub PR creation (fake it with a patch file) → blast-radius agent. |
| Demo repo too toy to be credible | Give it real texture: a monorepo layout, a `CODEOWNERS`, a fake CI config, tests that already exist. It should look inherited, not authored. |

**Do not** spend day 10 adding a feature. The dry runs are worth more than anything you'd build with that time.

---

## 10. What "done" looks like

By the morning of the session you can, with no internet beyond Cursor:
1. Run scenario 1 unattended, incident → PR.
2. Run scenario 3 and show the agent refusing, with a document that would satisfy a regulator.
3. Kill the process mid-run and resume it.
4. Quote your cost per incident from real measurements.
5. Extend the system live in under five minutes on any of the seven seams in §7.
