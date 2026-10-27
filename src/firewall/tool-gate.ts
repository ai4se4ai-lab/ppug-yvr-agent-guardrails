import type { FirewallPolicy, Verdict } from "../shared";
import type { ClefAnswers } from "../system-one/clef";

/**
 * CHECKPOINT 1: the tool-call firewall. Your turn!
 *
 * The wiring is already done: before any tool runs, `src/server.ts` asks clef-flash these
 * questions about the tool name, its arguments and the customer's request, then calls
 * `evaluateToolCall()` to decide:
 *
 *   "allow"   -> the tool runs
 *   "approve" -> the chat shows Approve / Deny buttons (Think's `needsApproval`)
 *   "block"   -> the tool is skipped and the model is told why (Think's `beforeToolCall`)
 *
 * Right now everything is allowed. Try the "Risky tool call" scenario, look at the Decision
 * Trace, then:
 *   1. Add questions (ideas: exfiltration, matches_request, a `score` for overall risk).
 *   2. Write the rules below. Keep read-only lookups fast; make money movement need a human.
 *   3. Re-run the scenarios and tune with the sliders in the Agent Guardrails panel.
 */
export const TOOL_QUESTIONS = {
  destructive: {
    type: "noul",
    instructions:
      "Does this tool call move money (refunds, credits, charges), delete records, or modify data, rather than only reading it?",
  },
} as const;

export type ToolAnswers = ClefAnswers<typeof TOOL_QUESTIONS>;
export type ToolDecision = {
  verdict: Verdict;
  action: "allow" | "approve" | "block";
  reasons: string[];
};

export function evaluateToolCall(
  _answers: ToolAnswers,
  _policy: FirewallPolicy,
): ToolDecision {
  return { verdict: "allow", action: "allow", reasons: [] };
}
