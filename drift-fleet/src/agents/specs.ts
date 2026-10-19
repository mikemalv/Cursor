import type { Change, ConsumerPolicy } from "../types.ts";

/**
 * Agents as data, same as pit-boss. Three roles, and the read-only ones are
 * read-only via the SDK tool allowlist rather than via the prompt.
 */
export interface FleetAgentSpec {
  id: string;
  model: string;
  tools?: string[];
  maxTurns: number;
  timeoutMs: number;
}

export const SCOUT: FleetAgentSpec = {
  id: "scout", model: "composer-2.5",
  tools: ["read", "grep", "ls"],            // cannot mutate a consumer repo
  maxTurns: 20, timeoutMs: 4 * 60_000,
};

export const MIGRATE: FleetAgentSpec = {
  id: "migrate", model: "composer-2.5",
  maxTurns: 40, timeoutMs: 10 * 60_000,
};

export const VERIFY: FleetAgentSpec = {
  id: "verify", model: "auto-smart",        // different model, no shared context
  tools: ["read", "grep", "ls"],
  maxTurns: 20, timeoutMs: 5 * 60_000,
};

export const scoutPrompt = (object: string, columns: string[]) => `
READ-ONLY survey of this repository. Change nothing.

Find every place that references the warehouse object ${object}, specifically the
column(s): ${columns.join(", ")}.

Look in all of these, not just the obvious one:
  - dbt models and their schema.yml / sources
  - ORM models, entity or column mappings
  - SQL embedded in application code, including strings built at runtime
  - semantic model YAML, metric and dimension definitions
  - BI query definitions, fixtures, and seed data

Column names may appear lower-cased, quoted, aliased, or interpolated. A reference
inside a string literal counts.

Call emit_refs exactly once with an array of:
  file, line, kind (dbt_model | orm_mapping | embedded_sql | semantic_yaml | unknown),
  column, snippet
`.trim();

export const migratePrompt = (c: Change, cp: ConsumerPolicy, refs: unknown[]) => `
Apply one warehouse schema change to this repository.

Change: ${c.detail}
Object:  ${c.object}
Repo kind: ${cp.kind}

Known references (from the read-only scout pass):
${JSON.stringify(refs, null, 2)}

Rules:
- Update ONLY what this change requires. No drive-by refactors, no formatting sweeps.
${c.from ? `- The column is renamed from ${c.from} to ${c.column}. A compatibility view exposing
  both names is already live, so this repo can migrate independently.\n` : ""}- Run this repository's own test suite and leave it green.
- If you find a reference the scout missed, fix it and say so explicitly in your summary.

Finish with a summary listing every file changed and why.
`.trim();

export const verifyPrompt = (c: Change) => `
READ-ONLY verification of the working-tree diff. Assume it is incomplete.

The change being applied: ${c.detail}

Confirm, citing file and line for each:
1. Does any reference to ${c.from ?? c.column} remain anywhere, including inside string
   literals, comments that drive codegen, fixtures, and test data?
2. Did the diff change any behaviour beyond this schema migration?
3. Would this repository still build and pass its tests?

End with exactly one line: VERDICT: PASS or VERDICT: FAIL -- <reason>.
`.trim();
