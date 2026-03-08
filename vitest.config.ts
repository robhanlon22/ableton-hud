import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const projectRootDirectory = fileURLToPath(new URL(".", import.meta.url));
const defaultVitestSeed = Date.now();

const resolveVitestSeed = (): number => {
  const candidateSeed = process.env.VITEST_SEQUENCE_SEED;
  if (candidateSeed === undefined) {
    return defaultVitestSeed;
  }

  const parsedSeed = Number.parseInt(candidateSeed, 10);
  return Number.isNaN(parsedSeed) ? defaultVitestSeed : parsedSeed;
};

const vitestSeed = resolveVitestSeed();

export default defineConfig({
  optimizeDeps: {
    include: ["react-dom/client"],
  },
  plugins: [
    tsconfigPaths({
      projects: ["tsconfig.json"],
      root: projectRootDirectory,
    }),
    react(),
  ],
  test: {
    clearMocks: true,
    coverage: {
      enabled: true,
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/**/__tests__/**",
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
      {
        extends: true,
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
          setupFiles: ["src/renderer/src/__tests__/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["src/**/*.node.test.ts", "src/**/*.node.test.tsx"],
          name: "node",
          setupFiles: ["src/main/__tests__/setup.ts"],
        },
      },
    ],
    restoreMocks: true,
    sequence: {
      hooks: "stack",
      seed: vitestSeed,
      setupFiles: "list",
      shuffle: {
        files: true,
        tests: true,
      },
    },
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
