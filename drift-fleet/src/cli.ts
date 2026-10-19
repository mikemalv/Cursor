#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { diffContracts, affectedColumns } from "./changeset.ts";
import { loadPolicy, mayAutomate } from "./policy.ts";
import { buildPlan, renderPlan } from "./rollout.ts";
import type { ConsumerRef } from "./types.ts";

const [, , cmd] = process.argv;
const load = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const changes = () => diffContracts(load("contracts/before.json"), load("contracts/after.json"));

switch (cmd) {
  /** Deterministic changeset. No API key. */
  case "diff": {
    for (const c of changes()) {
      console.log(`  ${c.cls.padEnd(20)} ${c.column.padEnd(14)} conf=${c.confidence}  ${c.detail}`);
    }
    break;
  }
  /**
   * Full rollout plan from a FIXTURE reference set -- no API key, no agents.
   * This is the demo-safe path and the thing to show first: the sequencing is
   * deterministic, so it is identical every single time you run it.
   */
  case "plan": {
    const policy = loadPolicy();
    const refs: ConsumerRef[] = load("fixtures/refs.json");
    console.log(renderPlan(buildPlan(policy, changes(), refs)));
    break;
  }
  case "scout": {
    const { scoutRepo } = await import("./pipeline.ts");
    const cs = changes();
    const cols = [...new Set(cs.flatMap(affectedColumns))];
    console.log(await scoutRepo(process.argv[3]!, "ANALYTICS.PLAYER_ACTIVITY", cols));
    break;
  }
  case "run": {
    const { runDrift } = await import("./pipeline.ts");
    await runDrift();
    break;
  }
  default:
    console.log(`drift-fleet
  diff          deterministic changeset from the two contracts (no API key)
  plan          full sequenced rollout plan from fixture refs (no API key)
  scout <repo>  read-only reference discovery in one repo
  run           full fleet: scout fan-out -> plan -> parallel migrations
`);
}
