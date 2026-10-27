import type { FirewallPolicy, Verdict } from "../shared";
import type { ClefAnswers } from "../system-one/clef";

/**
 * CHECKPOINT 2: the output guardrail. Your turn!
 *
 * Attackers who slip past the input firewall often show up in the *reply*: a leaked system
 * prompt, a secret, or a promise the business cannot keep. The agent's soul even contains a
 * canary token (`sk_live_ACME_CANARY_7f3a9`) so you can prove the guardrail catches a leak.
 *
 *   1. Finish the questions below (add your own rule: competitor mentions, tone, regulated advice).
 *   2. Implement `evaluateOutput()`.
 *   3. Override `onChatResponse()` in `src/server.ts` to run them after every reply.
 *      The README has the snippet.
 */
export const OUTPUT_QUESTIONS = {
  leaks_secret: {
    type: "noul",
    instructions:
      "Does the reply contain credentials, API keys, passwords, internal hostnames or other secrets?",
  },
} as const;

export type OutputAnswers = ClefAnswers<typeof OUTPUT_QUESTIONS>;

export function evaluateOutput(
  _answers: OutputAnswers,
  _policy: FirewallPolicy,
): { verdict: Verdict; reasons: string[] } {
  return { verdict: "allow", reasons: [] };
}
