/**
 * Shared plumbing for System One calls: routes every request through AI Gateway,
 * measures latency, and captures the gateway log id so the UI can deep-link to it.
 */

/** Media must be embedded (data URLs or {content_type, base64}). Remote URLs are rejected. */
export type MediaItem = string | { content_type: string; base64: string };

export type MediaInput = {
  /** PNG/JPEG/WebP, max 4. */
  images?: MediaItem[];
  /** clef-omni only: wav/mp3, max 4. */
  audio?: MediaItem[];
  /** clef-omni only: mp4/webm, max 2, 60s each. */
  videos?: MediaItem[];
};

export type RunOptions = {
  gatewayId: string;
  /** Extra values attached to the AI Gateway log entry. */
  metadata?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
};

export type SystemOneCall = {
  modelId: string;
  latencyMs: number;
  inputTokens: number;
  gatewayLogId?: string;
};

type AiRunner = {
  run(model: string, inputs: unknown, options?: unknown): Promise<unknown>;
  aiGatewayLogId?: string | null;
};

export async function runModel(
  ai: Ai,
  modelId: string,
  body: Record<string, unknown>,
  options: RunOptions,
): Promise<{ raw: unknown; call: SystemOneCall }> {
  // Clef/Clairic are newer than the generated Workers AI model typings, so call through a narrow
  // interface and validate the response with zod in the caller instead.
  const runner = ai as unknown as AiRunner;
  const started = performance.now();
  let raw: unknown;
  try {
    raw = await runner.run(modelId, body, {
      gateway: { id: options.gatewayId, metadata: options.metadata },
      signal: options.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${modelId} failed: ${message}`, { cause: error });
  }
  return {
    raw,
    call: {
      modelId,
      latencyMs: Math.round(performance.now() - started),
      inputTokens: 0,
      gatewayLogId: runner.aiGatewayLogId ?? undefined,
    },
  };
}

/** USD per million input tokens. System One models do not bill output tokens. */
export const PRICE_PER_M_INPUT: Record<string, number> = {
  "@cf/cloudflare/clef": 0.24,
  "@cf/cloudflare/clef-flash": 0.038,
  "@cf/cloudflare/clef-omni": 0.15,
  "@cf/cloudflare/clairic": 0.1,
};

export function estimateCostUsd(modelId: string, inputTokens: number): number {
  return ((PRICE_PER_M_INPUT[modelId] ?? 0) * inputTokens) / 1_000_000;
}
