import { z } from "zod";
import {
  runModel,
  type MediaInput,
  type RunOptions,
  type SystemOneCall,
} from "./run";

/**
 * Clef decision models: give them a `state` plus typed questions, get back calibrated
 * probabilities. One forward pass, no output tokens, ~40-300ms.
 *
 * - clef-flash: 9B, fastest + cheapest, 24k context. Use it on the hot path (guardrails, routing).
 * - clef:       27B, most accurate, 64k context, text + images.
 * - clef-omni:  30B MoE, text + images + audio + video.
 *
 * Docs: https://developers.cloudflare.com/workers-ai/models/clef/
 */
export type ClefModel = "clef" | "clef-flash" | "clef-omni";

export const CLEF_MODEL_IDS = {
  clef: "@cf/cloudflare/clef",
  "clef-flash": "@cf/cloudflare/clef-flash",
  "clef-omni": "@cf/cloudflare/clef-omni",
} as const satisfies Record<ClefModel, string>;

/** Yes/no question. Answer: probability of "yes". */
export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
};
/** Pick one option. `criteria` maps option id -> description (2-255 options). */
export type ChoiceQuestion<O extends string = string> = {
  type: "choice";
  instructions: string;
  criteria: Record<O, string | null>;
};
/** Ordered rubric, lowest first (2-10 levels). Answer: probability-weighted level index. */
export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: readonly string[];
};
export type ClefQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type ClefQuestions = Record<string, ClefQuestion>;

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer<O extends string = string> = {
  type: "choice";
  choice: O;
  probabilities: Record<O, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, unknown>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type AnswerFor<Q> = Q extends { type: "noul" }
  ? NoulAnswer
  : Q extends { type: "choice"; criteria: Record<infer O, unknown> }
    ? ChoiceAnswer<O & string>
    : ScoreAnswer;

export type ClefAnswers<Q extends ClefQuestions> = {
  [K in keyof Q]: AnswerFor<Q[K]>;
};

const probabilities = z.record(z.string(), z.number().min(0).max(1));
const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities,
    confidence: z.number(),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.unknown()),
    probabilities,
    confidence: z.number(),
  }),
]);
const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), answerSchema),
  usage: z
    .object({ input_tokens: z.number(), output_tokens: z.number().optional() })
    .passthrough(),
});

export type DecideInput<Q extends ClefQuestions> = {
  model?: ClefModel;
  /** Text, or structured data (object/array) such as records, chat logs, app state. */
  state: string | Record<string, unknown> | unknown[];
  questions: Q;
} & MediaInput;

export type DecideResult<Q extends ClefQuestions> = SystemOneCall & {
  answers: ClefAnswers<Q>;
};

export async function decide<const Q extends ClefQuestions>(
  ai: Ai,
  input: DecideInput<Q>,
  options: RunOptions,
): Promise<DecideResult<Q>> {
  const model = input.model ?? "clef-flash";
  const count = Object.keys(input.questions).length;
  if (count < 1 || count > 64) {
    throw new Error(`Clef accepts 1-64 questions per call, got ${count}`);
  }
  if (model !== "clef-omni" && (input.audio?.length || input.videos?.length)) {
    throw new Error(`Audio/video inputs require clef-omni (got ${model})`);
  }
  const body: Record<string, unknown> = {
    model,
    state: input.state,
    questions: input.questions,
  };
  if (input.images?.length) body.images = input.images;
  if (input.audio?.length) body.audio = input.audio;
  if (input.videos?.length) body.videos = input.videos;

  const { raw, call } = await runModel(
    ai,
    CLEF_MODEL_IDS[model],
    body,
    options,
  );
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unexpected ${model} response: ${parsed.error.message}`);
  }
  return {
    ...call,
    inputTokens: parsed.data.usage.input_tokens,
    answers: parsed.data.answers as ClefAnswers<Q>,
  };
}

/** Score answers are a weighted level index; this maps them to 0..1 for thresholds and bars. */
export function normalizedScore(answer: ScoreAnswer): number {
  const levels = Object.keys(answer.probabilities).length;
  return levels > 1 ? answer.score / (levels - 1) : 0;
}
