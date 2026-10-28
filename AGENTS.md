# AGENTS.md: Agent Guardrails (PPUG System One starter)

Context for AI coding agents (OpenCode, Devin, Claude Code, Cursor) working in this repo.

## What this is

A hackathon starter: a stateful Cloudflare **Think** chat agent ("Nimbus", support for the fictional
Acme Cloud) guarded by **Agent Guardrails** built on the **Clef-flash** System One decision model.
Attendees extend it through checkpoints (see README.md). Keep changes small, demoable and
consistent with the existing structure.

## Commands

| Command          | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `npm run dev`    | Vite + Workers dev server; AI binding is remote (needs `wrangler login`) |
| `npm test`       | Vitest unit tests in Node with a mocked AI binding         |
| `npm run check`  | `oxfmt --check`, `oxlint`, `tsc --noEmit`. Run before declaring done |
| `npm run format` | auto-format                                                |
| `npm run types`  | regenerate `env.d.ts` after changing `wrangler.jsonc`      |
| `npm run deploy` | build and deploy. **Ask the user before deploying.**       |

## Architecture

- `src/server.ts`: `ChatAgent extends SystemOneAgent`. **This is where use-case logic goes.**
  - `soul()`: system identity. `getTools()`: AI SDK tools.
  - `beforeTurn(ctx)`: CHECKPOINT 0 input firewall (implemented).
  - `needsApproval` / `beforeToolCall(ctx)`: CHECKPOINT 1 tool firewall (wiring done; rules in `src/firewall/tool-gate.ts`).
  - `onChatResponse(result)`: CHECKPOINT 2 output guardrail (attendee task; snippet in README).
  - CHECKPOINT 3 (attendee, boss level): escalate unsure verdicts to `clef`, log attacks to SQLite (`this.sql`), leaderboard + `attack_report` tool. Never store full prompts.
  - `@callable()` methods (`setPolicy`, `resetStats`) are RPC from the UI via `agent.call(...)`.
- `src/agent/system-one-agent.ts`: shared base, rarely needs edits. Picks the LLM through AI Gateway
  (`createAI`), configures memory (`configureContext`: `soul` + writable `memory`), and provides
  `decideTraced()` / `extractTraced()`, which call Clef / Clairic and push a `DecisionTrace` into
  agent state. State syncs live to the UI.
- `src/system-one/clef.ts`, `clairic.ts`: typed, zod-validated clients for the System One models.
- `src/firewall/*`: questions (`*_QUESTIONS`) and pure decision functions (`evaluate*`). Keep decision
  logic pure so it is unit-testable.
- `src/shared.ts`: types shared by Worker and browser (`AgentState`, `DecisionTrace`, `FirewallPolicy`, `MODELS`).
- `src/app.ts`: name, tagline, demo scenarios. `src/ui/*`: React UI; `src/ui/extensions.tsx` is the
  use-case sidebar panel.

## Rules for changes

- Call System One models through `this.decideTraced()` / `this.extractTraced()` so every call shows in
  the Decision Trace and AI Gateway. Do not call `env.AI.run` for Clef/Clairic directly.
- Clef questions: 1-64 per call. Types are `noul` (yes/no → `answers.x.noul`), `choice` (`criteria`
  maps option id → description → `answers.x.choice`, `.probabilities`) and `score` (`criteria` is an
  ordered array, lowest first, 2-10 levels → `answers.x.score`, a weighted level index; use
  `normalizedScore()` for 0..1).
- Model choice: `clef-flash` on hot paths (default), `clef` for accuracy or images, `clef-omni` for
  audio/video. Media must be base64 data URLs, never remote URLs.
- Clairic fields: `text | number | date | time | datetime | duration | list | estimate | forecast`.
  Values come back with `confidence` and `p_null`, or `p10`/`p90` for estimates. Do multi-step math in
  code, not in Clairic.
- New state fields: add them to `AgentState` and `INITIAL_STATE` in `src/shared.ts`. Update state with
  `this.setState({ ...this.state, field })`.
- Add or update tests in `test/` alongside behaviour changes. Never weaken tests to pass.
- Never hardcode secrets. The canary token in `soul()` is intentional demo data.
- Durable Objects: follow https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/

## Docs (fetch these; APIs move fast)

- Think: https://developers.cloudflare.com/agents/harnesses/think/ (tools, lifecycle hooks, client tools)
- Agents SDK models (`createAI`): https://developers.cloudflare.com/agents/models/ai-sdk/
- Clef: https://developers.cloudflare.com/workers-ai/models/clef/ (also `clef-flash`, `clef-omni`)
- Clairic: https://developers.cloudflare.com/workers-ai/models/clairic/ and https://developers.cloudflare.com/workers-ai/concepts/extraction-models/
- AI Gateway: https://developers.cloudflare.com/ai-gateway/
- Cloudflare docs index for LLMs: https://developers.cloudflare.com/llms.txt
