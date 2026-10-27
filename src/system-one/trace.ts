import { MAX_TRACES, type DecisionTrace, type TraceRow } from "../shared";
import type { ClefAnswers, ClefQuestions } from "./clef";
import type { ClairicAnswers, ClairicFields } from "./clairic";
import { estimateCostUsd, type SystemOneCall } from "./run";

type TraceExtras = Pick<
  DecisionTrace,
  "step" | "verdict" | "summary" | "inputPreview"
>;

export function buildTrace(
  call: SystemOneCall,
  rows: TraceRow[],
  extras: TraceExtras,
): DecisionTrace {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    modelId: call.modelId,
    latencyMs: call.latencyMs,
    inputTokens: call.inputTokens,
    costUsd: estimateCostUsd(call.modelId, call.inputTokens),
    gatewayLogId: call.gatewayLogId,
    rows,
    ...extras,
  };
}

/** Newest first, capped so agent state (synced to every client) stays small. */
export function appendTrace(
  traces: DecisionTrace[],
  trace: DecisionTrace,
): DecisionTrace[] {
  return [trace, ...traces].slice(0, MAX_TRACES);
}

export function clefRows<Q extends ClefQuestions>(
  questions: Q,
  answers: ClefAnswers<Q>,
): TraceRow[] {
  return Object.keys(questions).map((id): TraceRow => {
    const answer = answers[id];
    if (!answer) return { kind: "value", label: id, value: "no answer" };
    if (answer.type === "noul")
      return { kind: "probability", label: id, value: answer.noul };
    if (answer.type === "choice") {
      return {
        kind: "choice",
        label: id,
        choice: answer.choice,
        options: answer.probabilities,
      };
    }
    const legend = answer.legend[String(Math.round(answer.score))];
    return {
      kind: "choice",
      label: id,
      choice:
        typeof legend === "string" ? legend : String(Math.round(answer.score)),
      options: Object.fromEntries(
        Object.entries(answer.probabilities).map(([level, p]) => {
          const name = answer.legend[level];
          return [typeof name === "string" ? name : level, p];
        }),
      ),
    };
  });
}

export function clairicRows<F extends ClairicFields>(
  fields: F,
  answers: ClairicAnswers<F>,
): TraceRow[] {
  return Object.keys(fields).map((name): TraceRow => {
    const answer = answers[name];
    if (!answer) return { kind: "value", label: name, value: "no answer" };
    switch (answer.type) {
      case "list":
        return {
          kind: "value",
          label: name,
          value: answer.value.length ? answer.value.join(", ") : "(none found)",
          confidence: answer.confidence,
        };
      case "estimate":
        return {
          kind: "interval",
          label: name,
          median: Number(answer.median),
          p10: Number(answer.p10),
          p90: Number(answer.p90),
          unit:
            "unit" in fields[name]
              ? (fields[name] as { unit?: string }).unit
              : undefined,
        };
      case "forecast":
        return {
          kind: "value",
          label: name,
          value: answer.median
            .map((v) => Math.round(v * 100) / 100)
            .join(" -> "),
        };
      default:
        return {
          kind: "value",
          label: name,
          value: answer.value === null ? "null" : String(answer.value),
          confidence: answer.confidence,
          hint:
            answer.value === null && answer.guess !== undefined
              ? `guess: ${answer.guess}`
              : undefined,
        };
    }
  });
}

export function preview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
