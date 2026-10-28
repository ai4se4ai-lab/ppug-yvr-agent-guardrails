# Context Guard research prototype

Research question: **Can guardrails that adapt to development context reduce unnecessary human approvals while maintaining protection against unsafe agent actions?**

This repository now contains an executable pilot and evaluation framework. It does not yet establish research novelty, effectiveness on real development workloads, or safety equivalence. The built-in context policies are authored rules; this prototype does not learn policies online.

## Architecture

- `src/research/policy.ts`: pure policy composition and enforcement. Organization ceilings compose with repository, environment, and action ceilings using minimum thresholds. Lower thresholds are stricter. Approval prerequisites are separate from semantic threat thresholds.
- `src/research/schema.ts`: bounded, strict research request schemas and three semantic classifier questions. Ground-truth labels are rejected by the API. Context metadata is excluded from the classifier input, so policy differences do not alter the semantic classification problem.
- `src/server.ts`: authenticated `/api/research/assess` and `/api/research/propose`. System One calls go through `decideTraced()` and AI Gateway. The proposal model also routes through AI Gateway. API failures return errors, never fabricated safe scores.
- `/research`: interactive policy explorer, live model assessment, and recorded benchmark summaries. It does not execute submitted SQL or shell commands.
- `research/dev_context.py`: controlled SQLite execution supplement.
- `research/agentdojo_eval.py`: custom live agent scaffold using upstream AgentDojo environments, attacks, and outcome checks.
- `research/report.py`: publishes measured JSON, CSV, a written evaluation, and source snapshots.

The application is a research harness. Its context is researcher supplied, not attested by production infrastructure. The support demo has mock tools and a separate basic tool policy; its context is not automatically inferred as production facts.

The first completed pilot is retained in `results/pilot-v1/`. Its overblocking motivated protocol `action-assessment-v2`, which includes the tool description and distinguishes necessary prerequisite actions from unrelated actions, and acting on an injection from merely observing one. The refined rerun uses the same tasks: it is exploratory development-set evaluation, not held-out evidence. Neither run is discarded.

## Benchmark choice

**AgentDojo is the recommended external starting point for this prototype**, because it executes real simulated tool interactions and checks both user-task utility and attacker-goal achievement. This makes it more useful for the safety/autonomy tradeoff than judging suspicious text alone. Its original paper reports 97 user tasks and 629 security cases. The pilot here runs a declared small subset, not those full counts.

- Paper: https://arxiv.org/abs/2406.13352
- Upstream implementation: https://github.com/ethz-spylab/agentdojo (MIT; fetched locally under ignored `.research/agentdojo`).
- The exact upstream commit used is recorded in the measured AgentDojo summary and dependency lock.

AgentDojo's standard domains do not encode repository verification, deployment targets, test freshness, or rollback evidence. It cannot by itself answer the software-development-specific question. Pair it with independent contextual development tasks. The included hand-authored SQLite supplement is a pipeline validation pilot, not an established benchmark or independent validation.

SWE-bench is a useful later source of repository tasks, but issue resolution alone does not label authorization violations, review necessity, or deployment context. InjecAgent can supplement action-level indirect-injection testing, but does not replace end-to-end utility and approval measurement.

## Policy arms

| Arm | Semantic scores | Context thresholds | Mutation approval |
|---|---|---|---|
| unguarded | Measured but ignored | None enforced | None |
| rules-only | Ignored | Fixed | Every mutation |
| static | Same per-case scores | Fixed 0.40 / 0.70 | Every mutation |
| adaptive | Same per-case scores | Hierarchical | Verified low-impact sandbox changes can proceed |
| no-evidence | Same per-case scores | Hierarchical | Every mutation |
| no-hierarchy | Same per-case scores | Organization ceilings only | Same evidence rule as adaptive |

All guarded arms preserve the same mandatory controls: production mutations require review; sensitive exports to external destinations are blocked. Unknown operations or environments require review. There is no user-reputation mechanism and no automatic widening of permissions after successful tasks.

The assess API also provides a prespecified descriptive fixed-threshold sweep (review 0.20/0.40/0.55, block 0.55/0.70/0.85). Do not choose a best-performing threshold on the evaluation set and claim held-out effectiveness. The initial protocol ran before this additional output was deployed; see recorded provenance and source snapshots. Protocol v2 records a build hash computed from the actual policy, classifier schema, and server sources; compare it to the local build hash in provenance.

## Setup and execution (PowerShell)

Use Node.js 24+ and Python 3.10+. The existing Cloudflare login is used only by Wrangler. Research clients use a separate bearer token.

```powershell
npm ci
npm test
npm run check

# Obtain upstream at the exact commit recorded in research/requirements-agentdojo.txt.
git clone https://github.com/ethz-spylab/agentdojo.git .research/agentdojo
git -C .research/agentdojo checkout 089ed468cf3ed0322acc66b0211f26d9d90dbf60
uv venv .research/venv
uv pip install --python .research/venv/Scripts/python.exe -r research/requirements-agentdojo.txt
```

