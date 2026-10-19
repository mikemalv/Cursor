import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPolicy, decide, mayAutoRemediate, matches } from "./policy.ts";

const policy = loadPolicy();
const triage = (files: string[], confidence = 0.9) => ({
  incidentId: "test", hypothesis: "", suspectFiles: files, confidence, blastRadiusHint: [],
});

test("glob matching handles ** across segments", () => {
  assert.ok(matches("services/wagering/payout.ts", "services/wagering/**"));
  assert.ok(matches("services/wagering/a/b/c.ts", "services/wagering/**"));
  assert.ok(!matches("services/loyalty/payout.ts", "services/wagering/**"));
  assert.ok(matches("anything/at/all.ts", "**"));
});

test("loyalty code is STANDARD and auto-remediable", () => {
  const d = decide(policy, triage(["services/loyalty/tier-calc.ts"]));
  assert.equal(d.zone.id, "STANDARD");
  assert.ok(mayAutoRemediate(d));
});

test("payments code is PCI_SCOPE: patchable but gated", () => {
  const d = decide(policy, triage(["services/payments/cage-txn.ts"]));
  assert.equal(d.zone.id, "PCI_SCOPE");
  assert.ok(d.zone.actions.requires_human);
  assert.ok(d.zone.actions.mandatory_agents?.includes("security"));
});

test("wagering code is GAMING_REGULATED and must never be patched", () => {
  const d = decide(policy, triage(["services/wagering/payout.ts"]));
  assert.equal(d.zone.id, "GAMING_REGULATED");
  assert.equal(mayAutoRemediate(d), false);
  assert.equal(d.zone.actions.output, "compliance_dossier");
});

test("strictest zone governs a mixed-scope incident", () => {
  const d = decide(policy, triage([
    "services/loyalty/tier-calc.ts",
    "services/payments/cage-txn.ts",
    "services/wagering/payout.ts",
  ]));
  assert.equal(d.zone.id, "GAMING_REGULATED");
  assert.equal(mayAutoRemediate(d), false);
});

test("low triage confidence escalates even in STANDARD", () => {
  const d = decide(policy, triage(["services/loyalty/tier-calc.ts"], 0.3));
  assert.ok(d.escalatedForLowConfidence);
  assert.equal(mayAutoRemediate(d), false);
});

test("forbidden paths block remediation regardless of zone", () => {
  const d = decide(policy, triage([".github/workflows/deploy.yml"]));
  assert.ok(d.forbidden.length > 0);
  assert.equal(mayAutoRemediate(d), false);
});

test("refuses to decide with no suspect files", () => {
  assert.throws(() => decide(policy, triage([])));
});
