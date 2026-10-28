export type ResearchEnv = Env & { RESEARCH_TOKEN?: string };

export function authorized(request: Request, env: ResearchEnv): boolean {
  const token = env.RESEARCH_TOKEN;
  return (
    !!token &&
    token.length >= 32 &&
    request.headers.get("Authorization") === `Bearer ${token}`
  );
}

export async function readBody(request: Request): Promise<unknown> {
  // Enforce actual bytes even when Content-Length is missing or dishonest.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("JSON body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 150000) {
      await reader.cancel();
      throw new Error("Request exceeds 150KB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
