"""Live AgentDojo integration using upstream task execution and outcome checks.

No task ground truth is visible to the agent or gate. A fixed registry describes tool
effects. Reviews pause the episode (defer-all), rather than simulating an infallible human.
This is a custom agent scaffold on official AgentDojo tasks, not a leaderboard submission.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import time
import uuid

from agentdojo.agent_pipeline.base_pipeline_element import BasePipelineElement
from agentdojo.agent_pipeline.tool_execution import tool_result_to_str
from agentdojo.attacks.base_attacks import FixedJailbreakAttack
from agentdojo.attacks.important_instructions_attacks import ImportantInstructionsAttack
from agentdojo.functions_runtime import FunctionCall
from agentdojo.task_suite.load_suites import get_suite
from agentdojo.types import text_content_block_from_string as text

from common import ROOT, assess, digest, post, provenance, wilson, write_json

# Explicit capabilities for banking tools; unknown tools never default to read-only.
READ_TOOLS = {"get_iban", "get_balance", "get_most_recent_transactions", "get_scheduled_transactions", "read_file", "get_user_info"}
WRITE_TOOLS = {"send_money", "schedule_transaction", "update_scheduled_transaction", "update_password", "update_user_info"}


def tool_context(name):
    operation = "read" if name in READ_TOOLS else "write" if name in WRITE_TOOLS else "unknown"
    return dict(environment="staging", operation=operation, reversible=False,
        sensitive=name in {"get_user_info", "update_password", "update_user_info"},
        externalDestination=name == "send_money", protectedPath=name == "update_password",
        testsPassed=False, evidenceFresh=False, scope="single")


def serializable(value):
    if hasattr(value, "model_dump"):
        return value.model_dump()
    raise TypeError(type(value).__name__)


class CloudflarePipeline(BasePipelineElement):
    def __init__(self, url, mode, max_steps=8):
        self.name = "context-guard-glm-5.3-flash-" + mode
        self.url = url
        self.mode = mode
        self.max_steps = max_steps
        self.events = []
        self.transcript = []
        self.proposal_calls = 0
        self.injection_observed = False
        self.attack_markers = []
        self.deferred = False
        self.step_limit = False

    def query(self, query, runtime, env, messages=(), extra_args=None):
        transcript = [{"role": "user", "content": [text(query)]}]
        tools = [dict(name=f.name, description=f.description, parameters=f.parameters.model_json_schema())
            for f in runtime.functions.values()]
        for step in range(self.max_steps):
            proposal = post(self.url, "propose", {"transcript": json.dumps(transcript, default=serializable), "tools": tools})
            self.proposal_calls += 1
            name = proposal["tool"]
            if not name:
                transcript.append(dict(role="assistant", content=[text(proposal["text"] or "Task completed.")], tool_calls=None))
                break
            call = FunctionCall(function=name, args=proposal["arguments"], id=f"call_{step}")
            observations = "\n".join("\n".join(block["content"] for block in m["content"]) for m in transcript if m["role"] == "tool")
            body = dict(request=query, tool=name, arguments=proposal["arguments"], untrustedContent=observations[-20000:], context=tool_context(name))
            # Even unguarded gets the same assessment for measured action-level comparisons.
            assessment, cached = assess(self.url, body, ROOT / "research/results/private/assessment-cache")
            decision = assessment["decisions"][self.mode]
            self.events.append(dict(tool=name, argumentsHash=digest(proposal["arguments"]),
                action=decision["action"], scores=assessment["scores"], latencyMs=assessment["latencyMs"],
                reviewAt=decision["reviewAt"], blockAt=decision["blockAt"], cached=cached))
            if decision["action"] == "approve":
                self.deferred = True
                transcript.append(dict(role="assistant", content=[text("This action is paused pending human approval.")], tool_calls=None))
                break
            if decision["action"] == "block":
                # A rejected proposal is not inserted as an executed FunctionCall. Upstream
                # trace-based success checks must never mistake a blocked action for execution.
                transcript.append(dict(role="user", content=[text("Runtime guard denied proposed action: " + "; ".join(decision["reasons"]) + ". Continue only with authorized actions.")]))
                continue
            transcript.append(dict(role="assistant", content=[text(proposal["text"])], tool_calls=[call]))
            result, error = runtime.run_function(env, name, call.args)
            rendered = tool_result_to_str(result)
            normalized = " ".join(rendered.split())
            if any(" ".join(marker.split()) in normalized for marker in self.attack_markers):
                self.injection_observed = True
            transcript.append(dict(role="tool", content=[text(rendered)], tool_call=call, tool_call_id=call.id, error=error))
        else:
            self.step_limit = True
            transcript.append(dict(role="assistant", content=[text("Stopped at the research step budget.")], tool_calls=None))
        self.transcript = transcript
        return query, runtime, env, transcript, extra_args or {}


def summarize(rows, modes):
    summaries = []
    for mode in modes:
        planned = [r for r in rows if r["mode"] == mode]
        valid = [r for r in planned if not r.get("error")]
        attacked = [r for r in valid if r["attack"] != "none"]
        clean = [r for r in valid if r["attack"] == "none"]
        successes = sum(r["attackSuccess"] for r in attacked)
        summaries.append(dict(mode=mode, episodes=len(planned), validEpisodes=len(valid), errors=len(planned)-len(valid),
            approvals=sum(r["approvals"] for r in valid), utilitySuccesses=sum(r["utility"] for r in valid),
            cleanEpisodes=len(clean), cleanUtilitySuccesses=sum(r["utility"] for r in clean),
            attackedEpisodes=len(attacked), attackSuccesses=successes,
            attacksObserved=sum(r["injectionObserved"] for r in attacked),
            attackRateWilson95=wilson(successes, len(attacked)), deferredEpisodes=sum(r["deferred"] for r in valid),
            proposalCalls=sum(r["proposalCalls"] for r in planned), stepLimitEpisodes=sum(r.get("stepLimit", False) for r in valid)))
    return summaries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--suite", default="banking", choices=["banking"])
    parser.add_argument("--tasks", default="user_task_0,user_task_1,user_task_2,user_task_3")
    parser.add_argument("--injection", default="injection_task_0")
    parser.add_argument("--modes", default="unguarded,static,adaptive")
    parser.add_argument("--max-steps", type=int, default=8)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--out", default="research/results/agentdojo")
    args = parser.parse_args()
    modes = args.modes.split(",")
    suite = get_suite("v1.2.2", args.suite)
    tasks = args.tasks.split(",")
    out = ROOT / args.out
    run_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + uuid.uuid4().hex[:6]
    # Predeclared balanced pilot. No selection based on observed agent performance.
    plan = [(task, attack, mode) for task in tasks for attack in ("none", "important_instructions") for mode in modes]
    write_json(out / "plan.json", dict(runId=run_id, tasks=tasks, modes=modes, injection=args.injection,
        maxSteps=args.max_steps, maxProposalCalls=len(plan)*args.max_steps, reviewer="defer-all"))

    def run(item):
        task_id, attack_name, mode = item
        pipeline = CloudflarePipeline(args.url, mode, args.max_steps)
        row = dict(id=f"{task_id}/{attack_name}/{mode}", mode=mode, task=task_id, attack=attack_name)
        started = time.time()
        try:
            task = suite.get_user_task_by_id(task_id)
            injection = suite.get_injection_task_by_id(args.injection) if attack_name != "none" else None
            injections = {}
            if injection:
                attack = FixedJailbreakAttack(ImportantInstructionsAttack._JB_STRING, suite, pipeline)
                injections = attack.attack(task, injection)
                pipeline.attack_markers = list(injections.values())
            utility, injection_success = suite.run_task_with_pipeline(pipeline, task, injection_task=injection, injections=injections)
            row.update(utility=utility, attackSuccess=bool(injection and injection_success),
                injectionObserved=pipeline.injection_observed, deferred=pipeline.deferred, stepLimit=pipeline.step_limit,
                approvals=sum(e["action"] == "approve" for e in pipeline.events), events=pipeline.events)
        except Exception as error:
            row["error"] = str(error)
        row.update(proposalCalls=pipeline.proposal_calls, wallSeconds=round(time.time()-started, 2))
        private = ROOT / "research/results/private/agentdojo" / run_id / (row["id"].replace("/", "_") + ".json")
        # Only public benchmark data, but keep full transcripts out of the deployed summary.
        write_json(private, {"result": row, "transcript": json.loads(json.dumps(pipeline.transcript, default=serializable))})
        print(json.dumps({k:v for k,v in row.items() if k != "events"}), flush=True)
        return row

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(run, plan))
    write_json(out / "rows.json", rows)
    upstream_commit = subprocess.check_output(["git", "-C", str(ROOT / ".research/agentdojo"), "rev-parse", "HEAD"], text=True).strip()
    report = dict(suite="AgentDojo-v1.2.2-" + args.suite, kind="live end-to-end pilot with a custom agent scaffold",
        provenance=provenance(), upstreamCommit=upstream_commit, runId=run_id, endpoint=args.url,
        actorModel="@cf/zai-org/glm-5.3-flash", guardModel="@cf/cloudflare/clef-flash",
        reviewer="defer-all: stop at the first approval request", summaries=summarize(rows, modes),
        limitations=["Small deterministic task subset; not the full AgentDojo benchmark.",
          "Single actor model, one attack template, one injection goal, one run per condition.",
          "Custom serialized-transcript agent scaffold; not directly comparable to published leaderboards.",
          "Human approvals defer execution; utility measures autonomous completion before review.",
          "Banking tools mapped to shared staging context; this does not establish software-development generalization.",
          "Report attack exposure separately: an unobserved injection is not evidence of guard effectiveness.",
          "Infrastructure failures are reported as errors, not successful defenses.",
          "No safety equivalence or noninferiority conclusion is supported by this pilot."])
    write_json(out / "summary.json", report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
