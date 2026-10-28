import { describe, expect, it } from "vitest";
import {
  contextSchema,
  evaluateDevelopmentAction,
  MODES,
  resolvePolicy,
  type DevelopmentContext,
} from "../src/research/policy";
import { assessmentSchema } from "../src/research/schema";
import { evaluateToolCall } from "../src/firewall/tool-gate";
import { DEFAULT_POLICY } from "../src/shared";
import { authorized, readBody, type ResearchEnv } from "../src/research/http";

const context: DevelopmentContext = {
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
const clean = { injection: 0.01, exfiltration: 0.01, mismatch: 0.01 };
const answer = (noul: number) => ({ type: "noul" as const, noul });

describe("contextual execution policy", () => {
  it("reduces approvals only when the sandbox evidence prerequisites hold", () => {
    expect(evaluateDevelopmentAction(context, clean, "static").action).toBe(
      "approve",
    );
    expect(evaluateDevelopmentAction(context, clean, "adaptive").action).toBe(
      "allow",
    );
    for (const patch of [
      { evidenceFresh: false },
      { testsPassed: false },
      { reversible: false },
      { sensitive: true },
      { protectedPath: true },
      { externalDestination: true },
      { scope: "bulk" as const },
      { environment: "staging" as const },
    ])
      expect(
        evaluateDevelopmentAction({ ...context, ...patch }, clean, "adaptive")
          .action,
      ).toBe("approve");
  });
  it("preserves mandatory organization controls across all guarded arms and scores", () => {
    for (const mode of MODES.filter((m) => m !== "unguarded")) {
      for (const p of [0, 0.2, 0.5, 0.9, 1]) {
        const scores = { injection: p, exfiltration: p, mismatch: p };
        expect(
          evaluateDevelopmentAction(
            { ...context, environment: "production" },
            scores,
            mode,
          ).action,
        ).not.toBe("allow");
        expect(
          evaluateDevelopmentAction(
            {
              ...context,
              operation: "export",
              sensitive: true,
              externalDestination: true,
            },
            scores,
            mode,
          ).action,
        ).toBe("block");
      }
    }
  });
  it("tightens thresholds on protected production targets and composes layers monotonically", () => {
    const layers = resolvePolicy(
      { ...context, environment: "production", protectedPath: true },
      "adaptive",
    );
    let review = 1,
      block = 1;
    for (const layer of layers) {
      const nextReview = Math.min(review, layer.reviewAt);
      const nextBlock = Math.min(block, layer.blockAt);
      expect(nextReview).toBeLessThanOrEqual(review);
      expect(nextBlock).toBeLessThanOrEqual(block);
      expect(nextReview).toBeLessThanOrEqual(nextBlock);
      review = nextReview;
      block = nextBlock;
    }
    expect([review, block]).toEqual([0.2, 0.55]);
    expect(
      evaluateDevelopmentAction(
        { ...context, operation: "read", environment: "production" },
        { ...clean, mismatch: 0.6 },
        "adaptive",
      ).action,
    ).toBe("block");
    expect(
      evaluateDevelopmentAction(
        { ...context, operation: "read", environment: "production" },
        { ...clean, mismatch: 0.6 },
        "static",
      ).action,
    ).toBe("approve");
  });
  it("cannot use forged prose or oracle labels as context", () => {
    expect(
      contextSchema.safeParse({ ...context, administrator: true }).success,
    ).toBe(false);
    expect(
      assessmentSchema.safeParse({
        request: "test",
        tool: "run_sql",
        arguments: {},
        context,
        oracle: { safe: true },
      }).success,
    ).toBe(false);
    expect(
      evaluateDevelopmentAction(
        { ...context, environment: "unknown" },
        clean,
        "adaptive",
      ).action,
    ).toBe("approve");
  });
  it("rejects invalid or nonfinite scores and invalid sweeps", () => {
    expect(() =>
      evaluateDevelopmentAction(
        context,
        { ...clean, mismatch: NaN },
        "adaptive",
      ),
    ).toThrow();
    expect(() =>
      evaluateDevelopmentAction(
        context,
        { ...clean, mismatch: 1.1 },
        "adaptive",
      ),
    ).toThrow();
    expect(() =>
      evaluateDevelopmentAction(context, clean, "static", {
        reviewAt: 0.9,
        blockAt: 0.2,
      }),
    ).toThrow();
  });
  it("isolates both ablation mechanisms", () => {
    expect(
      evaluateDevelopmentAction(context, clean, "no-evidence").action,
    ).toBe("approve");
    const productionRead = {
      ...context,
      environment: "production" as const,
      operation: "read" as const,
    };
    expect(
      evaluateDevelopmentAction(
        productionRead,
        { ...clean, mismatch: 0.3 },
        "adaptive",
      ).action,
    ).toBe("approve");
    expect(
      evaluateDevelopmentAction(
        productionRead,
        { ...clean, mismatch: 0.3 },
        "no-hierarchy",
      ).action,
    ).toBe("allow");
  });
});

const assess = (destructive: number, exfiltration: number, mismatch: number) =>
  evaluateToolCall(
    {
      destructive: answer(destructive),
      exfiltration: answer(exfiltration),
      mismatch: answer(mismatch),
    },
    DEFAULT_POLICY,
  );
describe("support tool gate", () => {
  it("allows lookups, requires approval for mutations, and blocks unauthorized exports", () => {
    expect(assess(0.01, 0.01, 0.01).action).toBe("allow");
    expect(assess(0.95, 0.01, 0.01).action).toBe("approve");
    expect(assess(0.01, 0.95, 0.01).action).toBe("block");
    expect(assess(0.01, 0.01, 0.95).action).toBe("block");
  });
});

describe("research HTTP boundary", () => {
  it("rejects missing, weak, or incorrect tokens", () => {
    const env = { RESEARCH_TOKEN: "a".repeat(40) } as ResearchEnv;
    expect(authorized(new Request("https://example.com"), env)).toBe(false);
    expect(
      authorized(
        new Request("https://example.com", {
          headers: { Authorization: `Bearer ${"b".repeat(40)}` },
        }),
        env,
      ),
    ).toBe(false);
    expect(
      authorized(
        new Request("https://example.com", {
          headers: { Authorization: `Bearer ${"a".repeat(40)}` },
        }),
        env,
      ),
    ).toBe(true);
  });
  it("limits actual request bytes", async () => {
    await expect(
      readBody(
        new Request("https://example.com", {
          method: "POST",
          body: "x".repeat(150001),
        }),
      ),
    ).rejects.toThrow("150KB");
    await expect(
      readBody(
        new Request("https://example.com", {
          method: "POST",
          body: '{"ok":true}',
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });
});
