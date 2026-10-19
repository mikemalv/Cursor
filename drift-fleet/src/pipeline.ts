import { Agent } from "@cursor/sdk";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffContracts, affectedColumns } from "./changeset.ts";
import { loadPolicy, consumerPolicy, mayAutomate } from "./policy.ts";
import { buildPlan, renderPlan } from "./rollout.ts";
import { SCOUT, MIGRATE, VERIFY, scoutPrompt, migratePrompt, verifyPrompt } from "./agents/specs.ts";
import type { ConsumerRef, Change } from "./types.ts";

const RUNTIME = process.env.DRIFT_RUNTIME ?? "local";
const REPOS_ROOT = process.env.DRIFT_REPOS ?? "./demo-repos";
const KEY = () => process.env.CURSOR_API_KEY!;

/**
 * Cloud runtime is the honest production answer here: one isolated agent per
 * consumer repo, in parallel, without the orchestrator holding checkouts of all
 * of them. Local is for the demo. Never hardcode it.
 */
const runtimeFor = (repo: string) =>
  RUNTIME === "cloud"
    ? { cloud: { repository: `${process.env.DRIFT_CLOUD_ORG}/${repo}` } }
    : { local: { cwd: join(REPOS_ROOT, repo) } };

/* ---------------- STAGE 2: read-only scout fan-out, one agent per repo -------- */
export async function scoutRepo(repo: string, object: string, columns: string[]): Promise<ConsumerRef[]> {
  let found: ConsumerRef[] = [];
  const agent = await Agent.create({
    apiKey: KEY(),
    model: { id: SCOUT.model },
    tools: SCOUT.tools,
    local: {
      cwd: join(REPOS_ROOT, repo),
      customTools: {
        emit_refs: {
          description: "Report every reference found. Call exactly once, then stop.",
          execute: async ({ refs }: any) => {
            found = (refs ?? []).map((r: any) => ({ ...r, repo }));
            return `recorded ${found.length}`;
          },
        },
      },
    },
  });
  const run = await agent.send(scoutPrompt(object, columns));
  for await (const _ of run.stream()) { /* audit hook goes here */ }
  return found;
}

/* ---------------- STAGE 4: per-repo migration + independent verification ------ */
async function migrateRepo(repo: string, c: Change, refs: ConsumerRef[]) {
  const policy = loadPolicy();
  const cp = consumerPolicy(policy, repo);

  const worker = await Agent.create({ apiKey: KEY(), model: { id: MIGRATE.model }, ...runtimeFor(repo) });
  const run = await worker.send(migratePrompt(c, cp, refs));
  const out: string[] = [];
  for await (const ev of run.stream()) if (ev.type === "assistant") out.push(String(ev.message?.content ?? ""));

  // Separate agent, separate model, no shared context -- it cannot grade its own work.
  const checker = await Agent.create({ apiKey: KEY(), model: { id: VERIFY.model }, tools: VERIFY.tools, ...runtimeFor(repo) });
  const vrun = await checker.send(verifyPrompt(c));
  const vout: string[] = [];
  for await (const ev of vrun.stream()) if (ev.type === "assistant") vout.push(String(ev.message?.content ?? ""));

  return { repo, migration: out.join(""), verification: vout.join("") };
}

/* -------------------------------- ORCHESTRATOR ------------------------------- */
export async function runDrift(beforeFile = "contracts/before.json", afterFile = "contracts/after.json") {
  const policy = loadPolicy();
  const before = JSON.parse(readFileSync(beforeFile, "utf8"));
  const after = JSON.parse(readFileSync(afterFile, "utf8"));

  // 1. deterministic: what actually changed
  const changes = diffContracts(before, after);
  console.log(`\n  ${changes.length} schema change(s) detected\n`);

  // 2. read-only fan-out across every registered consumer repo, in parallel
  const object = Object.keys(after.objects)[0]!;
  const columns = [...new Set(changes.flatMap(affectedColumns))];
  const refs = (await Promise.all(
    policy.consumers.map((c) => scoutRepo(c.repo, object, columns).catch(() => [] as ConsumerRef[])),
  )).flat();
  console.log(`  ${refs.length} reference(s) across ${policy.consumers.length} repo(s)\n`);

  // 3. deterministic: what order this has to happen in
  const plan = buildPlan(policy, changes, refs);
  const dir = join("runs", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ROLLOUT.md"), renderPlan(plan));
  console.log(renderPlan(plan));

  // 4. execute only the automated steps, wave by wave, in dependency order
  const results: unknown[] = [];
  for (const wave of [...new Set(plan.map((s) => s.wave!))].sort((a, b) => a - b)) {
    const auto = plan.filter((s) => s.wave === wave && s.automated && s.kind === "consumer_migration");
    if (!auto.length) continue;
    console.log(`  wave ${wave}: ${auto.length} repo migration(s) in parallel`);
    results.push(...await Promise.all(auto.map((s) =>
      migrateRepo(s.repo!, s.change, refs.filter((r) => r.repo === s.repo)))));
  }

  writeFileSync(join(dir, "results.json"), JSON.stringify({ changes, refs, plan, results }, null, 2));
  console.log(`\n  Plan and evidence: ${dir}\n`);
  return { changes, refs, plan, results, dir };
}
