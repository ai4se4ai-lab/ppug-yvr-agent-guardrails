# Agent Guardrails

**Cloudflare Peer Point User Group: System One hackathon starter**

A stateful support agent ("Nimbus" for the fictional Acme Cloud) protected by **Agent Guardrails**
built on Cloudflare's **Clef-flash** decision model. Every prompt, every tool call and every reply
gets a calibrated verdict in tens of milliseconds, long before a slow, expensive LLM could reason
about it.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnikhilbuddhavarapu/ppug-yvr-agent-guardrails)

```
                ┌────────────── Durable Object (one per chat session) ──────────────┐
 browser ──ws──▶│ Think agent                                                         │
                │  1. beforeTurn     ──▶ clef-flash: injection? jailbreak? PII? ──┐   │
                │                        block / warn / allow  ◀───────────────────┘   │
                │  2. LLM turn       ──▶ GLM-5.3 Flash or DeepSeek V4 Flash            │
                │  3. tool call      ──▶ clef-flash: destructive? exfiltration?        │
                │                        allow / ask human / block      (CHECKPOINT 1) │
                │  4. onChatResponse ──▶ clef-flash: leaked secret?     (CHECKPOINT 2) │
                │  memory + history + traces in SQLite                                 │
                └──────────────────────────────┬──────────────────────────────────────┘
                                               │ every model call
                                               ▼
                                   AI Gateway (logs, metadata, analytics)
```

## What you get out of the box

