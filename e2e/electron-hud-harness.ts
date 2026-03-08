import { expect } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";
import { z } from "zod";

const MAIN_ENTRY = path.resolve(process.cwd(), "out/main/index.js");
const PROFILE_DIR_PREFIX = "ableton-hud-playwright-home-";
const HUD_BOOTSTRAP_WAIT_MS = 300;
const WINDOW_SIZE_STABILITY_ATTEMPTS = 25;
const WINDOW_SIZE_STABILITY_REQUIRED_MATCHES = 2;
const WINDOW_SIZE_STABILITY_WAIT_MS = 100;

const ignoreLaunchCleanupError = String;

const persistedPrefsSchema = z.object({
  alwaysOnTop: z.boolean().optional(),
  compactMode: z.boolean(),
  windowBounds: z
    .object({
      height: z.number().int(),
      width: z.number().int(),
      x: z.number().int(),
      y: z.number().int(),
    })
    .optional(),
});

export interface LaunchHudAppOptions {
  existingTempHome?: string;
  livePort: number;
}

export type PersistedPrefs = z.infer<typeof persistedPrefsSchema>;

export interface RunningHudApp {
  electronApp: ElectronApplication;
  page: Page;
  tempHome: string;
}

export interface WindowContentSize {
  height: number;
  width: number;
}

export interface WindowOverlayState {
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
}

/**
 * Closes the Electron app and removes temporary profile state.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param removeProfile - Whether to remove the temporary profile directory.
 */
export async function closeHudApp(
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
 * Launches the compiled Electron app with isolated user data for deterministic tests.
 * @param options - Launch options for profile reuse and transport configuration.
 * @returns Running Electron app handles for each test case.
 */
export async function launchHudApp(
  options: LaunchHudAppOptions,
): Promise<RunningHudApp> {
  const { existingTempHome, livePort } = options;
  const temporaryHome =
    existingTempHome ??
    (await mkdtemp(path.join(tmpdir(), PROFILE_DIR_PREFIX)));
  let electronApp: ElectronApplication | undefined;

  try {
    electronApp = await electron.launch({
      args: [MAIN_ENTRY],
      env: {
        ...process.env,
        AOSC_E2E_USER_DATA: temporaryHome,
        AOSC_LIVE_HOST: "127.0.0.1",
        AOSC_LIVE_PORT: String(livePort),
        HOME: temporaryHome,
        USERPROFILE: temporaryHome,
        XDG_CACHE_HOME: path.join(temporaryHome, ".cache"),
        XDG_CONFIG_HOME: path.join(temporaryHome, ".config"),
        XDG_DATA_HOME: path.join(temporaryHome, ".local/share"),
      },
    });

    return {
      electronApp,
      page: await electronApp.firstWindow(),
      tempHome: temporaryHome,
    };
  } catch (error) {
    if (electronApp) {
      await electronApp.close().catch(ignoreLaunchCleanupError);
    }
    if (existingTempHome === undefined) {
      await rm(temporaryHome, { force: true, recursive: true });
    }
    throw error;
  }
}

/**
 * Reads persisted HUD preferences from the isolated user-data directory.
 * @param temporaryHome - Temporary profile directory used for the test app launch.
 * @returns Parsed persisted preferences payload.
 */
export async function readPersistedPrefs(
  temporaryHome: string,
): Promise<PersistedPrefs> {
  const raw = await readFile(
    path.join(temporaryHome, "hud-preferences.json"),
    "utf8",
  );
  return persistedPrefsSchema.parse(JSON.parse(raw));
}

/**
 * Reads the content size of the active main window.
 * @param app - Running app handles.
 * @returns Current content width and height.
 */
export async function readWindowContentSize(
  app: RunningHudApp,
): Promise<WindowContentSize> {
  return app.electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const [width, height] = mainWindow.getContentSize();
    return { height, width };
  });
}

const sameWindowContentSize = (
  left: WindowContentSize,
  right: WindowContentSize,
): boolean => {
  return left.height === right.height && left.width === right.width;
};

/**
 * Reads topmost/workspace visibility state from the active main window.
 * @param app - Running app handles.
 * @returns Overlay policy flags from BrowserWindow.
 */
export async function readWindowOverlayState(
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
 * Sets the content size of the active main window.
 * @param app - Running app handles.
 * @param size - Desired content width and height.
 */
export async function setWindowContentSize(
  app: RunningHudApp,
  size: WindowContentSize,
): Promise<void> {
  await app.electronApp.evaluate(({ BrowserWindow }, nextSize) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.setContentSize(nextSize.width, nextSize.height);
  }, size);
}

/**
 * Waits for the renderer to finish mounting subscriptions before event assertions.
 * @param app - Running app handles.
 */
export async function waitForHudBootstrap(app: RunningHudApp): Promise<void> {
  await expect(app.page.getByTestId("hud-root")).toBeVisible();
  await app.page.waitForTimeout(HUD_BOOTSTRAP_WAIT_MS);
}

/**
 * Waits until repeated BrowserWindow size reads stop changing.
 * @param app - Running app handles.
 * @returns The stabilized content width and height.
 */
export async function waitForStableWindowContentSize(
  app: RunningHudApp,
): Promise<WindowContentSize> {
  let previousSize: undefined | WindowContentSize;
  let stableMatchCount = 0;

  for (
    let attempt = 0;
    attempt < WINDOW_SIZE_STABILITY_ATTEMPTS;
    attempt += 1
  ) {
    const nextSize = await readWindowContentSize(app);
    if (previousSize && sameWindowContentSize(previousSize, nextSize)) {
      stableMatchCount += 1;
      if (stableMatchCount >= WINDOW_SIZE_STABILITY_REQUIRED_MATCHES) {
        return nextSize;
      }
    } else {
      previousSize = nextSize;
      stableMatchCount = 0;
    }

    await app.page.waitForTimeout(WINDOW_SIZE_STABILITY_WAIT_MS);
  }

  throw new Error("Timed out waiting for the HUD window size to stabilize.");
}
