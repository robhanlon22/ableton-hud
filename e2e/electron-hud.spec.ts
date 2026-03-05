import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

interface LaunchHudAppOptions {
  existingTempHome?: string;
  mockMode?: boolean;
}

interface PersistedPrefs {
  alwaysOnTop?: boolean;
  compactMode: boolean;
  windowBounds?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
}

interface RunningHudApp {
  electronApp: ElectronApplication;
  page: Page;
  tempHome: string;
}

interface WindowContentSize {
  height: number;
  width: number;
}

interface WindowOverlayState {
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
}

/**
 * Closes the Electron app and removes temporary profile state.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param removeProfile - Whether to remove the temporary profile directory.
 */
async function closeHudApp(
  app: RunningHudApp,
  removeProfile = true,
): Promise<void> {
  try {
    await app.electronApp.close();
  } finally {
    if (removeProfile) {
      await rm(app.tempHome, { force: true, recursive: true });
    }
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
 * @param options - Launch options for profile reuse and mock-mode selection.
 * @returns Running Electron app handles for each test case.
 */
async function launchHudApp(
  options: LaunchHudAppOptions = {},
): Promise<RunningHudApp> {
  const { existingTempHome, mockMode = true } = options;
  const tempHome =
    existingTempHome ??
    (await mkdtemp(join(tmpdir(), "ableton-hud-playwright-home-")));

  const electronApp = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      AOSC_E2E_MOCK: mockMode ? "1" : "0",
      AOSC_E2E_USER_DATA: tempHome,
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
 * Reads persisted HUD preferences from the isolated user-data directory.
 * @param tempHome - Temporary profile directory used for the test app launch.
 * @returns Parsed persisted preferences payload.
 */
async function readPersistedPrefs(tempHome: string): Promise<PersistedPrefs> {
  const raw = await readFile(join(tempHome, "hud-preferences.json"), "utf8");
  return JSON.parse(raw) as PersistedPrefs;
}

/**
 * Reads the content size of the active main window.
 * @param app - Running app handles.
 * @returns Current content width and height.
 */
async function readWindowContentSize(
  app: RunningHudApp,
): Promise<WindowContentSize> {
  return app.electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const [width, height] = mainWindow.getContentSize();
    return { height, width };
  });
}

/**
 * Reads topmost/workspace visibility state from the active main window.
 * @param app - Running app handles.
 * @returns Overlay policy flags from BrowserWindow.
 */
async function readWindowOverlayState(
  app: RunningHudApp,
): Promise<WindowOverlayState> {
  return app.electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return {
      alwaysOnTop: mainWindow.isAlwaysOnTop(),
      visibleOnAllWorkspaces: mainWindow.isVisibleOnAllWorkspaces(),
    };
  });
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
      const initialState: HudState = {
        ...createDefaultHudState("elapsed", true),
        connected: true,
        counterText: "2:1:1",
      };
      await injectHudStateUntilRendered(app, initialState);
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
      const initialState: HudState = {
        ...createDefaultHudState("elapsed", true),
        connected: true,
        counterText: "2:1:1",
      };
      await injectHudStateUntilRendered(app, initialState);
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

  test("toggles track lock button title", async () => {
    const app = await launchHudApp();

    try {
      await waitForHudBootstrap(app);
      const lockButton = app.page.getByTestId("track-lock-toggle");
      await expect(lockButton).toHaveAttribute("title", "UNLOCKED");

      await lockButton.click();
      await expect(lockButton).toHaveAttribute("title", "LOCKED");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles compact mode and resizes window to counter panel", async () => {
    const app = await launchHudApp();

    try {
      await waitForHudBootstrap(app);
      const initialSize = await readWindowContentSize(app);
      const compactToggle = app.page.getByTestId("compact-toggle");
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");

      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "EXPAND DETAILS");
      await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);

      await expect
        .poll(async () => {
          return readWindowContentSize(app);
        })
        .toEqual({
          height: expect.any(Number),
          width: expect.any(Number),
        });
      const compactSize = await readWindowContentSize(app);
      expect(compactSize.width).toBeLessThanOrEqual(initialSize.width);
      expect(compactSize.height).toBeLessThanOrEqual(initialSize.height);

      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");
      await expect(app.page.getByTestId("mode-toggle")).toHaveText("Elapsed");
      await expect
        .poll(async () => readWindowContentSize(app))
        .toEqual(initialSize);
    } finally {
      await closeHudApp(app);
    }
  });

  test("restores full size after compact relaunch cycle", async () => {
    const app = await launchHudApp();
    const stableHome = app.tempHome;

    try {
      await waitForHudBootstrap(app);
      await app.electronApp.evaluate(({ BrowserWindow }) => {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        mainWindow.setContentSize(540, 260);
      });
      const fullSize = await readWindowContentSize(app);
      expect(fullSize).toEqual({ height: 260, width: 540 });
      const compactToggle = app.page.getByTestId("compact-toggle");
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");
      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "EXPAND DETAILS");
      await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);
      await expect
        .poll(async () => {
          return readPersistedPrefs(stableHome);
        })
        .toMatchObject({
          compactMode: true,
        });
    } finally {
      await closeHudApp(app, false);
    }

    const relaunchedApp = await launchHudApp({ existingTempHome: stableHome });
    try {
      await waitForHudBootstrap(relaunchedApp);
      const compactToggle = relaunchedApp.page.getByTestId("compact-toggle");
      await expect(compactToggle).toHaveAttribute("title", "EXPAND DETAILS");

      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");
      await expect(relaunchedApp.page.getByTestId("mode-toggle")).toBeVisible();

      await expect
        .poll(async () => {
          return readWindowContentSize(relaunchedApp);
        })
        .toEqual({ height: 260, width: 540 });
    } finally {
      await closeHudApp(relaunchedApp);
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

  test.describe("Fullscreen overlay policy", () => {
    test.skip(
      process.platform !== "darwin",
      "Fullscreen workspace policy is macOS-specific.",
    );

    test("applies fullscreen overlay policy from persisted alwaysOnTop on launch", async () => {
      const app = await launchHudApp({ mockMode: false });

      try {
        await waitForHudBootstrap(app);
        await expect
          .poll(async () => readWindowOverlayState(app))
          .toEqual({
            alwaysOnTop: true,
            visibleOnAllWorkspaces: true,
          });
      } finally {
        await closeHudApp(app);
      }
    });

    test("applies and clears fullscreen overlay policy via hud:toggle-topmost IPC", async () => {
      const app = await launchHudApp({ mockMode: false });

      try {
        await waitForHudBootstrap(app);
        const toggleButton = app.page.getByRole("button", {
          name: /Set window (normal|floating)/,
        });
        await expect(toggleButton).toHaveAttribute("title", "FLOAT");

        await toggleButton.click();
        await expect(toggleButton).toHaveAttribute("title", "NORMAL");
        await expect
          .poll(async () => readWindowOverlayState(app))
          .toEqual({
            alwaysOnTop: false,
            visibleOnAllWorkspaces: false,
          });
        await expect
          .poll(async () => readPersistedPrefs(app.tempHome))
          .toMatchObject({
            alwaysOnTop: false,
          });

        await toggleButton.click();
        await expect(toggleButton).toHaveAttribute("title", "FLOAT");
        await expect
          .poll(async () => readWindowOverlayState(app))
          .toEqual({
            alwaysOnTop: true,
            visibleOnAllWorkspaces: true,
          });
        await expect
          .poll(async () => readPersistedPrefs(app.tempHome))
          .toMatchObject({
            alwaysOnTop: true,
          });
      } finally {
        await closeHudApp(app);
      }
    });
  });
});
