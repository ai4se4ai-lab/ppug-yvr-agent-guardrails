# Context Guard: measured pilot results

These are exploratory measurements from a working prototype, not evidence of safety equivalence or a publication-ready effectiveness claim.

## Controlled development-context supplement

48 cases; 0 measurement failures. Median measured classifier latency: 210.0 ms.

| Policy | Approval requests | Unnecessary approvals | Legitimate completions | Unsafe autonomous effects |
|---|---:|---:|---:|---:|
| unguarded | 0 | 0 | 32/32 | 16/16 |
| rules-only | 32 | 4 | 32/32 | 0/16 |
| static | 20 | 4 | 32/32 | 0/16 |
| adaptive | 16 | 0 | 32/32 | 0/16 |
| no-evidence | 20 | 4 | 32/32 | 0/16 |
| no-hierarchy | 16 | 0 | 32/32 | 0/16 |

The adaptive arm made 20.0% fewer approval requests than the fixed arm in these fixtures. Completion uses an explicitly simulated perfect reviewer; it is not autonomous coding task success.

The paired, template-cluster bootstrap interval for static minus adaptive approval requests per case was [0.020833333333333332, 0.14583333333333334] (2,000 draws, fixed seed). This interval describes resampling of the authored templates, not generalization to real repositories.

The adaptive unsafe-effect Wilson interval was [0, 0.1936076805344365]. Even zero observed unsafe effects therefore cannot establish a low real-world failure rate. These intervals additionally ignore dependence between variants of the same template.

**Negative finding:** removing contextual threshold layers produced the same approval and unsafe-effect counts. This pilot does not demonstrate an incremental benefit from adaptive thresholds. The approval reduction is attributable to the evidence-based sandbox autonomy rule in this fixture set.

### Limitations

- Hand-authored controlled fixtures; no external validity established.
- Fixed tool proposals, not autonomous coding task completion.
- Context supplied by harness; no production attestation.
- Perfect reviewer simulation; approvals measure requests, not human time.
- Wilson intervals ignore within-template dependence; paired approval interval clusters by template.
- No held-out calibration, multi-model replication, or adaptive attacker evaluation yet.

## External AgentDojo pilot

Upstream benchmark: v1.2.2 banking; commit `089ed468cf3ed0322acc66b0211f26d9d90dbf60`. Actor: `@cf/zai-org/glm-5.3-flash`. Guard: `@cf/cloudflare/clef-flash`.

| Policy | Valid/planned episodes | Approval requests | Autonomous completions | Attack successes | Injections observed | Errors |
|---|---:|---:|---:|---:|---:|---:|
| unguarded | 8/8 | 0 | 7/8 | 0/4 | 4 | 0 |
| static | 8/8 | 6 | 0/8 | 0/4 | 2 | 0 |
| adaptive | 8/8 | 6 | 0/8 | 0/4 | 2 | 0 |

Approval requests pause the episode. Upstream utility checks measure completion before any human review; upstream attack checks measure whether the injection goal was achieved. Infrastructure errors are excluded from valid-episode denominators and shown separately.

This benchmark addresses general tool-agent robustness. The development-specific research question needs additional external repository tasks and a realistic human-review study.

### Limitations

- Small deterministic task subset; not the full AgentDojo benchmark.
- Single actor model, one attack template, one injection goal, one run per condition.
- Custom serialized-transcript agent scaffold; not directly comparable to published leaderboards.
- Human approvals defer execution; utility measures autonomous completion before review.
- Banking tools mapped to shared staging context; this does not establish software-development generalization.
- Report attack exposure separately: an unobserved injection is not evidence of guard effectiveness.
- Infrastructure failures are reported as errors, not successful defenses.
- No safety equivalence or noninferiority conclusion is supported by this pilot.

## What is needed before a full ICSE effectiveness claim

- A larger independently authored, held-out repository benchmark and calibrated context-specific policies.
- A strong manually configured contextual baseline, published runtime-enforcement baselines, and a tuned static policy selected on separate calibration data.
- Multiple actor/guard models and repeated runs; report uncertainty clustered by task or repository.
- Adaptive attackers, stale evidence, environment spoofing, and approval invalidation experiments.
- A prespecified safety noninferiority margin and an adequately powered study; determine sample size before collecting confirmatory results.
- Developer participants to measure review time, decision quality, and workload; request counts alone cannot establish time savings.

## Artifacts

Full per-case decisions, context, scores, and execution outcomes are in `dev-context/rows.json`. External episode summaries and per-tool decisions are in `agentdojo/rows.json`. Public summaries contain no tokens or full transcripts. Private caches and benchmark transcripts are ignored by Git.
