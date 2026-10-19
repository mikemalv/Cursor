# Drift Fleet — build & demo plan

**Alternate technical-exercise build. Problem space: bring-your-own (D), sitting on the
seam between the repository and the data platform.**

---

## 1. Why this one is worth considering over Pit Boss

Pit Boss is the safer build: incident response is a universal enterprise problem and the
governance thesis lands with any audience. Drift Fleet is the *differentiated* build.

- **Nobody else interviewing can build it.** It requires knowing what a semantic model
  YAML is, why a dbt source contract matters, and that the scariest consumer of a table
  is the one that isn't in dbt at all. That's fifteen years of data-platform pre-sales.
- **The problem is real and unowned.** Every data org has been burned by a column change
  breaking something nobody knew existed. Nobody automates it, because the automation is
  cross-repo and the coordination is the hard part.
- **It shows off the thing Cursor actually sells** — cloud runtime, one isolated agent per
  repo, in parallel. Local-only agent SDKs stop at one repo on one laptop.

The risk: it's a data-flavored problem for an audience that may be pure software
engineering. Mitigation is in the framing — open on "seven repos reference this column
and nobody knows which seven," which is a dependency problem, not a Snowflake problem.

## 2. The one idea

> Generating each repo's patch is the easy half. **Order is the workflow.**

You cannot drop a column until every consumer has merged. You cannot migrate a consumer
until the compatibility shim is live. So the deliverable is a sequenced rollout plan —
a dependency graph resolved into waves — and the destructive step is structurally
blocked behind every consumer migration.

## 3. Architecture

```
warehouse contract (before / after snapshots)
        │
        ▼
╔═══════════════════╗   DETERMINISTIC. You compute what changed; you do not ask
║  DIFFER           ║   a model. Type widening proved, not guessed. Renames from
║  changeset.ts     ║   ALTER history at confidence 1.0, or inferred below it.
╚═══════════════════╝
        │  ADD | DROP | RENAME | RETYPE_{WIDENING,NARROWING} | NULLABILITY_{TIGHTEN,RELAX}
        ▼
┌───────────────────────────────────────────────────┐
│  SCOUT FAN-OUT  — one read-only agent per repo,   │  tools: ["read","grep","ls"]
│  in parallel. dbt models, ORM mappings, embedded  │  structured output via custom tool
│  SQL, semantic YAML, dashboards, seeds, fixtures. │
└───────────────────────────────────────────────────┘
        │  ConsumerRef[]
        ▼
╔═══════════════════╗   change class × repo criticality → automate?
║  POLICY           ║   producer and consumer automation decided SEPARATELY
╚═══════════════════╝
        │
        ▼
╔═══════════════════╗   Kahn's algorithm → waves.
║  SEQUENCER        ║   producer_additive → consumer_migration* → producer_destructive
║  rollout.ts       ║   The guardrail lives here, not in a prompt.
╚═══════════════════╝
        │
        ▼
  per wave: parallel migrate agents (one per repo)
            + an independent verify agent per repo, different model, no shared context
        │
        ▼
  ROLLOUT.md + per-repo PRs + change dossiers for gated repos
```

## 4. The demo, and the three beats

Seeded change: `TIER_CD` renamed, `HOST_ID` dropped, `THEO_WIN` FLOAT → NUMBER(18,2),
`COMP_POINTS` made NOT NULL, `SEGMENT_CD` added.

| Beat | What happens | Why it lands |
|---|---|---|
| **1. The invisible consumer** | Scouts return references from `svc-loyalty/sql/nightly_export.sql` — a legacy export that no dbt model and no ORM mapping references. | This is the failure every data engineer in the room has personally lived through. |
| **2. The sequencing** | The plan comes back in three waves. The `HOST_ID` drop sits in wave 2, explicitly *"blocked until all 4 consumer migrations have merged."* | The system knows the drop is not a PR, it's the last step of a campaign. |
| **3. The refusal** | `svc-reporting` is SOX-scoped. Every change to it comes back as a change dossier, never a PR — even the trivially safe ones. `THEO_WIN` narrowing is refused everywhere until someone profiles the column. | Same instinct as Pit Boss: the agent's most valuable action is declining to act. |

Demo-safety: `npm run plan` produces the entire rollout from recorded scout output with
no API key and no agents. It is byte-identical every run. Show that first, then run the
live scout fan-out.

## 5. Ten-day plan

| Day | Work |
|---|---|
| **0** | Personal Cursor account, credits from the recruiter, SDK smoke test. Blocking. |
| 1 | Contracts, differ, policy, sequencer, unit tests. **Already scaffolded and passing.** |
| 2 | Four demo repos with real texture — dbt project layout, a service, semantic YAML, a SOX mart. Plant the invisible consumer. **Already scaffolded.** |
| 3 | Scout agent end to end on one repo. Structured output via custom tool. Tune until it finds the `.sql` export. |
| 4 | Scout fan-out in parallel across all four. Audit log, token accounting. |
| 5 | Migrate agent for the rename on one repo, tests green. |
| 6 | Verify agent — separate model, no shared context. Prove it catches a reference the migrate agent missed by planting one. |
| 7 | Wave execution: parallel migrations, dossier generation for the gated repo, `ROLLOUT.md` output. |
| 8 | Evals: scout recall against a hand-labelled reference set (the single most important number here), migration correctness, cost per change. |
| 9 | Recorded golden runs, replay mode, two timed dry runs. |
| 10 | Buffer. Third dry run. No new features. |

## 6. Questions they will ask

- **"How do you know the scout found everything?"** You don't, and that's why scout recall
  against a hand-labelled set is the headline eval metric. It's also why the destructive
  step is gated behind human confirmation rather than a recall threshold — a missed
  consumer becomes a broken dashboard, not a dropped column.
- **"Why not just parse the SQL?"** For dbt and ORM mappings you should, and static
  analysis is the right first pass. The agent earns its place on the long tail: SQL built
  at runtime, column lists in arrays, references inside JSON dashboard definitions, seeds.
- **"Where does the contract come from?"** `INFORMATION_SCHEMA` snapshots on a schedule, or
  the ALTER history. The prototype uses committed JSON so the demo is deterministic.
- **"What if two repos conflict?"** They can't, in this model — each agent works in its own
  repo. Cross-repo conflict is a *sequencing* problem, which is what the DAG solves.
- **"Cloud or local runtime?"** Cloud, unambiguously, for the real thing: one isolated
  agent per repo without the orchestrator holding twelve checkouts. Local for the demo.
- **"What's the blast radius if it's wrong?"** A bad consumer PR is caught in review. The
  irreversible action — the drop — is never taken by the system at all.

## 7. If you build both

Don't, in ten days. But the two-minute version of this one is a superb answer to *"how
would you evolve it?"* at the end of the Pit Boss demo: same five stages, different
signal, different policy file. That reframes Pit Boss from a demo into a pattern.
