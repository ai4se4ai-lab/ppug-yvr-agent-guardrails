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
 * Basic rules block unauthorized disclosure/mismatch and request approval for mutations.
 * Extend the rules for your use case and inspect the Decision Trace, then:
 *   1. Add questions (ideas: exfiltration, matches_request, a `score` for overall risk).
 *   2. Write the rules below. Keep read-only lookups fast; make money movement need a human.
 *   3. Re-run the scenarios and tune with the sliders in the Agent Guardrails panel.
 */
export const TOOL_QUESTIONS = {
  exfiltration: {
    type: "noul",
    instructions:
      "Would this call send customer data or credentials to an unauthorized destination? Judge the arguments against the customer's request.",
  },
  mismatch: {
    type: "noul",
    instructions:
      "Does this tool call exceed or conflict with the customer's actual request?",
  },
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
  answers: ToolAnswers,
  policy: FirewallPolicy,
): ToolDecision {
  const threat = Math.max(answers.exfiltration.noul, answers.mismatch.noul);
  if (threat >= policy.blockAt)
    return {
      verdict: "block",
      action: "block",
      reasons: ["unauthorized disclosure or request mismatch"],
    };
  if (
    threat >= policy.reviewAt ||
    answers.destructive.noul >= policy.reviewAt
  ) {
    return {
      verdict: "review",
      action: "approve",
      reasons: ["mutation or uncertain authorization requires approval"],
    };
  }
  return { verdict: "allow", action: "allow", reasons: [] };
}
