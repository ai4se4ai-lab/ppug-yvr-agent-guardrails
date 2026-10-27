import { z } from "zod";
import {
  runModel,
  type MediaItem,
  type RunOptions,
  type SystemOneCall,
} from "./run";

/**
 * Clairic extraction model (preview): give it a `state` plus typed fields, get back typed values
 * extracted, computed, estimated or forecast from the input, each with confidence.
 *
 * Tips from the Clairic launch post:
 * - One or two-step math (totals, date differences) is reliable; longer chains are not.
 *   Extract the values with Clairic and do the math in code.
 * - Use `confidence` / `p_null` / the p10-p90 interval to decide what to automate.
 *
 * Docs: https://developers.cloudflare.com/workers-ai/models/clairic/
 */
export const CLAIRIC_MODEL_ID = "@cf/cloudflare/clairic";

type Base = { instructions?: string; null_threshold?: number };
export type TextField = Base & { type: "text" };
export type NumberField = Base & {
  type: "number";
  unit?: string;
  integer?: boolean;
  decimals?: number;
};
export type DateField = Base & { type: "date" | "time" | "datetime" };
export type DurationField = Base & {
  type: "duration";
  unit?:
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "months"
    | "years";
  integer?: boolean;
  decimals?: number;
};
export type ListField = Base & {
  type: "list";
  items: "text" | "number" | "date";
  decimals?: number;
};
type Bound = number | string;
export type EstimateField = Base & {
  type: "estimate";
  min: Bound;
  max: Bound;
  step?: number | "month" | "year";
  scale?: "linear" | "log";
  unit?: string;
};
export type ForecastField = Base & {
  type: "forecast";
  min: Bound;
  max: Bound;
  horizon: number;
  interval?:
    | "step"
    | "minute"
    | "hour"
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year";
  scale?: "linear" | "log";
  unit?: string;
};
export type ClairicField =
  | TextField
  | NumberField
  | DateField
  | DurationField
  | ListField
  | EstimateField
  | ForecastField;
export type ClairicFields = Record<string, ClairicField>;

type Scalar<V> = {
  value: V | null;
  guess?: V;
  confidence?: number;
  p_null?: number;
};
export type TextAnswer = Scalar<string> & {
  type: "text";
  span?: [number, number];
};
export type NumberAnswer = Scalar<number> & {
  type: "number" | "duration";
  unit?: string;
};
export type DateAnswer = Scalar<string> & {
  type: "date" | "time" | "datetime";
};
export type ListAnswer = {
  type: "list";
  value: Array<string | number>;
  spans?: Array<[number, number]>;
  confidence?: number;
};
export type EstimateAnswer = {
  type: "estimate";
  value: number | string;
  median: number | string;
  p10: number | string;
  p90: number | string;
  mean?: number;
  p_below?: number;
  p_above?: number;
  quantiles?: number[];
};
export type ForecastAnswer = {
  type: "forecast";
  value: number[];
  median: number[];
  p10: number[];
  p90: number[];
};

export type ExtractAnswerFor<F> = F extends { type: "text" }
  ? TextAnswer
  : F extends { type: "number" | "duration" }
    ? NumberAnswer
    : F extends { type: "date" | "time" | "datetime" }
      ? DateAnswer
      : F extends { type: "list" }
        ? ListAnswer
        : F extends { type: "estimate" }
          ? EstimateAnswer
          : ForecastAnswer;

export type ClairicAnswers<F extends ClairicFields> = {
  [K in keyof F]: ExtractAnswerFor<F[K]>;
};

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), z.object({ type: z.string() }).passthrough()),
  truncated: z.boolean().optional(),
  state_text: z.string().optional(),
  usage: z.object({ input_tokens: z.number() }).passthrough(),
});

export type ExtractInput<F extends ClairicFields> = {
  state: string;
  fields: F;
  images?: MediaItem[];
  /** ISO date that anchors dates written without a year, and "today" for date math. */
  referenceDate?: string;
  includeQuantiles?: boolean;
};

export type ExtractResult<F extends ClairicFields> = SystemOneCall & {
  answers: ClairicAnswers<F>;
  truncated: boolean;
};

export async function extract<const F extends ClairicFields>(
  ai: Ai,
  input: ExtractInput<F>,
  options: RunOptions,
): Promise<ExtractResult<F>> {
  const names = Object.keys(input.fields);
  if (names.length === 0) throw new Error("Clairic needs at least one field");
  const invalid = names.filter((name) => !FIELD_NAME.test(name));
  if (invalid.length)
    throw new Error(`Invalid Clairic field names: ${invalid.join(", ")}`);
  if (!input.state.trim() && !input.images?.length) {
    throw new Error("Clairic needs a non-empty state or at least one image");
  }

  const body: Record<string, unknown> = {
    model: "clairic",
    state: input.state,
    fields: input.fields,
  };
  if (input.images?.length) body.images = input.images;
  if (input.referenceDate) body.reference_date = input.referenceDate;
  if (input.includeQuantiles) body.options = { include_quantiles: true };

  const { raw, call } = await runModel(ai, CLAIRIC_MODEL_ID, body, options);
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unexpected clairic response: ${parsed.error.message}`);
  }
  return {
    ...call,
    inputTokens: parsed.data.usage.input_tokens,
    truncated: parsed.data.truncated ?? false,
    answers: parsed.data.answers as unknown as ClairicAnswers<F>,
  };
}
