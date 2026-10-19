import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffContracts, isWidening, parseType, similarity } from "./changeset.ts";
import { loadPolicy, verdictFor, mayAutomate } from "./policy.ts";
import { buildPlan } from "./rollout.ts";
import type { Change, ConsumerRef } from "./types.ts";

const before = JSON.parse(readFileSync("contracts/before.json", "utf8"));
const after = JSON.parse(readFileSync("contracts/after.json", "utf8"));
const changes = diffContracts(before, after);
const policy = loadPolicy();
const find = (col: string) => changes.find((c) => c.column === col)!;

test("type parsing and widening", () => {
  assert.deepEqual(parseType("NUMBER(18,2)"), { family: "NUMBER", p: 18, s: 2 });
  assert.ok(isWidening("NUMBER(10,2)", "NUMBER(18,2)"));
  assert.ok(isWidening("VARCHAR(16)", "VARCHAR(64)"));
  assert.ok(!isWidening("VARCHAR(64)", "VARCHAR(16)"));
  assert.ok(!isWidening("FLOAT", "NUMBER(18,2)"), "cross-family is never assumed safe");
  assert.ok(!isWidening("NUMBER(18,2)", "NUMBER(18,6)"), "integral digits must not shrink");
});

test("explicit rename is detected with full confidence", () => {
  const c = find("TIER_CODE");
  assert.equal(c.cls, "RENAME_COLUMN");
  assert.equal(c.from, "TIER_CD");
  assert.equal(c.confidence, 1);
});

test("drop, add, narrowing retype and nullability tighten are all classified", () => {
  assert.equal(find("HOST_ID").cls, "DROP_COLUMN");
  assert.equal(find("SEGMENT_CD").cls, "ADD_COLUMN");
  assert.equal(find("THEO_WIN").cls, "RETYPE_NARROWING");
  assert.equal(find("COMP_POINTS").cls, "NULLABILITY_TIGHTEN");
});

test("destructive changes are not automated", () => {
  for (const col of ["HOST_ID", "THEO_WIN", "COMP_POINTS"]) {
    assert.equal(verdictFor(policy, find(col)).automate, false, col);
  }
  assert.equal(verdictFor(policy, find("SEGMENT_CD")).automate, true);
});

test("an inferred rename below the confidence floor is refused", () => {
  const inferred: Change = { ...find("TIER_CODE"), confidence: 0.74 };
  const v = verdictFor(policy, inferred);
  assert.equal(v.automate, false);
  assert.match(v.reason, /confidence/);
});

test("a SOX-scoped repo blocks automation even for a safe change", () => {
  assert.equal(mayAutomate(policy, find("SEGMENT_CD"), "analytics-dbt").automate, true);
  assert.equal(mayAutomate(policy, find("SEGMENT_CD"), "svc-reporting").automate, false);
});

const refs: ConsumerRef[] = [
  { repo: "analytics-dbt", file: "models/player_daily.sql", kind: "dbt_model", column: "HOST_ID" },
  { repo: "svc-loyalty",   file: "src/repo.ts",             kind: "embedded_sql", column: "HOST_ID" },
  { repo: "bi-semantic",   file: "player.yaml",             kind: "semantic_yaml", column: "HOST_ID" },
  { repo: "svc-reporting", file: "src/mart.ts",             kind: "orm_mapping",  column: "HOST_ID" },
];

test("the drop is sequenced strictly after every consumer migration", () => {
  const plan = buildPlan(policy, [find("HOST_ID")], refs);
  const drop = plan.find((s) => s.kind === "producer_destructive")!;
  const consumers = plan.filter((s) => s.change.column === "HOST_ID" && s.kind !== "producer_destructive");
  assert.equal(consumers.length, 4);
  for (const c of consumers) assert.ok(c.wave! < drop.wave!, `${c.id} must precede the drop`);
});

test("the SOX repo lands as a manual gate, not a PR", () => {
  const plan = buildPlan(policy, [find("HOST_ID")], refs);
  const sox = plan.find((s) => s.repo === "svc-reporting")!;
  assert.equal(sox.kind, "manual_gate");
  assert.equal(sox.automated, false);
});

test("a rename ships a compatibility view before consumers migrate", () => {
  const plan = buildPlan(policy, [find("TIER_CODE")],
    [{ repo: "analytics-dbt", file: "m.sql", kind: "dbt_model", column: "TIER_CD" }]);
  const shim = plan.find((s) => s.kind === "producer_additive")!;
  const consumer = plan.find((s) => s.repo === "analytics-dbt")!;
  const retire = plan.find((s) => s.kind === "producer_destructive")!;
  assert.ok(shim.wave! < consumer.wave!);
  assert.ok(consumer.wave! < retire.wave!);
});

test("similarity powers rename inference", () => {
  assert.ok(similarity("TIER_CD", "TIER_CODE") >= 0.6);
  assert.ok(similarity("HOST_ID", "SEGMENT_CD") < 0.6);
});

test("a DROP is unautomatable at the producer but automatable at every standard consumer", () => {
  const drop = find("HOST_ID");
  assert.equal(verdictFor(policy, drop).automate, false, "producer drop must stay manual");
  assert.equal(mayAutomate(policy, drop, "analytics-dbt").automate, true, "consumer removal is mechanical");
  assert.equal(mayAutomate(policy, drop, "svc-loyalty").automate, true);
  assert.equal(mayAutomate(policy, drop, "svc-reporting").automate, false, "SOX repo still gated");
});

test("narrowing stays manual on both sides", () => {
  const nar = find("THEO_WIN");
  assert.equal(verdictFor(policy, nar).automate, false);
  assert.equal(mayAutomate(policy, nar, "analytics-dbt").automate, false);
  assert.match(mayAutomate(policy, nar, "analytics-dbt").reason, /profiled/);
});

test("no rollout step renders an undefined in its summary", () => {
  const plan = buildPlan(policy, changes, refs);
  for (const s of plan) assert.ok(!/undefined/.test(s.summary), `${s.id}: ${s.summary}`);
});
