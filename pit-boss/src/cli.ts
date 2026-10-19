#!/usr/bin/env tsx
import { readFileSync, readdirSync } from "node:fs";
import { decide, loadPolicy } from "./policy.ts";
import type { Incident } from "./types.ts";

const [, , cmd, arg] = process.argv;
const incident = (id: string): Incident =>
  JSON.parse(readFileSync(`fixtures/incidents/${id}.json`, "utf8"));

switch (cmd) {
  /** Dry-run the gate with NO API key. Fast, deterministic, demo-safe. */
  case "policy": {
    const policy = loadPolicy();
    const ids = arg ? [arg] : readdirSync("fixtures/incidents").map((f) => f.replace(/\.json$/, ""));
    for (const id of ids) {
      const inc = incident(id);
      const d = decide(policy, {
        incidentId: id,
        hypothesis: "(dry run)",
        suspectFiles: (inc as any).expectedSuspectFiles ?? [],
        confidence: 0.9,
        blastRadiusHint: [],
      });
      console.log(`\n${id}  ${inc.title}`);
      console.log(`  -> ${d.zone.id}  (${d.zone.actions.output})`);
      console.log(`  ${d.explanation}`);
    }
    break;
  }
  case "run": {
    const { handleIncident } = await import("./pipeline.ts");
    await handleIncident(incident(arg!));
    break;
  }
  case "triage": {
    const { triage } = await import("./pipeline.ts");
    const { AuditLog } = await import("./audit.ts");
    console.log(await triage(incident(arg!), new AuditLog(arg!)));
    break;
  }
  default:
    console.log(`pit-boss
  policy [id]   classify fixtures through the gate (no API key needed)
  triage <id>   run the read-only triage agent only
  run <id>      full pipeline
`);
}
