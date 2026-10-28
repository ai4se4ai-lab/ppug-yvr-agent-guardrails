import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const researchBuild = createHash("sha256")
  .update(readFileSync(new URL("./src/research/policy.ts", import.meta.url)))
  .update(readFileSync(new URL("./src/research/schema.ts", import.meta.url)))
  .update(readFileSync(new URL("./src/server.ts", import.meta.url)))
  .digest("hex");

export default defineConfig({
  define: { RESEARCH_BUILD_ID: JSON.stringify(researchBuild) },
  plugins: [agents(), react(), cloudflare(), tailwindcss()],
});
