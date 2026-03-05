import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      instances: [
        {
          browser: "chromium",
        },
      ],
      provider: playwright(),
    },
    coverage: {
      enabled: true,
      provider: "v8",
      reportOnFailure: true,
      thresholds: {
        100: true,
        perFile: true,
      },
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/renderer/src/test/setup.ts"],
  },
});
