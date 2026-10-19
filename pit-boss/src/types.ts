/** Core domain types. Kept deliberately small -- the pipeline is data-driven. */

export type ZoneId = "GAMING_REGULATED" | "PCI_SCOPE" | "STANDARD" | (string & {});

export interface Incident {
  id: string;
  source: "pagerduty" | "sentry" | "snyk" | "manual";
  detectedAt: string;
  severity: "sev1" | "sev2" | "sev3";
  title: string;
  /**
   * UNTRUSTED INPUT. A stack trace or issue body is attacker-influenceable.
   * This is one reason triage runs read-only and the policy gate is code, not a model.
   */
  body: string;
  service?: string;
}

export interface TriageResult {
  incidentId: string;
  hypothesis: string;
  suspectFiles: string[];
  confidence: number;
  blastRadiusHint: string[];
}

export interface ZoneActions {
  may_patch: boolean;
  may_open_pr: boolean;
  requires_human: boolean;
  required_reviews?: number;
  forbid_new_dependencies?: boolean;
  mandatory_agents?: string[];
  output: "pull_request" | "evidence_package" | "compliance_dossier";
  reviewers?: string[];
}

export interface Zone {
  id: ZoneId;
  label: string;
  authority: string;
  paths: string[];
  rationale: string;
  actions: ZoneActions;
}

export interface Policy {
  version: number;
  organization: string;
  default_zone: ZoneId;
  zones: Zone[];
  guardrails: {
    max_files_changed: number;
    max_lines_changed: number;
    forbid_paths: string[];
    escalate_if_confidence_below: number;
  };
}

export interface PolicyDecision {
  incidentId: string;
  zone: Zone;
  /** Which file caused this zone to be selected -- the auditable "why". */
  decidingPath: string;
  matchedGlob: string;
  /** Every file mapped to its own zone, so mixed-scope incidents are visible. */
  perFile: { path: string; zoneId: ZoneId; glob: string }[];
  forbidden: string[];
  escalatedForLowConfidence: boolean;
  /** Human-readable justification, verbatim into the audit log and the dossier. */
  explanation: string;
}

/** One agent in the specialist fan-out. Specs are DATA -- adding one is an object literal. */
export interface AgentSpec {
  id: string;
  purpose: string;
  model: string;
  /** SDK tool allowlist. Capability boundaries beat prompt instructions. */
  tools?: string[];
  disallowedTools?: string[];
  maxTurns: number;
  timeoutMs: number;
  /** Runs only when the policy decision permits/requires it. */
  runsWhen: (d: PolicyDecision) => boolean;
  prompt: (ctx: { incident: Incident; triage: TriageResult; decision: PolicyDecision }) => string;
}
