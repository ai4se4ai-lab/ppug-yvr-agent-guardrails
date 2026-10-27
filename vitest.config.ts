import { defineConfig } from "vitest/config";

// Unit tests run in Node against a mocked AI binding; no Cloudflare account needed.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
