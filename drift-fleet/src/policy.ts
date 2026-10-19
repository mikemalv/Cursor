import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Change, ConsumerPolicy, DriftPolicy } from "./types.ts";

export function loadPolicy(file = ".driftfleet/policy.yaml"): DriftPolicy {
  return parse(readFileSync(file, "utf8")) as DriftPolicy;
}

export interface ChangeVerdict {
  automate: boolean;
  output: string;
  requiresCompatView: boolean;
  reason: string;
}

/**
 * What automation this change class earns. Deterministic; a compliance or data
 * governance owner reads the YAML, not this file.
 */
export function verdictFor(policy: DriftPolicy, c: Change): ChangeVerdict {
  const rule = policy.change_classes[c.cls];
  if (!rule) {
    return { automate: false, output: "migration_plan", requiresCompatView: false,
      reason: `no rule for ${c.cls}; defaulting to manual` };
  }
  // A rename we only INFERRED is not a rename we may act on.
  if (rule.min_confidence !== undefined && c.confidence < rule.min_confidence) {
    return { automate: false, output: "migration_plan", requiresCompatView: false,
      reason: `${c.cls} confidence ${c.confidence} below ${rule.min_confidence}; treated as drop + add, which is breaking` };
  }
  return {
    automate: rule.automate,
    output: rule.output,
    requiresCompatView: !!rule.require_compat_view,
    reason: rule.rationale.trim(),
  };
}

export function consumerPolicy(policy: DriftPolicy, repo: string): ConsumerPolicy {
  return policy.consumers.find((c) => c.repo === repo)
    ?? { repo, kind: "unknown", criticality: "unknown", automate: false,
         output: "migration_plan", rationale: "repo not registered in policy" };
}

/**
 * A CONSUMER-side migration is automated only if the change class permits consumer
 * automation AND the repo itself does AND we are confident enough about the change.
 *
 * Note this reads `consumer_automate`, not `automate`. A DROP_COLUMN can never be
 * automated on the producer side and is still perfectly automatable on the consumer
 * side -- removing a reference to a doomed column is mechanical, and it is exactly
 * the work that has to finish before the drop is allowed to happen. Conflating the
 * two is what turns a drift tool into a tool that does nothing on the one change
 * class where it would have helped most.
 */
export function mayAutomate(policy: DriftPolicy, c: Change, repo: string) {
  const rule = policy.change_classes[c.cls];
  const cp = consumerPolicy(policy, repo);

  // The confidence floor applies to consumers too: if we only INFERRED the rename,
  // no repo may be rewritten on the strength of a guess.
  const confidenceOk =
    rule?.min_confidence === undefined || c.confidence >= rule.min_confidence;
  const classAllows = confidenceOk && (rule?.consumer_automate ?? rule?.automate ?? false);
  const automate = classAllows && cp.automate;

  const reason = !rule
    ? `no rule for ${c.cls}; defaulting to manual`
    : !confidenceOk
      ? `${c.cls} confidence ${c.confidence} below ${rule.min_confidence}; treated as drop + add, which is breaking`
      : !classAllows
        ? (rule.consumer_rationale ?? rule.rationale).trim()
        : !cp.automate
          ? (cp.rationale?.trim() ?? `${repo} is ${cp.criticality}`)
          : rule.rationale.trim();

  return {
    automate,
    output: automate
      ? "pull_request"
      : cp.automate
        ? (rule?.output ?? "migration_plan")
        : (cp.output ?? "migration_plan"),
    reason,
  };
}
