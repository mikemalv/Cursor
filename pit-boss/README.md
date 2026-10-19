# Pit Boss

**Governed incident-to-remediation for regulated casino gaming platforms.**
Built on the Cursor SDK. Technical-exercise prototype — see [PLAN.md](./PLAN.md).

---

The fix is not the hard part. Routing the fix through a governance boundary is.

Pit Boss takes a production incident, triages it with a **read-only** agent, passes the result
through a **deterministic policy gate**, and only then decides whether any agent is permitted to
write a single byte:

| Zone | Authority | Outcome |
|---|---|---|
| `GAMING_REGULATED` | NV Reg 14 / GLI-33 | **No patching.** Compliance dossier. |
| `PCI_SCOPE` | PCI-DSS v4.0 | Patch + mandatory adversarial review + human gate. |
| `STANDARD` | Internal | Full auto-remediation → PR. |

The policy gate contains no model call and never should. A false negative there is a regulatory
violation, and a compliance officer has to be able to audit the rule without reading TypeScript.

## Quick start

```bash
cp .env.example .env          # personal Cursor account key, NOT a company-managed one
npm install
npm run test:policy           # 8 tests, no API key needed  ✅ verified passing
npm run policy                # classify every fixture through the gate, no API key
npm run smoke                 # DAY 0 GATE: proves the SDK + key + credits work
npm run run inc-001-loyalty   # full pipeline
```

## Layout

```
.pitboss/policy.yaml     the load-bearing design decision: paths -> regulatory zones
src/policy.ts            deterministic gate  (verified: 8/8 tests pass)
src/agents/specs.ts      the specialist fan-out, as DATA -- adding one is an object literal
src/pipeline.ts          triage -> gate -> parallel fan-out -> evidence package
src/audit.ts             append-only trail of every tool call + token accounting
demo-repo/               seeded casino monorepo with one planted bug per zone
fixtures/incidents/      four incidents, one per demo scenario
runs/<incident>/         events.jsonl, EVIDENCE.md or DOSSIER.md
```

## Status

- ✅ Policy gate: implemented and unit-tested end to end, runs with no credentials.
- ✅ Demo repo: three planted bugs, one per zone (bug #2 has a deliberate second
  PAN-logging path that a naive fix will miss — that is the security agent's moment).
- ⚠️ `pipeline.ts` is written against the documented SDK surface but **has not been executed
  against live credentials**. Day 0 is `npm run smoke`; expect to adjust event/stream shapes
  and the `customTools` signature against the real API before anything else in PLAN.md is real.
- ⛔ Not yet built: repro/fix/security agents proven end to end, `Agent.resume()` human gate,
  HTML audit report, `--replay` mode, evals.
