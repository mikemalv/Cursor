import type { Change, ConsumerRef, DriftPolicy, Step } from "./types.ts";
import { affectedColumns } from "./changeset.ts";
import { mayAutomate, verdictFor } from "./policy.ts";

/**
 * ---------------------------------------------------------------------------
 * THE SEQUENCER  --  the actual hard part of this problem.
 *
 * Generating each repo's patch is the easy half. The half that makes this a real
 * enterprise workflow is ORDER: you cannot drop a column until every consumer of
 * it has merged, and you cannot merge a consumer until the compatibility shim
 * exists. The output is therefore a sequenced rollout plan, not a pile of PRs.
 *
 * Deterministic, and enforced here rather than hoped for in a prompt.
 * ---------------------------------------------------------------------------
 */
export function buildPlan(policy: DriftPolicy, changes: Change[], refs: ConsumerRef[]): Step[] {
  const steps: Step[] = [];
  const key = (c: Change) => `${c.object}.${c.column}`;

  for (const c of changes) {
    const cols = new Set(affectedColumns(c).map((x) => x.toUpperCase()));
    const touched = refs.filter(
      (r) => r.column && cols.has(r.column.toUpperCase()),
    );
    const repos = [...new Set(touched.map((r) => r.repo))].sort();
    const v = verdictFor(policy, c);

    // --- producer side, additive half (safe to land first) --------------------
    let additiveId: string | undefined;
    if (c.cls === "ADD_COLUMN" || c.cls === "RETYPE_WIDENING" || c.cls === "NULLABILITY_RELAX" || v.requiresCompatView) {
      additiveId = `producer:additive:${key(c)}`;
      steps.push({
        id: additiveId, kind: "producer_additive", change: c, automated: v.automate,
        output: "pull_request", needs: [],
        summary: v.requiresCompatView
          ? `Ship compatibility view exposing both ${c.from} and ${c.column} so consumers can migrate independently`
          : `Apply additive change: ${c.detail}`,
      });
    }

    // --- one migration step per consuming repo --------------------------------
    const consumerIds: string[] = [];
    for (const repo of repos) {
      const m = mayAutomate(policy, c, repo);
      const id = `consumer:${repo}:${key(c)}`;
      consumerIds.push(id);
      const files = touched.filter((r) => r.repo === repo);
      steps.push({
        id, kind: m.automate ? "consumer_migration" : "manual_gate", repo, change: c,
        automated: m.automate, output: m.output,
        needs: additiveId ? [additiveId] : [],
        summary: `${repo}: update ${files.length} reference(s) (${[...new Set(files.map((f) => f.kind))].join(", ")}) — ${m.reason}`,
      });
    }

    // --- producer side, destructive half (must go last) -----------------------
    if (c.destructive || c.cls === "RENAME_COLUMN") {
      steps.push({
        id: `producer:destructive:${key(c)}`, kind: "producer_destructive", change: c,
        automated: false,
        output: c.cls === "DROP_COLUMN" ? "deprecation_plan" : "migration_plan",
        // THE GUARDRAIL: blocked behind every consumer, automated or not.
        needs: policy.guardrails.block_destructive_until_consumers_merged
          ? [...consumerIds, ...(additiveId ? [additiveId] : [])]
          : [],
        summary:
          c.cls === "DROP_COLUMN"
            ? `Drop ${c.column}. Blocked until all ${consumerIds.length} consumer migration(s) have merged.`
            : c.cls === "RENAME_COLUMN"
              ? `Retire the compatibility view and the old name ${c.from}.`
              : `Apply ${c.detail}. Blocked until all ${consumerIds.length} consumer migration(s) have merged.`,
      });
    }
  }

  return assignWaves(steps);
}

/** Kahn's algorithm, grouped into waves. Everything in a wave can run in parallel. */
export function assignWaves(steps: Step[]): Step[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const remaining = new Set(steps.map((s) => s.id));
  let wave = 1;
  while (remaining.size) {
    const ready = [...remaining].filter((id) =>
      byId.get(id)!.needs.every((n) => !remaining.has(n) || !byId.has(n)));
    if (!ready.length) throw new Error("cycle in rollout plan: " + [...remaining].join(", "));
    for (const id of ready) { byId.get(id)!.wave = wave; remaining.delete(id); }
    wave++;
  }
  return steps.sort((a, b) => (a.wave! - b.wave!) || a.id.localeCompare(b.id));
}

export function renderPlan(steps: Step[]): string {
  const waves = [...new Set(steps.map((s) => s.wave!))].sort((a, b) => a - b);
  const lines: string[] = ["# Rollout plan", ""];
  for (const w of waves) {
    const inWave = steps.filter((s) => s.wave === w);
    lines.push(`## Wave ${w}  (${inWave.length} step(s), safe to run in parallel)`, "");
    for (const s of inWave) {
      const tag = s.automated ? "AUTO" : "HUMAN";
      lines.push(`- **[${tag}]** \`${s.id}\` → *${s.output}*`);
      lines.push(`  - ${s.summary}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
