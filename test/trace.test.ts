import { describe, expect, it } from "vitest";
import { MAX_TRACES, type DecisionTrace } from "../src/shared";
import {
  appendTrace,
  buildTrace,
  clairicRows,
  clefRows,
  preview,
} from "../src/system-one/trace";

describe("trace helpers", () => {
  it("builds a trace with cost from input tokens", () => {
    const trace = buildTrace(
      {
        modelId: "@cf/cloudflare/clef",
        latencyMs: 120,
        inputTokens: 1_000_000,
      },
      [],
      {
        step: "Test",
      },
    );
    expect(trace.costUsd).toBeCloseTo(0.24);
    expect(trace.step).toBe("Test");
  });

  it("keeps newest first and caps length", () => {
    let traces: DecisionTrace[] = [];
    for (let i = 0; i < MAX_TRACES + 5; i++) {
      traces = appendTrace(
        traces,
        buildTrace({ modelId: "m", latencyMs: i, inputTokens: 0 }, [], {
          step: `${i}`,
        }),
      );
    }
    expect(traces).toHaveLength(MAX_TRACES);
    expect(traces[0]?.step).toBe(`${MAX_TRACES + 4}`);
  });

  it("maps Clef answers to rows, using score legends as labels", () => {
    const rows = clefRows(
      {
        risky: { type: "noul", instructions: "?" },
        level: { type: "score", instructions: "?", criteria: ["low", "high"] },
      },
      {
        risky: { type: "noul", noul: 0.8 },
        level: {
          type: "score",
          score: 0.9,
          legend: { "0": "low", "1": "high" },
          probabilities: { "0": 0.1, "1": 0.9 },
          confidence: 0.8,
        },
      },
    );
    expect(rows[0]).toEqual({
      kind: "probability",
      label: "risky",
      value: 0.8,
    });
    expect(rows[1]).toMatchObject({
      kind: "choice",
      choice: "high",
      options: { low: 0.1, high: 0.9 },
    });
  });

  it("maps Clairic answers to rows and shows guesses for nulls", () => {
    const rows = clairicRows(
      {
        po: { type: "text" },
        eta: { type: "estimate", min: 0, max: 10, unit: "days" },
      },
      {
        po: { type: "text", value: null, guess: "INV-1", confidence: 0.4 },
        eta: { type: "estimate", value: 3, median: 3, p10: 2, p90: 5 },
      },
    );
    expect(rows[0]).toMatchObject({
      kind: "value",
      value: "null",
      hint: "guess: INV-1",
    });
    expect(rows[1]).toEqual({
      kind: "interval",
      label: "eta",
      median: 3,
      p10: 2,
      p90: 5,
      unit: "days",
    });
  });

  it("previews long input on one line", () => {
    expect(preview("a\n\nb", 10)).toBe("a b");
    expect(preview("x".repeat(20), 10)).toHaveLength(10);
  });
});