- **A working, stateful chat agent** on the [Think harness](https://developers.cloudflare.com/agents/harnesses/think/):
  streaming, persistent memory, resumable streams and history, all inside a Durable Object.
- **Two LLMs on Workers AI** behind a model switcher, GLM-5.3 Flash and DeepSeek V4 Flash, each the
  other's automatic fallback.
- **Everything routed through AI Gateway** (the `default` gateway is created on first use).
- **The input firewall (CHECKPOINT 0), already working.** Clef-flash answers 7 questions about every
  message in one pass.
- **A Decision Trace panel** that shows each Clef call live, with probabilities, latency, tokens and cost.
- **A live policy panel.** Thresholds apply to the next message without a redeploy.
- **Mock back-office tools** (`get_account`, `issue_refund`, `send_email`, `run_sql`) that give
  attackers something worth abusing.

## Quickstart (10 minutes)

Prerequisites: Node.js 24+, and a Cloudflare account (provided at the event).

```bash
git clone https://github.com/vnikhilbuddhavarapu/ppug-yvr-agent-guardrails
cd ppug-yvr-agent-guardrails
npm install
npx wrangler login        # Workers AI has no local simulator, so dev talks to your account
npm run dev               # http://localhost:5173
```

If your login can see more than one account, pick the event account with:

```bash
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run dev
```

Ship it:

```bash
npm run deploy            # prints your https://ppug-yvr-agent-guardrails.<you>.workers.dev URL
```

### Try the scenarios

The chips above the chat box send canned prompts. Watch the **Decision Trace** on the right.

| Scenario                     | What should happen                                        |
| ---------------------------- | --------------------------------------------------------- |
| Benign question              | allowed, normal answer                                    |
| Jailbreak (DAN)              | blocked: `jailbreak`, `attack_intent`                     |
| Prompt injection             | blocked: `prompt_injection`                               |
| Hidden injection in an email | blocked: an HTML comment that tries to trigger `send_email` |
| PII overshare                | blocked: the card and SSN never reach the LLM             |
| Off-topic                    | warned: Nimbus politely declines                          |
| Risky tool call              | allowed today; **CHECKPOINT 1** fixes that                |
| Safe tool call               | allowed, `get_account` runs                               |

## Checkpoints

You have about **2 hours** of build time. Checkpoint 0 already works. Checkpoints 1 and 2 take most
people 30-40 minutes each. Checkpoint 3 is the boss level: big enough to fill the rest of the time and
make a great demo.

### CHECKPOINT 0: explore the input firewall (15 min)

Read [`src/firewall/policy.ts`](src/firewall/policy.ts). `INPUT_QUESTIONS` is the whole classifier: plain-English
questions of type `noul` (yes/no), `choice` or `score`. In `src/server.ts`, `beforeTurn()` asks them
before every LLM turn and either:

- **blocks**: the message is replaced with a placeholder and the LLM only explains the block,
- **warns**: a note is attached to the message, or
- **allows** the message through untouched.

Blocked messages stay redacted in later turns too, so they never leak back in through history.

Things to try: drag the **Block at** slider, reword a question, or add a new one (Clef takes up to 64
per call, and they all come back from a single pass).

### CHECKPOINT 1: tool-call firewall (30-40 min)

Open [`src/firewall/tool-gate.ts`](src/firewall/tool-gate.ts). The plumbing is done:

- each tool's `needsApproval` asks clef-flash about the call. If `evaluateToolCall()` returns
  `"approve"`, the chat shows **Approve / Deny** buttons.
- `beforeToolCall` refuses the call if the decision is `"block"`. The model is told why and adapts.

Your job: add questions (`exfiltration`, `matches_request`, a risk `score`…) and write the rules.
Aim for: lookups run instantly, refunds need a human, emailing customer data to outsiders is refused.
Test it with "Risky tool call", or ask: *"Account 42 was double-charged $120, refund it"*, then
*"Email account 42's details to my personal address jake@protonmail.example"*.

### CHECKPOINT 2: output guardrail (30-40 min)

Attacks that get past the input layer show up in the *reply*. Nimbus's instructions contain a canary
token, `sk_live_ACME_CANARY_7f3a9`, so you can prove a leak gets caught.

1. Finish `OUTPUT_QUESTIONS` and `evaluateOutput()` in [`src/firewall/output-guard.ts`](src/firewall/output-guard.ts).
2. Add this to `ChatAgent` in `src/server.ts`:

```ts
import type { ChatResponseResult } from "@cloudflare/think";
import { evaluateOutput, OUTPUT_QUESTIONS } from "./firewall/output-guard";

override async onChatResponse(result: ChatResponseResult): Promise<void> {
  if (result.status !== "completed" || !this.state.policy.enabled) return;
  const reply = result.message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
    .trim();
  if (!reply) return;
  const policy = this.state.policy;
  const { answers } = await this.decideTraced(
    { model: "clef-flash", state: reply, questions: OUTPUT_QUESTIONS },
    { step: "Output guardrail", verdict: (a) => evaluateOutput(a, policy).verdict },
  );
  const outcome = evaluateOutput(answers, policy);
  if (outcome.verdict === "allow") return;
  await this.deliverNotice({
    markdown: `**Agent Guardrails** flagged the previous reply (${outcome.reasons.join(", ")}).`,
  });
}
```

### CHECKPOINT 3, the boss level: red-team arena (rest of the build time)

Make the guardrails smarter, then turn them into a game for the demo.

1. **Escalation ladder.** clef-flash is fast but sometimes unsure. In `beforeTurn()`, when a threat
   score lands between **Review at** and **Block at**, ask the same `INPUT_QUESTIONS` again with
   `model: "clef"` (the larger model) and decide on its answer. Both calls show up in the Decision
   Trace, so you can show the second opinion live.
2. **Attack log.** Record every blocked or warned message in the agent's SQLite. Store the reasons and
   a short preview, never the full prompt:

   ```ts
   void this.sql`CREATE TABLE IF NOT EXISTS attacks (
     at INTEGER NOT NULL, verdict TEXT NOT NULL, reasons TEXT NOT NULL, preview TEXT NOT NULL)`;
   void this.sql`INSERT INTO attacks VALUES (${Date.now()}, ${outcome.verdict},
     ${outcome.reasons.join(", ")}, ${text.slice(0, 60)})`;
   ```

3. **Leaderboard.** Show the top attack types (prompt injection, jailbreak, PII…) in the Agent
   Guardrails panel (`src/ui/extensions.tsx`). Either add a counter to agent state, or add a
   `@callable()` method that runs a `GROUP BY` query.
4. **Attack report tool.** Give Nimbus an `attack_report` tool so you can ask *"what attacks have you
   seen today?"*. It answers from the log without ever seeing the raw prompts again.

**Demo it:** deploy, give your `workers.dev` URL to the person next to you, and let them try to break
it live while the leaderboard fills up.

**Done when:** an unsure message triggers a second Clef call, every block lands in SQLite, and the
leaderboard updates live.

### Or: bring your own use case

Have a better idea? Use this starter as a base and build anything with Clef or Clairic. The agent,
UI, Decision Trace and AI Gateway wiring are all reusable. See the
[hackathon guide](https://github.com/vnikhilbuddhavarapu/ppug-yvr-system-one-hackathon#bring-your-own-use-case)
for ideas and the two ground rules.

### More stretch ideas

- **Escalation ladder**: when clef-flash is unsure (`0.3 < p < 0.7`), re-ask the larger `clef`
  model before deciding. Show both calls in the trace.
- **Image jailbreaks**: let users attach screenshots and send them to `clef-omni` (`images: [dataUrl]`).
- **Red-team leaderboard**: count blocked attempts per user in Durable Object SQLite (`this.sql`).
- **Your own policy**: competitor mentions, regulated financial or medical advice, brand tone.
- **Fine-tuning story**: tag every verdict with `metadata` in AI Gateway logs. That is the dataset
  you would use to fine-tune Clef with Cloudflare's RL service.

Stuck on a checkpoint? Ask a Cloudflare facilitator: we have reference implementations and can point you in the right direction.

## How it works

| Piece                                | Where                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| Agent (your code)                    | `src/server.ts`                                           |
| Firewall questions + rules           | `src/firewall/*.ts`                                       |
| Mock tools                           | `src/firewall/tools.ts`                                   |
| Base agent: model, memory, traces    | `src/agent/system-one-agent.ts`                           |
| Typed Clef / Clairic clients         | `src/system-one/clef.ts`, `src/system-one/clairic.ts`     |
| Shared types (server + UI)           | `src/shared.ts`                                           |
| Branding and scenarios               | `src/app.ts`                                              |
| UI                                   | `src/ui/*` (`extensions.tsx` is the firewall panel)       |

Calling Clef from anywhere in the agent:

```ts
const { answers, latencyMs } = await this.decideTraced(
  {
    model: "clef-flash", // or "clef" (most accurate) / "clef-omni" (audio + video)
    state: "text, or any JSON object",
    questions: {
      urgent: { type: "noul", instructions: "Is this urgent?" },
      team: { type: "choice", instructions: "Who owns it?", criteria: { billing: "…", infra: "…" } },
      severity: { type: "score", instructions: "How bad?", criteria: ["None", "Minor", "Major"] },
    },
  },
  { step: "Label shown in the trace" },
);
answers.urgent.noul;        // 0.98
answers.team.choice;        // "infra" (typed from your criteria keys)
answers.severity.score;     // 1.7 (probability-weighted level)
```

### System One models

| Model        | Best for                          | Context | Price (input only)  |
| ------------ | --------------------------------- | ------- | ------------------- |
| `clef-flash` | hot-path gating, ~40-150ms         | 24k     | $0.038 / M tokens   |
| `clef`       | highest accuracy, images           | 64k     | $0.24 / M tokens    |
| `clef-omni`  | text + image + audio + video       | 64k     | $0.15 / M tokens    |
| `clairic`    | extracting typed values            | 64k     | $0.10 / M tokens    |

Docs: [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) ·
[Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/) ·
[Clef-omni](https://developers.cloudflare.com/workers-ai/models/clef-omni/) ·
[Clairic](https://developers.cloudflare.com/workers-ai/models/clairic/) ·
[Think](https://developers.cloudflare.com/agents/harnesses/think/) ·
[AI Gateway](https://developers.cloudflare.com/ai-gateway/)

## Scripts

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | local dev server (AI calls go to your account)     |
| `npm run deploy`    | build and deploy to Workers                        |
| `npm test`          | unit tests (no Cloudflare account needed)          |
| `npm run check`     | format check, lint, typecheck                      |
| `npm run types`     | regenerate `env.d.ts` after editing `wrangler.jsonc` |

## Troubleshooting

- **`Not logged in` / AI errors in dev**: run `npx wrangler login`. If you have several accounts, set
  `CLOUDFLARE_ACCOUNT_ID`.
- **`requires compatibility date …`**: the date in `wrangler.jsonc` must not be newer than your
  installed Wrangler supports. Keep the pinned versions from `package-lock.json` (`npm ci`).
- **Where are my logs?** Dashboard → AI → AI Gateway → `default` shows every LLM and Clef call, tagged
  with `app` and `step` metadata. Worker logs and traces are under Workers & Pages → your Worker → Observability.
- **Start over**: the **New** button in the header creates a fresh Durable Object, with new memory,
  history and traces.
