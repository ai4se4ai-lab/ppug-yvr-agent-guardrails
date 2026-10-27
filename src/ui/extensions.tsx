import { ShieldCheck, ShieldSlash } from "@phosphor-icons/react";
import { useState } from "react";
import type { AgentState, FirewallPolicy } from "../shared";
import { cx } from "./primitives";

export type ExtensionProps = {
  state: AgentState;
  /** Call a `@callable()` method on your agent, e.g. `call("setPolicy", [policy])`. */
  call: (method: string, args: unknown[]) => Promise<unknown>;
};

function Slider({
  label,
  value,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  tone: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className={cx("font-mono", tone)}>
          {Math.round(value * 100)}%
        </span>
      </span>
      <input
        type="range"
        min={5}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-brand"
      />
    </label>
  );
}

/** Live firewall policy: thresholds apply to the very next message, no redeploy needed. */
export function SidebarExtras({ state, call }: ExtensionProps) {
  // Optimistic value while the RPC is in flight; the synced agent state is the source of truth.
  const [pending, setPending] = useState<FirewallPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = pending ?? state.policy;

  const save = (next: FirewallPolicy) => {
    setPending(next);
    setError(null);
    call("setPolicy", [next])
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setPending(null));
  };

  const { stats } = state;
  return (
    <section className="space-y-3 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        {draft.enabled ? (
          <ShieldCheck weight="fill" className="text-allow" />
        ) : (
          <ShieldSlash weight="fill" className="text-block" />
        )}
        <h2 className="text-sm font-semibold tracking-tight">
          Agent Guardrails
        </h2>
        <button
          type="button"
          onClick={() => save({ ...draft, enabled: !draft.enabled })}
          className={cx(
            "ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1",
            draft.enabled
              ? "bg-allow/10 text-allow ring-allow/30"
              : "bg-block/10 text-block ring-block/30",
          )}
        >
          {draft.enabled ? "ON" : "OFF"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["checked", stats.checked, "text-ink"],
          ["warned", stats.warned, "text-review"],
          ["blocked", stats.blocked, "text-block"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg bg-raised/60 py-1.5">
            <div
              className={cx(
                "font-mono text-lg font-semibold tabular-nums",
                String(tone),
              )}
            >
              {value}
            </div>
            <div className="text-[10px] tracking-wider text-faint uppercase">
              {label}
            </div>
          </div>
        ))}
      </div>
      <Slider
        label="Block at"
        value={draft.blockAt}
        tone="text-block"
        onChange={(blockAt) =>
          save({
            ...draft,
            blockAt,
            reviewAt: Math.min(draft.reviewAt, blockAt),
          })
        }
      />
      <Slider
        label="Review / approval at"
        value={draft.reviewAt}
        tone="text-review"
        onChange={(reviewAt) =>
          save({
            ...draft,
            reviewAt,
            blockAt: Math.max(draft.blockAt, reviewAt),
          })
        }
      />
      {error && <p className="text-xs text-block">{error}</p>}
    </section>
  );
}
