import { vi } from "vitest";

/** A fake Workers AI binding that returns `response` and records every call. */
export function mockAi(
  response:
    | unknown
    | ((model: string, body: Record<string, unknown>) => unknown),
) {
  const run = vi.fn(async (model: string, body: Record<string, unknown>) => {
    if (response instanceof Error) throw response;
    return typeof response === "function"
      ? (response as (m: string, b: Record<string, unknown>) => unknown)(
          model,
          body,
        )
      : response;
  });
  const ai = { run, aiGatewayLogId: "log-123" };
  return { ai: ai as unknown as Ai, run };
}

export const GATEWAY = { gatewayId: "default", metadata: { app: "test" } };