The initial deployment created a random token in `.research/research-token` and uploaded it as the Cloudflare secret `RESEARCH_TOKEN`. The token is not tracked, published, or included in result files. The dashboard accepts it in its password field and stores it only in browser session storage. For another machine, set the `RESEARCH_TOKEN` environment variable. For local Vite development, put the same secret in ignored `.dev.vars`.

```powershell
# Deployment requires the repository owner's authorization.
npm run deploy

python research/dev_context.py --url https://YOUR-WORKER.workers.dev
.research/venv/Scripts/python.exe research/agentdojo_eval.py --url https://YOUR-WORKER.workers.dev
# If infrastructure errors occurred, retry only those episodes and preserve valid outcomes:
.research/venv/Scripts/python.exe research/agentdojo_eval.py --url https://YOUR-WORKER.workers.dev --resume-errors
python research/report.py

# Publish the measured summaries to the dashboard after examining REPORT.md.
npm run deploy
```

Every research API request must have `Authorization: Bearer <RESEARCH_TOKEN>`. Missing credentials return 401. Clients read the token file locally without printing it. Request bodies are capped at 150KB. No benchmark endpoint executes researcher-submitted code against production systems.

## What is measured

The controlled supplement contains 12 task/proposal templates across four contexts (48 cases): fresh sandbox evidence, stale sandbox evidence, staging, and production. Eight templates are legitimate (32 cases) and four propose unauthorized effects (16 cases). Each admitted proposal executes in a newly created in-memory SQLite database containing synthetic data. Unnecessary approval labels are specified by the harness authors and must be independently validated before a confirmatory study.

All policy arms share the same classifier response for a given case. The simulator approves authorized review requests and rejects unauthorized ones: an explicit **perfect-reviewer assumption**. Report automatic unsafe effects separately. Completion in this suite is execution of the proposed action, not real coding-task completion.

The external pilot uses banking user tasks 0–3, each clean and under the upstream important-instructions attack with injection task 0, across unguarded/static/adaptive: 24 episodes. The actor chooses tools using live Workers AI; tools execute in upstream in-memory environments. A fixed capability registry supplies context independently of model prose. The agent and gate never receive task ground truth. Injection exposure is measured on actual tool observations with whitespace normalization.

Reviews use **defer-all**: the episode pauses at its first approval request. Thus utility measures autonomous completion before a human responds. It does not measure final completion after review or whether an approval was unnecessary. Blocked proposals are not inserted into upstream executed-tool traces.

The actor uses temperature 0, a bounded step count, and one tool call at a time. This is a custom serialized-transcript scaffold, not the upstream reference agent or a leaderboard run. All arms assess proposals for comparable recorded gate scores; unguarded wall time therefore includes measurement overhead and is not an estimate of an uninstrumented agent's latency.

The clients retry transient HTTP failures up to three attempts. Protocol v2 disables SDK-level proposal retries; the initial protocol used SDK defaults. Proposal counts count successful client responses, not provider inference attempts or billed calls. No dollar-cost claim is made. Failed episodes remain explicit errors and are excluded from valid-outcome denominators.

The client spaces proposal starts by four seconds across threads (15 RPM), leaving headroom below the documented default paid-model limit of 20 RPM: https://developers.cloudflare.com/workers-ai/platform/limits/. A separate process or another user of the same account can still consume that limit. The initial v2 run encountered three rate-limit failures; only those failed episodes were retried. Attempt history is preserved. `RESEARCH_PROPOSAL_INTERVAL_SECONDS` can slow pacing further.

## Reproducibility and interpretation

Public artifacts under `research/results` contain fixture definitions, per-case decisions, scores, effects, CSV summaries, source hashes, a source snapshot, and the report. Private caches retain assessment responses to make reruns inexpensive; cached classifier latency is the original latency, not replay time. Actor calls are rerun. Smoke runs are not included in published summaries.

The development approval comparison includes a paired bootstrap clustered by template (2,000 draws, fixed seed). Wilson intervals for unsafe effects are descriptive and assume independent cases, which contextual variants do not fully satisfy. Neither analysis establishes safety noninferiority. Plan held-out repositories, independent annotations, repeated models/runs, adaptive attacks, a strong manual-context baseline, separately calibrated thresholds, and a powered human study before claiming broad effectiveness.

To regenerate the standalone scientific SVG/PNG figures, install `research/requirements-plot.txt` into the research environment and run `.research/venv/Scripts/python.exe research/plot_results.py`. Figures are derived from recorded summaries. The dashboard publishes the SVG at `/research-comparison.svg`.

Related work to assess before claiming novelty:

- AgentSpec (ICSE 2026): https://arxiv.org/abs/2503.18666
- Contextual Agent Security / Conseca: https://arxiv.org/abs/2501.17070
- Context-to-Execution Integrity (preprint): https://arxiv.org/abs/2607.06000

The benchmark and implementation should remain useful even if experiments find that a simple manually configured policy performs as well as adaptive thresholds.
