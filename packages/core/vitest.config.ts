import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/types.ts"],
      reporter: ["text-summary"],
      // The verdict engine is the product. Keep it well covered.
      thresholds: { statements: 95, branches: 85, functions: 100, lines: 95 },
    },
  },
});
