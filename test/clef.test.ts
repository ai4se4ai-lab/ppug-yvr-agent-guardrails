import { describe, expect, it } from "vitest";
import { decide, normalizedScore } from "../src/system-one/clef";
import { GATEWAY, mockAi } from "./helpers";

const questions = {
  urgent: { type: "noul", instructions: "Is this urgent?" },
  team: {
    type: "choice",
    instructions: "Which team?",
    criteria: { billing: "Payments", technical: "Outages" },
  },
  severity: {
    type: "score",
    instructions: "How severe?",
    criteria: ["None", "Minor", "Major", "Critical"],
  },
} as const;

const response = {
  model: "clef-flash",
  answers: {
    urgent: { type: "noul", noul: 0.93 },
    team: {
      type: "choice",
      choice: "technical",
      probabilities: { billing: 0.04, technical: 0.96 },
      confidence: 0.9,
    },
    severity: {
      type: "score",
      score: 2.7,
      legend: { "0": "None", "1": "Minor", "2": "Major", "3": "Critical" },
      probabilities: { "0": 0.01, "1": 0.04, "2": 0.2, "3": 0.75 },
      confidence: 0.6,
    },
  },
  usage: { input_tokens: 420, output_tokens: 0 },
};

describe("decide", () => {
  it("calls clef-flash through the gateway and returns typed answers", async () => {
    const { ai, run } = mockAi(response);
    const result = await decide(
      ai,
      { state: "Checkout is down", questions },
      GATEWAY,
    );

    expect(run).toHaveBeenCalledWith(
      "@cf/cloudflare/clef-flash",
      { model: "clef-flash", state: "Checkout is down", questions },
      expect.objectContaining({
        gateway: { id: "default", metadata: { app: "test" } },
      }),
    );
    expect(result.answers.urgent.noul).toBe(0.93);
    expect(result.answers.team.choice).toBe("technical");
    expect(result.inputTokens).toBe(420);
    expect(result.gatewayLogId).toBe("log-123");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("only sends media fields that are present", async () => {
    const { ai, run } = mockAi(response);
    await decide(
      ai,
      {
        model: "clef",
        state: "x",
        questions,
        images: ["data:image/png;base64,AA"],
      },
      GATEWAY,
    );
    const body = run.mock.calls[0]?.[1];
    expect(body).toMatchObject({
      model: "clef",
      images: ["data:image/png;base64,AA"],
    });
    expect(body).not.toHaveProperty("audio");
  });

  it("rejects audio for non-omni models before calling the API", async () => {
    const { ai, run } = mockAi(response);
    await expect(
      decide(
        ai,
        {
          model: "clef",
          state: "x",
          questions,
          audio: ["data:audio/mpeg;base64,AA"],
        },
        GATEWAY,
      ),
    ).rejects.toThrow(/clef-omni/);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects more than 64 questions", async () => {
    const { ai } = mockAi(response);
    const many = Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [
        `q${i}`,
        { type: "noul" as const, instructions: "?" },
      ]),
    );
    await expect(
      decide(ai, { state: "x", questions: many }, GATEWAY),
    ).rejects.toThrow(/1-64/);
  });

  it("fails loudly on an unexpected response shape", async () => {
    const { ai } = mockAi({
      answers: { urgent: { type: "noul", noul: 7 } },
      usage: { input_tokens: 1 },
    });
    await expect(
      decide(ai, { state: "x", questions }, GATEWAY),
    ).rejects.toThrow(/Unexpected clef-flash response/);
  });

  it("wraps binding errors with the model id", async () => {
    const { ai } = mockAi(new Error("5007: model unavailable"));
    await expect(
      decide(ai, { state: "x", questions }, GATEWAY),
    ).rejects.toThrow(
      "@cf/cloudflare/clef-flash failed: 5007: model unavailable",
    );
  });
});

describe("normalizedScore", () => {
  it("maps a weighted level index onto 0..1", () => {
    expect(normalizedScore(response.answers.severity as never)).toBeCloseTo(
      0.9,
    );
  });
});
