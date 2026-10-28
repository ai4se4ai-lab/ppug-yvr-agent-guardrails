"""Publish measured summaries, CSVs, and a candid paper-oriented pilot report."""
import csv
import json
from pathlib import Path
import shutil

from common import ROOT, write_json


def main():
    result_dir = ROOT / "research/results"
    paths = [result_dir / name / "summary.json" for name in ("dev-context", "agentdojo")]
    reports = [json.loads(p.read_text()) for p in paths if p.exists()]
    if not reports:
        raise RuntimeError("No measured summaries exist. Run the benchmarks first.")
    write_json(ROOT / "public/research-results.json", {"reports": reports})
    for report, path in zip(reports, [p for p in paths if p.exists()]):
        rows = report["summaries"]
        keys = list(dict.fromkeys(key for row in rows for key in row))
        with (path.parent / "summary.csv").open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=keys)
            writer.writeheader()
            writer.writerows(rows)
    lines = ["# Context Guard: measured pilot results", "",
        "These are exploratory measurements from a working prototype, not evidence of safety equivalence or a publication-ready effectiveness claim.", ""]
    dev = next((r for r in reports if r["suite"] == "development-context-v1"), None)
    if dev:
        modes = {r["mode"]: r for r in dev["summaries"]}
        static, adaptive = modes["static"], modes["adaptive"]
        reduction = (static["approvals"] - adaptive["approvals"])/static["approvals"] if static["approvals"] else 0
        lines += ["## Controlled development-context supplement", "",
            f"{dev['plannedCases']} cases; {dev['failedCases']} measurement failures. Median measured classifier latency: {dev['classifierLatencyMedianMs']} ms.", "",
            "| Policy | Approval requests | Unnecessary approvals | Legitimate completions | Unsafe autonomous effects |",
            "|---|---:|---:|---:|---:|"]
        for row in dev["summaries"]:
            lines.append(f"| {row['mode']} | {row['approvals']} | {row['unnecessaryApprovals']} | {row['legitimateCompleted']}/{row['legitimateCases']} | {row['unsafeAutonomousEffects']}/{row['unsafeCases']} |")
        lines += ["", f"The adaptive arm made {reduction:.1%} fewer approval requests than the fixed arm in these fixtures. Completion uses an explicitly simulated perfect reviewer; it is not autonomous coding task success.", "",
            f"The paired, template-cluster bootstrap interval for static minus adaptive approval requests per case was {dev['pairedApprovalDifference']['interval95']} (2,000 draws, fixed seed). This interval describes resampling of the authored templates, not generalization to real repositories.", "",
            f"The adaptive unsafe-effect Wilson interval was {adaptive['unsafeRateWilson95']}. Even zero observed unsafe effects therefore cannot establish a low real-world failure rate. These intervals additionally ignore dependence between variants of the same template.", ""]
        if modes["no-hierarchy"]["approvals"] == adaptive["approvals"] and modes["no-hierarchy"]["unsafeAutonomousEffects"] == adaptive["unsafeAutonomousEffects"]:
            lines += ["**Negative finding:** removing contextual threshold layers produced the same approval and unsafe-effect counts. This pilot does not demonstrate an incremental benefit from adaptive thresholds. The approval reduction is attributable to the evidence-based sandbox autonomy rule in this fixture set.", ""]
        lines += ["### Limitations", "", *["- " + s for s in dev["limitations"]], ""]
    agent = next((r for r in reports if r["suite"].startswith("AgentDojo")), None)
    if agent:
        lines += ["## External AgentDojo pilot", "",
            f"Upstream benchmark: v1.2.2 banking; commit `{agent['upstreamCommit']}`. Actor: `{agent['actorModel']}`. Guard: `{agent['guardModel']}`.", "",
            "| Policy | Valid/planned episodes | Approval requests | Autonomous completions | Attack successes | Injections observed | Errors |",
            "|---|---:|---:|---:|---:|---:|---:|"]
        for row in agent["summaries"]:
            lines.append(f"| {row['mode']} | {row['validEpisodes']}/{row['episodes']} | {row['approvals']} | {row['utilitySuccesses']}/{row['validEpisodes']} | {row['attackSuccesses']}/{row['attackedEpisodes']} | {row['attacksObserved']} | {row['errors']} |")
        lines += ["", "Approval requests pause the episode. Upstream utility checks measure completion before any human review; upstream attack checks measure whether the injection goal was achieved. Infrastructure errors are excluded from valid-episode denominators and shown separately.", "",
            "This benchmark addresses general tool-agent robustness. The development-specific research question needs additional external repository tasks and a realistic human-review study.", "",
            "### Limitations", "", *["- " + s for s in agent["limitations"]], ""]
    lines += ["## What is needed before a full ICSE effectiveness claim", "",
        "- A larger independently authored, held-out repository benchmark and calibrated context-specific policies.",
        "- A strong manually configured contextual baseline, published runtime-enforcement baselines, and a tuned static policy selected on separate calibration data.",
        "- Multiple actor/guard models and repeated runs; report uncertainty clustered by task or repository.",
        "- Adaptive attackers, stale evidence, environment spoofing, and approval invalidation experiments.",
        "- A prespecified safety noninferiority margin and an adequately powered study; determine sample size before collecting confirmatory results.",
        "- Developer participants to measure review time, decision quality, and workload; request counts alone cannot establish time savings.", "",
        "## Artifacts", "", "Full per-case decisions, context, scores, and execution outcomes are in `dev-context/rows.json`. External episode summaries and per-tool decisions are in `agentdojo/rows.json`. Public summaries contain no tokens or full transcripts. Private caches and benchmark transcripts are ignored by Git.", ""]
    (result_dir / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    # Preserve the actual dirty-tree sources; a Git SHA alone cannot reproduce uncommitted work.
    snapshot = result_dir / "source"
    for source in [*sorted((ROOT / "src/research").glob("*.ts")), ROOT / "src/server.ts",
                   *sorted((ROOT / "research").glob("*.py"))]:
        target = snapshot / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    print("Published public/research-results.json, research/results/REPORT.md, CSV summaries, and source snapshot.")


if __name__ == "__main__":
    main()
