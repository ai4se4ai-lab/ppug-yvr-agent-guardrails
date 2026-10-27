import { Lightning, Trash } from "@phosphor-icons/react";
import type { DecisionTrace, TraceRow } from "../shared";
import {
  Chip,
  ProbBar,
  VerdictBadge,
  cx,
  formatPct,
  formatUsd,
} from "./primitives";

const MODEL_LABELS: Record<string, string> = {
  "@cf/cloudflare/clef": "clef",
  "@cf/cloudflare/clef-flash": "clef-flash",
  "@cf/cloudflare/clef-omni": "clef-omni",
  "@cf/cloudflare/clairic": "clairic",
};

/** Question ids that read as "bad if high" get a red/amber/green scale. */
const DANGER =
  /(inject|jailbreak|phish|malicious|toxic|pii|secret|leak|risk|unsafe|fraud|spam|credential|exfil|sensitive|harm)/i;

function Row({ row }: { row: TraceRow }) {
  switch (row.kind) {
    case "probability":
      return (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-mono text-muted">{row.label}</span>
            <span className="font-mono tabular-nums">
              {formatPct(row.value)}
            </span>
          </div>
          <ProbBar value={row.value} danger={DANGER.test(row.label)} />
        </div>
      );
    case "choice": {
      const options = Object.entries(row.options).sort((a, b) => b[1] - a[1]);
      return (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-mono text-muted">{row.label}</span>
            <span className="truncate font-medium text-ink">{row.choice}</span>
          </div>
          <div className="space-y-0.5">
            {options.slice(0, 4).map(([name, p]) => (
              <div
                key={name}
                className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-2 text-[11px]"
              >
                <span
                  className={cx(
                    "truncate",
                    name === row.choice ? "text-ink" : "text-faint",
                  )}
                >
                  {name}
                </span>
                <ProbBar value={p} />
                <span className="text-right font-mono text-faint tabular-nums">
                  {formatPct(p)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "interval":
      return (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-mono text-muted">{row.label}</span>
          <span className="font-mono tabular-nums">
            {row.median.toLocaleString()} {row.unit}
            <span className="ml-1 text-faint">
              [{row.p10.toLocaleString()}–{row.p90.toLocaleString()}]
            </span>
          </span>
        </div>
      );
    case "value":
      return (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="shrink-0 font-mono text-muted">{row.label}</span>
          <span className="min-w-0 text-right wrap-break-word">
            {row.value}
            {row.confidence !== undefined && (
              <span className="ml-1 font-mono text-faint">
                {formatPct(row.confidence)}
              </span>
            )}
            {row.hint && (
              <span className="block font-mono text-[10px] text-faint">
                {row.hint}
              </span>
            )}
          </span>
        </div>
      );
  }
}

function TraceCard({ trace }: { trace: DecisionTrace }) {
  return (
    <article className="rounded-xl border border-line bg-panel/80 p-3 shadow-sm">
      <header className="mb-2 flex items-center gap-2">
        <span className="truncate text-sm font-medium">{trace.step}</span>
        {trace.verdict && <VerdictBadge verdict={trace.verdict} />}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {new Date(trace.at).toLocaleTimeString([], { hour12: false })}
        </span>
      </header>
      {trace.summary && (
        <p className="mb-2 text-xs text-muted">{trace.summary}</p>
      )}
      {trace.inputPreview && (
        <p className="mb-2 line-clamp-2 border-l-2 border-line pl-2 font-mono text-[11px] text-faint">
          {trace.inputPreview}
        </p>
      )}
      <div className="space-y-2">
        {trace.rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </div>
      <footer className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{MODEL_LABELS[trace.modelId] ?? trace.modelId}</Chip>
        <Chip title="End-to-end latency from the Worker">
          <Lightning weight="fill" className="text-brand" />
          {trace.latencyMs}ms
        </Chip>
        <Chip title="Input tokens (System One models bill input only)">
          {trace.inputTokens} tok
        </Chip>
        <Chip title="Estimated cost of this call">
          {formatUsd(trace.costUsd)}
        </Chip>
        {trace.gatewayLogId && (
          <Chip title={`AI Gateway log ${trace.gatewayLogId}`}>gw log</Chip>
        )}
      </footer>
    </article>
  );
}

export function TracePanel({
  traces,
  onClear,
}: {
  traces: DecisionTrace[];
  onClear: () => void;
}) {
  const totalMs = traces.reduce((sum, t) => sum + t.latencyMs, 0);
  const totalCost = traces.reduce((sum, t) => sum + t.costUsd, 0);
  return (
    <aside className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Decision Trace</h2>
        <span className="font-mono text-[10px] text-faint">System One</span>
        {traces.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto rounded-md p-1 text-faint transition hover:bg-raised hover:text-ink"
            title="Clear traces"
          >
            <Trash size={14} />
          </button>
        )}
      </div>
      {traces.length > 0 && (
        <div className="flex gap-4 border-b border-line px-4 py-2 font-mono text-[11px] text-muted">
          <span>{traces.length} calls</span>
          <span>avg {Math.round(totalMs / traces.length)}ms</span>
          <span>total {formatUsd(totalCost)}</span>
        </div>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {traces.length === 0 ? (
          <div className="mt-10 text-center text-sm text-faint">
            <p>No decisions yet.</p>
            <p className="mt-1 text-xs">
              Every Clef and Clairic call lands here with probabilities, latency
              and cost.
            </p>
          </div>
        ) : (
          traces.map((trace) => <TraceCard key={trace.id} trace={trace} />)
        )}
      </div>
    </aside>
  );
}
