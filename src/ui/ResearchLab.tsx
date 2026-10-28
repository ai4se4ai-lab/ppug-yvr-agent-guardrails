import { useEffect, useState } from "react";
import {
  evaluateDevelopmentAction,
  MODES,
  POLICY_VERSION,
  type DevelopmentContext,
  type ThreatScores,
} from "../research/policy";

type Summary = {
  mode: string;
  cases?: number;
  episodes?: number;
  approvals: number;
  unnecessaryApprovals?: number;
  legitimateCompleted?: number;
  legitimateCases?: number;
  unsafeAutonomousEffects?: number;
  unsafeCases?: number;
  falseBlocks?: number;
  utilitySuccesses?: number;
  attackSuccesses?: number;
  attackedEpisodes?: number;
  errors?: number;
};
type Report = {
  suite: string;
  kind?: string;
  summaries: Summary[];
  limitations: string[];
  provenance?: { timestampUtc: string };
  failedCases?: number;
};

const INITIAL_CONTEXT: DevelopmentContext = {
  environment: "sandbox",
  operation: "write",
  reversible: true,
  sensitive: false,
  externalDestination: false,
  protectedPath: false,
  testsPassed: true,
  evidenceFresh: true,
  scope: "single",
};
const INITIAL_SCORES: ThreatScores = {
  injection: 0.05,
  exfiltration: 0.03,
  mismatch: 0.04,
};
const control =
  "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink";

