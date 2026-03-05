import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  optimizeDeps: {
    include: ["react-dom/client"],
  },
  plugins: [react()],
  test: {
    clearMocks: true,
    coverage: {
      enabled: true,
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/renderer/src/test/**",
        "src/renderer/src/__screenshots__/**",
      ],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reportOnFailure: true,
      thresholds: {
        100: true,
        perFile: true,
      },
    },
    projects: [
      defineProject({
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [
              {
                browser: "chromium",
              },
            ],
            provider: playwright(),
          },
          include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
          name: "browser",
          setupFiles: ["src/renderer/src/test/setup.ts"],
        },
      }),
      defineProject({
        test: {
          environment: "node",
          include: ["src/**/*.node.test.ts", "src/**/*.node.test.tsx"],
          name: "node",
        },
      }),
    ],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
