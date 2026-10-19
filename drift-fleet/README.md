# Drift Fleet

**Warehouse schema drift → cross-repo code migration, sequenced.**
Built on the Cursor SDK. Alternate technical-exercise build — see [PLAN.md](./PLAN.md).

---

A column in `ANALYTICS.PLAYER_ACTIVITY` is renamed, retyped and dropped. Seven repos
reference it and nobody knows which seven. Drift Fleet diffs the warehouse contract,
fans read-only scouts across every consumer repo, and produces a **sequenced rollout
plan** — because the hard part is not writing each patch, it's the order.

```bash
npm install
npm run test:core     # 13 tests, no API key   ✅ verified passing
npm run diff          # deterministic changeset from the two contracts
npm run plan          # full sequenced rollout plan from fixture refs — no agents, no key
npm run scout svc-loyalty   # read-only reference discovery in one repo
npm run run           # full fleet
```

## The one idea

> Generating each repo's patch is the easy half. **Order is the workflow.**
> You cannot drop a column until every consumer has merged, and you cannot migrate a
> consumer until the compatibility shim exists.

So the output is a dependency graph resolved into waves, and the destructive producer
step is structurally blocked behind every consumer migration — enforced by the
sequencer, not hoped for in a prompt.

## Producer vs. consumer automation

The distinction that makes this useful rather than toothless:

| Change | Producer side | Consumer side |
|---|---|---|
| `DROP_COLUMN` | never automated — irreversible | **automated** — removing a reference is mechanical, and it's the work that unblocks the drop |
| `RENAME_COLUMN` | automated, ships a compat view first | automated, once confirmed by ALTER history |
| `RETYPE_NARROWING` | manual — values may not be representable | manual — needs a data profile first |
| `NULLABILITY_TIGHTEN` | manual — needs a writer audit | manual |
| `ADD_COLUMN` | automated | nothing to do |

Conflating those two columns is what turns a drift tool into one that does nothing on
the change class where it would have helped most.

## Layout

```
contracts/{before,after}.json   warehouse snapshots — the source of truth, outside the code
.driftfleet/policy.yaml         change class → automation; repo → criticality
src/changeset.ts                deterministic differ, incl. type widening + rename inference
src/policy.ts                   producer/consumer automation verdicts
src/rollout.ts                  the sequencer — DAG → waves       ← the interesting file
src/agents/specs.ts             scout (read-only), migrate, verify (separate model)
src/pipeline.ts                 scout fan-out → plan → parallel per-repo migrations
demo-repos/                     four consumers: dbt, service, semantic model, SOX mart
fixtures/refs.json              recorded scout output, so `plan` runs with no API key
```

## Status

- ✅ Differ, policy and sequencer: implemented, **13/13 tests passing**, no credentials needed.
- ✅ Demo repos: four consumers, including a legacy `.sql` export that no ORM or dbt
  model references — the one a naive grep misses.
- ⚠️ `pipeline.ts` written against the documented SDK surface, **not yet run against live
  credentials**. Same day-0 gate as pit-boss.
- ⛔ Not built: scout agents proven end to end, real PR creation, HTML plan renderer,
  cost accounting, evals.

## Relationship to pit-boss

Same five-stage pipeline — signal → read-only analysis → deterministic gate → parallel
specialists → evidence. Different signal, different policy file. That reuse is the
point, and it's the strongest thing to say out loud in either demo.
