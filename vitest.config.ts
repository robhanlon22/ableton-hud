import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reportOnFailure: true,
      thresholds: {
        100: true,
        perFile: true,
      },
    },
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/renderer/src/test/setup.ts"],
  },
});
