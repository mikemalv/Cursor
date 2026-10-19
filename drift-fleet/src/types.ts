export interface ColumnDef { type: string; nullable: boolean; renamedFrom?: string; }
export interface ObjectDef { kind: string; owner: string; columns: Record<string, ColumnDef>; }
export interface Contract { database: string; capturedAt: string; objects: Record<string, ObjectDef>; }

export type ChangeClass =
  | "ADD_COLUMN" | "DROP_COLUMN" | "RENAME_COLUMN"
  | "RETYPE_WIDENING" | "RETYPE_NARROWING"
  | "NULLABILITY_TIGHTEN" | "NULLABILITY_RELAX";

export interface Change {
  object: string;
  column: string;
  from?: string;              // previous name, for renames
  cls: ChangeClass;
  before?: ColumnDef;
  after?: ColumnDef;
  confidence: number;         // 1.0 when the warehouse told us; lower when inferred
  destructive: boolean;
  detail: string;
}

export interface ConsumerRef {
  repo: string;
  file: string;
  line?: number;
  /** How the column is referenced -- decides which agent can safely rewrite it. */
  kind: "dbt_model" | "orm_mapping" | "embedded_sql" | "semantic_yaml" | "unknown";
  column: string;
  snippet?: string;
}

export interface ConsumerPolicy {
  repo: string; kind: string; criticality: string;
  automate: boolean; authority?: string; output?: string; rationale?: string;
}

export interface ChangeClassPolicy {
  /** Whether the PRODUCER-side warehouse action may be automated. */
  automate: boolean;
  /**
   * Whether CONSUMER-side migration may be automated. Deliberately separate:
   * dropping a column is never automatable, but a consumer removing its
   * reference to that column is mechanical and safe. Conflating the two is
   * what makes naive drift tooling useless on the change that matters most.
   */
  consumer_automate?: boolean;
  rationale: string; output: string;
  min_confidence?: number; require_compat_view?: boolean;
  consumer_rationale?: string;
}

export interface DriftPolicy {
  version: number; organization: string;
  change_classes: Record<string, ChangeClassPolicy>;
  consumers: ConsumerPolicy[];
  guardrails: { max_files_per_repo: number; block_destructive_until_consumers_merged: boolean };
}

export interface Step {
  id: string;
  wave?: number;
  kind: "producer_additive" | "consumer_migration" | "producer_destructive" | "manual_gate";
  repo?: string;
  change: Change;
  automated: boolean;
  output: string;
  needs: string[];
  summary: string;
}
