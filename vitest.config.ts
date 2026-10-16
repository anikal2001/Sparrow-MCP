import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: { SPARROW_GEOCODE_MIN_GAP_MS: "0", LOG_LEVEL: "error" },
  },
});
