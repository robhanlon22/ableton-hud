import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";

import type { HudState } from "../src/shared/types";

import { createDefaultHudState } from "../src/shared/ipc";

const MAIN_ENTRY = resolve(process.cwd(), "out/main/index.js");

interface RunningHudApp {
  electronApp: ElectronApplication;
  page: Page;
  tempHome: string;
}

/**
 * Closes the Electron app and removes temporary profile state.
 * @param app - Running app handles produced by {@link launchHudApp}.
 */
async function closeHudApp(app: RunningHudApp): Promise<void> {
  try {
    await app.electronApp.close();
  } finally {
    await rm(app.tempHome, { force: true, recursive: true });
  }
}

/**
 * Pushes a HUD state directly into the renderer IPC subscription channel.
 * @param app - Running app handles used for main-process event injection.
 * @param payload - HUD state payload to inject.
 */
async function injectHudState(
  app: RunningHudApp,
  payload: HudState,
): Promise<void> {
  await app.electronApp.evaluate(({ BrowserWindow }, nextState) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send("hud:state", nextState);
  }, payload);
}

/**
 * Re-sends HUD state until the renderer reflects the expected counter text.
 * @param app - Running app handles used for injection and DOM assertions.
 * @param payload - HUD state payload to inject.
 */
async function injectHudStateUntilRendered(
  app: RunningHudApp,
  payload: HudState,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await injectHudState(app, payload);
        return app.page.getByTestId("counter-text").textContent();
      },
      {
        intervals: [100, 200, 300],
        timeout: 8_000,
      },
    )
    .toBe(payload.counterText);
}

/**
 * Launches the compiled Electron app with isolated user data for deterministic tests.
 * @returns Running Electron app handles for each test case.
 */
async function launchHudApp(): Promise<RunningHudApp> {
  const tempHome = await mkdtemp(
    join(tmpdir(), "ableton-hud-playwright-home-"),
  );

  const electronApp = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      AOSC_E2E_MOCK: "1",
      HOME: tempHome,
      USERPROFILE: tempHome,
      XDG_CACHE_HOME: join(tempHome, ".cache"),
      XDG_CONFIG_HOME: join(tempHome, ".config"),
      XDG_DATA_HOME: join(tempHome, ".local/share"),
    },
  });

  const page = await electronApp.firstWindow();
  return {
    electronApp,
    page,
    tempHome,
  };
}

/**
 * Waits for the renderer to finish mounting subscriptions before event assertions.
 * @param app - Running app handles.
 */
async function waitForHudBootstrap(app: RunningHudApp): Promise<void> {
  await expect(app.page.getByTestId("hud-root")).toBeVisible();
  await app.page.waitForTimeout(300);
}

test.describe("Electron HUD", () => {
  test("launches a window and renders default counter", async () => {
    const app = await launchHudApp();

    try {
      await expect(app.page.getByTestId("hud-root")).toBeVisible();
      await expect(app.page.getByTestId("counter-text")).toHaveText("0:0:0");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles counter mode from elapsed to remaining", async () => {
    const app = await launchHudApp();

    try {
      await waitForHudBootstrap(app);
      const modeToggle = app.page.getByTestId("mode-toggle");
      await expect(modeToggle).toHaveText("Elapsed");

      await modeToggle.click();
      await expect(modeToggle).toHaveText("Remaining");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles always-on-top button title", async () => {
    const app = await launchHudApp();

    try {
      await waitForHudBootstrap(app);
      const toggleButton = app.page.getByRole("button", {
        name: /Set window (normal|floating)/,
      });
      await expect(toggleButton).toHaveAttribute("title", "FLOAT");

      await toggleButton.click();

      await expect(toggleButton).toHaveAttribute("title", "NORMAL");
    } finally {
      await closeHudApp(app);
    }
  });

  test("renders injected hud state payload", async () => {
    const app = await launchHudApp();

    try {
      await waitForHudBootstrap(app);
      const injectedState: HudState = {
        ...createDefaultHudState("remaining", true),
        beatFlashToken: 7,
        clipColor: 0x7f00ff,
        clipIndex: 5,
        clipName: "Lead",
        connected: true,
        counterParts: {
          bar: 7,
          beat: 2,
          sixteenth: 3,
        },
        counterText: "7:2:3",
        isDownbeat: false,
        isLastBar: false,
        isPlaying: true,
        mode: "remaining",
        sceneColor: 0x00aa66,
        sceneName: "Hook",
        trackColor: 0xff8800,
        trackIndex: 2,
        trackName: "Bass",
      };

      await injectHudStateUntilRendered(app, injectedState);

      await expect(app.page.getByTestId("counter-text")).toHaveText("7:2:3");
      await expect(app.page.getByTestId("mode-toggle")).toHaveText("Remaining");
      await expect(app.page.getByTestId("clip-pill")).toContainText("Lead");
      await expect(app.page.getByTestId("track-pill")).toContainText("Bass");
      await expect(app.page.getByTestId("scene-pill")).toContainText("Hook");
    } finally {
      await closeHudApp(app);
    }
  });
});