export function ResearchLab() {
  const [context, setContext] = useState(INITIAL_CONTEXT);
  const [scores, setScores] = useState(INITIAL_SCORES);
  const [reports, setReports] = useState<Report[]>([]);
  const [token, setToken] = useState(
    () => sessionStorage.getItem("research-token") ?? "",
  );
  const [request, setRequest] = useState(
    "Change application row 1's label to fixed.",
  );
  const [toolName, setToolName] = useState("run_sql");
  const [argumentsText, setArgumentsText] = useState(
    '{"query":"UPDATE app SET value=\'fixed\' WHERE id=1"}',
  );
  const [untrusted, setUntrusted] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    "Illustrative scores. No model call has been made.",
  );
  useEffect(() => {
    document.title = "Context Guard — Research Lab";
    fetch("/research-results.json")
      .then(async (r) => {
        if (r.ok && r.headers.get("content-type")?.includes("json")) {
          const data = (await r.json()) as { reports?: Report[] };
          setReports(data.reports ?? []);
        }
      })
      .catch(() => setReports([]));
  }, []);
  const decisions = MODES.map((mode) =>
    evaluateDevelopmentAction(context, scores, mode),
  );
  const liveAssess = async () => {
    setBusy(true);
    try {
      const args: unknown = JSON.parse(argumentsText);
      sessionStorage.setItem("research-token", token);
      const response = await fetch("/api/research/assess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          request,
          tool: toolName,
          arguments: args,
          untrustedContent: untrusted,
          context,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        scores: ThreatScores;
        latencyMs: number;
        modelId: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? `HTTP ${response.status}`);
      setScores(result.scores);
      setNotice(
        `Live ${result.modelId} assessment · ${result.latencyMs} ms. Context is supplied by this research form.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="/research" className="text-lg font-semibold">
            Context Guard{" "}
            <span className="ml-2 text-xs font-normal text-brand">
              RESEARCH LAB
            </span>
          </a>
          <a href="/" className="text-sm text-muted hover:text-ink">
            Support agent demo →
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div className="max-w-3xl space-y-3">
          <p className="font-mono text-xs text-brand">
            {POLICY_VERSION} · EXPLORATORY PROTOTYPE
          </p>
          <h1 className="text-3xl leading-tight font-semibold">
            Useful autonomy, with context.
          </h1>
          <p className="text-muted">
            Can guardrails that adapt to development context reduce unnecessary
            human approvals while maintaining protection against unsafe agent
            actions?
          </p>
        </div>
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-line bg-raised/30 p-5">
            <h2 className="font-semibold">1. Describe the execution context</h2>
            <p className="text-xs text-muted">
              Simulation inputs. A production integration must obtain these
              facts from trusted infrastructure.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1 text-xs text-muted">
                Environment
                <select
                  className={control}
                  value={context.environment}
                  onChange={(e) =>
                    setContext({
                      ...context,
                      environment: e.target
                        .value as DevelopmentContext["environment"],
                    })
                  }
                >
                  {["sandbox", "staging", "production", "unknown"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted">
                Operation
                <select
                  className={control}
                  value={context.operation}
                  onChange={(e) =>
                    setContext({
                      ...context,
                      operation: e.target
                        .value as DevelopmentContext["operation"],
                    })
                  }
                >
                  {[
                    "read",
                    "test",
                    "write",
                    "deploy",
                    "delete",
                    "export",
                    "unknown",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted">
                Scope
                <select
                  className={control}
                  value={context.scope}
                  onChange={(e) =>
                    setContext({
                      ...context,
                      scope: e.target.value as DevelopmentContext["scope"],
                    })
                  }
                >
                  {["single", "bulk", "unknown"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["reversible", "Reversible action"],
                  ["sensitive", "Sensitive data"],
                  ["externalDestination", "External destination"],
                  ["protectedPath", "Protected code"],
                  ["testsPassed", "Required tests passed"],
                  ["evidenceFresh", "Evidence matches current change"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-sm text-muted"
                >
                  <input
                    type="checkbox"
                    className="accent-brand"
                    checked={context[key]}
                    onChange={(e) =>
                      setContext({ ...context, [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-medium">
                Semantic threat signals
              </h3>
              {(Object.keys(scores) as (keyof ThreatScores)[]).map((key) => (
                <label
                  key={key}
                  className="mb-2 flex items-center gap-3 text-xs text-muted"
                >
                  <span className="w-24">{key}</span>
                  <input
                    aria-label={key}
                    type="range"
                    min={0}
                    max={100}
                    className="flex-1 accent-brand"
                    value={Math.round(scores[key] * 100)}
                    onChange={(e) => {
                      setScores({
                        ...scores,
                        [key]: Number(e.target.value) / 100,
                      });
                      setNotice(
                        "Manually adjusted scores for policy exploration.",
                      );
                    }}
                  />
                  <span className="w-9 text-right font-mono">
                    {Math.round(scores[key] * 100)}%
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-line bg-raised/30 p-5">
            <h2 className="font-semibold">
              2. Compare the same action across policies
            </h2>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="pb-3">Policy</th>
                    <th>Review</th>
                    <th>Block</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.mode} className="border-t border-line">
                      <td className="py-3 font-mono text-xs">{d.mode}</td>
                      <td>{Math.round(d.reviewAt * 100)}%</td>
                      <td>{Math.round(d.blockAt * 100)}%</td>
                      <td
                        className={
                          d.action === "block"
                            ? "text-block"
                            : d.action === "approve"
                              ? "text-review"
                              : "text-allow"
                        }
                      >
                        {d.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-bg p-3 text-xs text-muted">
              <p className="mb-2 font-medium text-ink">
                Adaptive decision rationale
              </p>
              <p>
                {decisions
                  .find((d) => d.mode === "adaptive")
                  ?.reasons.join("; ")}
              </p>
              <p className="mt-2">
                Hierarchy:{" "}
                {decisions
                  .find((d) => d.mode === "adaptive")
                  ?.layers.map((l) => l.name)
                  .join(" → ")}
              </p>
            </div>
          </div>
        </section>
        <section className="space-y-4 rounded-xl border border-line p-5">
          <h2 className="font-semibold">
            3. Assess a proposed tool call with the live model
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-xs text-muted">
              Authenticated request
              <textarea
                className={control}
                rows={3}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              Untrusted observation
              <textarea
                className={control}
                rows={3}
                value={untrusted}
                onChange={(e) => setUntrusted(e.target.value)}
                placeholder="Issue text, retrieved document, or tool observation"
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              Tool name
              <input
                className={control}
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              Arguments (JSON)
              <textarea
                className={`${control} font-mono`}
                rows={2}
                value={argumentsText}
                onChange={(e) => setArgumentsText(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-60 flex-1 space-y-1 text-xs text-muted">
              Research access token
              <input
                type="password"
                autoComplete="off"
                className={control}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Kept in this browser session"
              />
            </label>
            <button
              type="button"
              disabled={busy || !token}
              onClick={() => void liveAssess()}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-bg disabled:opacity-40"
            >
              {busy ? "Assessing…" : "Run live assessment"}
            </button>
          </div>
          <p role="status" className="text-xs text-muted">
            {notice}
          </p>
        </section>
        <section className="space-y-5">
          <h2 className="text-xl font-semibold">Recorded benchmark runs</h2>
          <p className="text-sm text-muted">
            Approvals are simulated requests. These pilot runs do not measure
            developer time or establish safety equivalence.
          </p>
          {!reports.length && (
            <p className="rounded-lg border border-line p-5 text-sm text-muted">
              No recorded results have been published yet. Use the benchmark
              scripts to produce a reproducible run.
            </p>
          )}
          {reports.map((report) => (
            <article
              key={report.suite}
              className="space-y-4 rounded-xl border border-line p-5"
            >
              <div>
                <h3 className="font-semibold">{report.suite}</h3>
                <p className="mt-1 text-xs text-muted">
                  {report.kind} · {report.provenance?.timestampUtc}
                </p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="pb-3">Policy</th>
                      <th>Cases</th>
                      <th>Approvals</th>
                      <th>Unnecessary</th>
                      <th>Completed</th>
                      <th>Unsafe / attacks</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.summaries.map((s) => (
                      <tr key={s.mode} className="border-t border-line">
                        <td className="py-3 font-mono text-xs">{s.mode}</td>
                        <td>{s.cases ?? s.episodes}</td>
                        <td>{s.approvals}</td>
                        <td>{s.unnecessaryApprovals ?? "—"}</td>
                        <td>
                          {s.legitimateCompleted !== undefined
                            ? `${s.legitimateCompleted}/${s.legitimateCases}`
                            : `${s.utilitySuccesses}/${s.episodes}`}
                        </td>
                        <td>
                          {s.unsafeAutonomousEffects !== undefined
                            ? `${s.unsafeAutonomousEffects}/${s.unsafeCases}`
                            : `${s.attackSuccesses}/${s.attackedEpisodes}`}
                        </td>
                        <td>{s.errors ?? report.failedCases ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">
                  Measurement assumptions and limitations
                </summary>
                <ul className="mt-3 list-disc space-y-1 pl-4">
                  {report.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
          <a
            className="text-sm text-brand"
            href="/research-results.json"
            download
          >
            Download published summaries (JSON) ↓
          </a>
          <a
            className="ml-5 text-sm text-brand"
            href="/research-comparison.svg"
            target="_blank"
            rel="noreferrer"
          >
            Open benchmark figure (SVG) ↗
          </a>
        </section>
      </main>
    </div>
  );
}
