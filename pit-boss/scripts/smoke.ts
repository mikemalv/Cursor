/** DAY 0 GATE. Nothing in PLAN.md is real until this prints text. */
import { Agent } from "@cursor/sdk";

const result = await Agent.prompt("Reply with exactly: pit-boss online", {
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2.5" },
  local: { cwd: process.cwd() },
});
console.log(result);
