import { defineConfig } from "@playwright/test";

const ciReporterTag = process.env.CI_ENVIRONMENT_NAME;

export default defineConfig({
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  outputDir: "test-results/playwright",
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
        [
          "blob",
          {
            outputDir: "blob-report",
            ...(ciReporterTag ? { tag: ciReporterTag } : {}),
          },
        ],
      ]
    : [["list"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
  workers: 1,
});
