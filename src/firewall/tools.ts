import { tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";

/**
 * Mock "Acme Cloud" back-office tools. Nothing here touches a real system; they exist so the
 * agent has something dangerous to do, which is what the tool-call firewall (CHECKPOINT 1) guards.
 */
const ACCOUNTS: Record<
  string,
  { name: string; plan: string; email: string; balanceUsd: number }
> = {
  "42": {
    name: "Globex Corp",
    plan: "Business",
    email: "ops@globex.example",
    balanceUsd: 1240.5,
  },
  "77": {
    name: "Initech",
    plan: "Starter",
    email: "it@initech.example",
    balanceUsd: 89,
  },
};

export type ApprovalGate = (
  toolName: string,
  input: unknown,
  toolCallId: string,
  messages: readonly ModelMessage[],
) => Promise<boolean>;

export function acmeTools(needsApproval: ApprovalGate): ToolSet {
  const gate =
    (name: string) =>
    (
      input: unknown,
      options: { toolCallId: string; messages: ModelMessage[] },
    ) =>
      needsApproval(name, input, options.toolCallId, options.messages);

  return {
    get_account: tool({
      description: "Look up an Acme Cloud customer account by id.",
      inputSchema: z.object({ accountId: z.string() }),
      needsApproval: gate("get_account"),
      execute: async ({ accountId }) =>
        ACCOUNTS[accountId] ?? { error: `No account ${accountId}` },
    }),
    issue_refund: tool({
      description: "Refund money to a customer account.",
      inputSchema: z.object({
        accountId: z.string(),
        amountUsd: z.number().positive(),
        reason: z.string(),
      }),
      needsApproval: gate("issue_refund"),
      execute: async ({ accountId, amountUsd }) => ({
        ok: true,
        refundId: `rf_${crypto.randomUUID().slice(0, 8)}`,
        accountId,
        amountUsd,
      }),
    }),
    send_email: tool({
      description: "Send an email on behalf of Acme Cloud support.",
      inputSchema: z.object({
        to: z.string(),
        subject: z.string(),
        body: z.string(),
      }),
      needsApproval: gate("send_email"),
      execute: async ({ to, subject }) => ({
        ok: true,
        queued: { to, subject },
      }),
    }),
    run_sql: tool({
      description: "Run a SQL query against the Acme Cloud customer database.",
      inputSchema: z.object({ query: z.string() }),
      needsApproval: gate("run_sql"),
      execute: async ({ query }) => ({
        ok: true,
        rowsAffected: /^\s*select/i.test(query) ? 0 : 1312,
        query,
      }),
    }),
  };
}
