import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Policy, PolicyDecision, TriageResult, Zone, ZoneId } from "./types.ts";

/**
 * ---------------------------------------------------------------------------
 * THE POLICY GATE
 *
 * Deterministic on purpose. No model call happens in this file and none ever
 * should. A false negative here is not a bad suggestion, it is a regulatory
 * violation -- so the boundary is code a compliance officer can audit, and the
 * model is used only for judgment-shaped work on either side of it.
 * ---------------------------------------------------------------------------
 */

/** Minimal glob -> RegExp. Supports **, *, ? . No dependency, fully inspectable. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // '**/' matches zero or more path segments; bare '**' matches anything
        if (glob[i + 2] === "/") { out += "(?:.*/)?"; i += 2; } else { out += ".*"; i += 1; }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c!)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp("^" + out + "$");
}

export function matches(path: string, glob: string): boolean {
  return globToRegExp(glob).test(normalize(path));
}

function normalize(p: string): string {
  return p.replace(/^\.\//, "").replace(/^\/+/, "");
}

export function loadPolicy(file = ".pitboss/policy.yaml"): Policy {
  return parse(readFileSync(file, "utf8")) as Policy;
}

/** First matching zone wins; zones are ordered most-specific-first in the YAML. */
export function zoneForPath(policy: Policy, path: string): { zone: Zone; glob: string } {
  for (const zone of policy.zones) {
    for (const glob of zone.paths) {
      if (matches(path, glob)) return { zone, glob };
    }
  }
  const fallback = policy.zones.find((z) => z.id === policy.default_zone);
  if (!fallback) throw new Error(`default_zone ${policy.default_zone} not defined in policy`);
  return { zone: fallback, glob: "<default>" };
}

/** Zone severity ordering: an incident touching several zones is governed by the strictest. */
const STRICTNESS: Record<string, number> = { GAMING_REGULATED: 3, PCI_SCOPE: 2, STANDARD: 1 };
const strictness = (id: ZoneId) => STRICTNESS[id as string] ?? 0;

export function decide(policy: Policy, triage: TriageResult): PolicyDecision {
  if (triage.suspectFiles.length === 0) {
    throw new Error("policy gate refuses to decide with no suspect files -- escalate to a human");
  }

  const perFile = triage.suspectFiles.map((path) => {
    const { zone, glob } = zoneForPath(policy, path);
    return { path: normalize(path), zoneId: zone.id, glob };
  });

  // Strictest zone across all touched files governs the whole incident.
  let winner = perFile[0]!;
  for (const f of perFile) {
    if (strictness(f.zoneId) > strictness(winner.zoneId)) winner = f;
  }
  const zone = policy.zones.find((z) => z.id === winner.zoneId)!;

  const forbidden = perFile
    .filter((f) => policy.guardrails.forbid_paths.some((g) => matches(f.path, g)))
    .map((f) => f.path);

  const escalated = triage.confidence < policy.guardrails.escalate_if_confidence_below;

  const zoneCounts = [...new Set(perFile.map((f) => f.zoneId))];
  const explanation =
    `Incident ${triage.incidentId} touches ${perFile.length} file(s) spanning zone(s) ` +
    `${zoneCounts.join(", ")}. Governed by ${zone.id} (${zone.authority}) because ` +
    `'${winner.path}' matched '${winner.glob}'. ` +
    (zone.actions.may_patch
      ? `Automated patching permitted; ${zone.actions.requires_human ? "human approval required" : "no human gate"}.`
      : `AUTOMATED PATCHING PROHIBITED. Output: ${zone.actions.output}.`) +
    (forbidden.length ? ` Guardrail: ${forbidden.length} forbidden path(s) touched.` : "") +
    (escalated ? ` Escalated: triage confidence ${triage.confidence} below threshold ${policy.guardrails.escalate_if_confidence_below}.` : "");

  return {
    incidentId: triage.incidentId,
    zone,
    decidingPath: winner.path,
    matchedGlob: winner.glob,
    perFile,
    forbidden,
    escalatedForLowConfidence: escalated,
    explanation,
  };
}

/** Final authority. The orchestrator must call this before any writing agent starts. */
export function mayAutoRemediate(d: PolicyDecision): boolean {
  return d.zone.actions.may_patch && d.forbidden.length === 0 && !d.escalatedForLowConfidence;
}
