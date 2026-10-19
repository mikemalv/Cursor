import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The audit trail is not logging. It is the deliverable.
 *
 * A gaming regulator can subpoena change history; "the AI did it" is not an answer.
 * Every agent event, tool call and token is appended here, append-only, with the
 * policy decision that authorised it.
 */
export class AuditLog {
  readonly dir: string;
  private tokens = { input: 0, output: 0 };

  constructor(incidentId: string, root = "runs") {
    this.dir = join(root, incidentId);
    mkdirSync(this.dir, { recursive: true });
  }

  event(kind: string, agentId: string, payload: unknown) {
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, agentId, payload });
    appendFileSync(join(this.dir, "events.jsonl"), line + "\n");
  }

  /** Fold a Cursor SDK stream event into the trail. */
  sdkEvent(agentId: string, event: any) {
    if (event?.usage) {
      this.tokens.input += event.usage.inputTokens ?? 0;
      this.tokens.output += event.usage.outputTokens ?? 0;
    }
    this.event(event?.type ?? "unknown", agentId, event);
  }

  cost(rates = { inPerM: 3, outPerM: 15 }) {
    const usd = (this.tokens.input / 1e6) * rates.inPerM + (this.tokens.output / 1e6) * rates.outPerM;
    return { ...this.tokens, estimatedUsd: Number(usd.toFixed(4)) };
  }

  artifact(name: string, contents: string) {
    writeFileSync(join(this.dir, name), contents);
  }
}
