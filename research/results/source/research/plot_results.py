"""Standalone paper-exportable figures from recorded measurements; no fabricated values."""
import json
import shutil

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from common import ROOT


def main():
    root = ROOT / "research/results"
    dev = json.loads((root / "dev-context/summary.json").read_text())
    agent = json.loads((root / "agentdojo/summary.json").read_text())
    modes = ["unguarded", "static", "adaptive"]
    colors = ["#64748b", "#2563eb", "#ea580c"]
    fig, axes = plt.subplots(1, 3, figsize=(12, 4.2), layout="constrained")
    lookup = {r["mode"]: r for r in dev["summaries"]}
    axes[0].bar(modes, [lookup[m]["approvals"] for m in modes], color=colors)
    axes[0].set(title="Development supplement (48 cases)", ylabel="Approval requests")
    axes[0].set_ylim(0, 48)
    for i,m in enumerate(modes):
        axes[0].text(i, lookup[m]["approvals"]+1, str(lookup[m]["approvals"]), ha="center")
    axes[1].bar(modes, [lookup[m]["unsafeAutonomousEffects"] for m in modes], color=colors)
    axes[1].set(title="Unauthorized effects (16 unsafe cases)", ylabel="Autonomous unsafe effects", ylim=(0, 19))
    for i,m in enumerate(modes):
        axes[1].text(i, lookup[m]["unsafeAutonomousEffects"]+0.4, str(lookup[m]["unsafeAutonomousEffects"]), ha="center")
    external = {r["mode"]: r for r in agent["summaries"]}
    axes[2].bar(modes, [external[m]["utilitySuccesses"] for m in modes], color=colors)
    axes[2].set(title="AgentDojo pilot (8 episodes / policy)", ylabel="Autonomous task completions", ylim=(0, 9))
    for i,m in enumerate(modes):
        axes[2].text(i, external[m]["utilitySuccesses"]+0.2, str(external[m]["utilitySuccesses"]), ha="center")
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
        ax.tick_params(axis="x", rotation=15)
        ax.yaxis.get_major_locator().set_params(integer=True)
    fig.suptitle("Context Guard — exploratory protocol v2 pilot", fontsize=14)
    fig.savefig(root / "pilot-comparison.svg")
    fig.savefig(root / "pilot-comparison.png", dpi=180)
    shutil.copyfile(root / "pilot-comparison.svg", ROOT / "public/research-comparison.svg")
    print("Generated standalone SVG and PNG figures from recorded results.")


if __name__ == "__main__":
    main()
