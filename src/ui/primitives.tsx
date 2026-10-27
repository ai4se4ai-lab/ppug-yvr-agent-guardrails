import type { ReactNode } from "react";
import type { Verdict } from "../shared";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const VERDICT_STYLES: Record<Verdict, string> = {
  allow: "bg-allow/10 text-allow ring-allow/30",
  review: "bg-review/10 text-review ring-review/30",
  block: "bg-block/10 text-block ring-block/30",
  info: "bg-info/10 text-info ring-info/30",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ring-1",
        VERDICT_STYLES[verdict],
      )}
    >
      {verdict}
    </span>
  );
}

export function Chip({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted"
    >
      {children}
    </span>
  );
}

/** Probability as a bar. `danger` flips the colour scale for "bad if high" questions. */
export function ProbBar({
  value,
  danger = false,
}: {
  value: number;
  danger?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tone = danger
    ? value >= 0.7
      ? "bg-block"
      : value >= 0.4
        ? "bg-review"
        : "bg-allow"
    : "bg-brand";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500",
          tone,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function formatPct(value: number) {
  if (value > 0 && value < 0.001) return "<0.1%";
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

export function formatUsd(value: number) {
  if (value === 0) return "$0";
  return `$${value.toFixed(8).replace(/0+$/, "")}`;
}
