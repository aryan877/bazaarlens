import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@bazaarlens/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@bazaarlens/agent": fileURLToPath(new URL("../../packages/agent/src/index.ts", import.meta.url)),
    },
  },
  test: {
    exclude: ["dist/**", "node_modules/**"],
  },
});
