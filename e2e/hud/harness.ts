/* eslint-disable max-lines -- shared Electron E2E harness keeps related launch and screenshot helpers together. */
import { expect, type TestInfo } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";
import { z } from "zod";

const MAIN_ENTRY = path.resolve(process.cwd(), "out/main/index.js");
const PROFILE_DIR_PREFIX = "ableton-hud-playwright-home-";
const HUD_BOOTSTRAP_WAIT_MS = 300;
const ASCII_DIGIT_NINE_CODE_POINT = 57;
const ASCII_DIGIT_ZERO_CODE_POINT = 48;
const ASCII_LOWERCASE_Z_CODE_POINT = 122;
const ASCII_LOWERCASE_A_CODE_POINT = 97;
const SCREENSHOT_ARTIFACT_INDEX_WIDTH = 2;
const WINDOW_SIZE_STABILITY_ATTEMPTS = 25;
const WINDOW_SIZE_STABILITY_REQUIRED_MATCHES = 2;
const WINDOW_SIZE_STABILITY_WAIT_MS = 100;
const CI_ARTIFACT_SCREENSHOTS_ENABLED = Boolean(process.env.CI);
const CI_ENVIRONMENT_NAME = process.env.CI_ENVIRONMENT_NAME;
const MACOS_SCREENSHOT_BINARY = "/usr/sbin/screencapture";
const WINDOWS_SCREENSHOT_SCRIPT = path.resolve(
  process.cwd(),
  "scripts/capture-windows-window.ps1",
);

const ignoreLaunchCleanupError = String;
const ignoreScreenshotError = String;
const execFileAsync = promisify(execFile);

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

/**
 * Configures optional CI artifact capture during HUD app teardown.
 */
export interface CloseHudAppOptions {
  /**
   * Whether to remove the temporary profile directory after closing the app.
   */
  removeProfile?: boolean;

  /**
   * Optional label used for the attached HUD screenshot artifact.
   */
  screenshotLabel?: string;

  /**
   * Playwright test metadata used to attach the captured screenshot.
   */
  testInfo?: TestInfo;
}

/**
 * Configures how the Electron HUD app should be launched for E2E tests.
 */
export interface LaunchHudAppOptions {
  /**
   * Existing temporary home directory to reuse across relaunches.
   */
  existingTempHome?: string;

  /**
   * Fake Ableton Live websocket port to inject into the app.
   */
  livePort: number;
}

/**
 *
 */
export type PersistedPrefs = z.infer<typeof persistedPrefsSchema>;

/**
 * Groups the running Electron app handles used by the E2E suite.
 */
export interface RunningHudApp {
  /**
   * Playwright Electron application wrapper.
   */
  electronApp: ElectronApplication;

  /**
   * First renderer window exposed by the app.
   */
  page: Page;

  /**
   * Temporary profile directory assigned to this app instance.
   */
  tempHome: string;
}

/**
 * Captures the content size of the active HUD window.
 */
export interface WindowContentSize {
  /**
   * Content height in pixels.
   */
  height: number;

  /**
   * Content width in pixels.
   */
  width: number;
}

/**
 * Captures the overlay and workspace visibility state of the HUD window.
 */
export interface WindowOverlayState {
  /**
   * Whether the window stays above normal windows.
   */
  alwaysOnTop: boolean;

  /**
   * Whether the window is visible across all workspaces.
   */
  visibleOnAllWorkspaces: boolean;
}

/**
 * Builds the Electron launch environment for an isolated E2E app instance.
 * @param temporaryHome - Temporary user-data directory for the launch.
 * @param livePort - Fake Ableton Live websocket port.
 * @returns Environment variables for the Electron launch.
 */
const createLaunchEnvironment = (
  temporaryHome: string,
  livePort: number,
): Record<string, string> => {
  const launchEnvironment: Record<string, string> = {
    ABLETON_HUD_E2E_USER_DATA: temporaryHome,
    ABLETON_HUD_LIVE_HOST: "127.0.0.1",
    ABLETON_HUD_LIVE_PORT: String(livePort),
  };

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      launchEnvironment[key] = value;
    }
  }

  return launchEnvironment;
};

/**
 * Closes the Electron app, optionally captures a CI screenshot, and removes temporary profile state.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param options - Teardown options for screenshot capture and profile cleanup.
 */
export async function closeHudApp(
  app: RunningHudApp,
  options: CloseHudAppOptions = {},
): Promise<void> {
  const { removeProfile = true } = options;

  try {
    await attachHudScreenshot(app, options).catch(ignoreScreenshotError);
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
      env: createLaunchEnvironment(temporaryHome, livePort),
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

/**
 * Captures and attaches a HUD screenshot for CI artifact inspection.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param options - Screenshot attachment options for the current test.
 */
async function attachHudScreenshot(
  app: RunningHudApp,
  options: CloseHudAppOptions,
): Promise<void> {
  const { screenshotLabel, testInfo } = options;
  const attachmentLabel = screenshotLabel ?? testInfo?.title;
  if (
    !CI_ARTIFACT_SCREENSHOTS_ENABLED ||
    attachmentLabel === undefined ||
    testInfo === undefined ||
    app.page.isClosed()
  ) {
    return;
  }

  const artifactIndex = testInfo.attachments.length + 1;
  const screenshotPath = testInfo.outputPath(
    `${String(artifactIndex).padStart(SCREENSHOT_ARTIFACT_INDEX_WIDTH, "0")}-${slugifyArtifactLabel(attachmentLabel)}.png`,
  );
  await captureHudScreenshot(app, screenshotPath);
  await testInfo.attach(attachmentLabel, {
    contentType: "image/png",
    path: screenshotPath,
  });
}

/**
 * Captures the HUD screenshot artifact, preferring the full native window frame.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param screenshotPath - Destination path for the screenshot artifact.
 */
async function captureHudScreenshot(
  app: RunningHudApp,
  screenshotPath: string,
): Promise<void> {
  const capturedWindowsWindow = await captureWindowsWindowScreenshot(
    app,
    screenshotPath,
  );
  if (capturedWindowsWindow) {
    return;
  }

  const capturedMacOsWindow = await captureMacOsWindowScreenshot(
    app,
    screenshotPath,
  );
  if (capturedMacOsWindow) {
    return;
  }

  await app.page.screenshot({
    animations: "disabled",
    path: screenshotPath,
  });
}

/**
 * Captures the current macOS HUD window via `screencapture` so native frame
 * chrome is included in the screenshot artifact.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param screenshotPath - Destination path for the screenshot artifact.
 * @returns Whether a native-window screenshot was captured.
 */
async function captureMacOsWindowScreenshot(
  app: RunningHudApp,
  screenshotPath: string,
): Promise<boolean> {
  if (!shouldAttemptMacOsWindowCaptureOnCi()) {
    return false;
  }

  const mediaSourceId = await readMainWindowMediaSourceId(app);
  if (
    typeof mediaSourceId !== "string" ||
    !mediaSourceId.startsWith("window:")
  ) {
    logNativeWindowCaptureFallback(
      "macOS",
      "missing Electron window media source id",
    );
    return false;
  }

  const [, windowId] = mediaSourceId.split(":");
  if (typeof windowId !== "string" || windowId.length === 0) {
    logNativeWindowCaptureFallback("macOS", "missing native window id");
    return false;
  }

  try {
    await execFileAsync(MACOS_SCREENSHOT_BINARY, [
      "-x",
      "-o",
      "-l",
      windowId,
      screenshotPath,
    ]);
    return true;
  } catch (error) {
    logNativeWindowCaptureFallback(
      "macOS",
      "native screencapture window capture failed",
      error,
    );
    return false;
  }
}

/**
 * Captures the current Windows HUD window from the on-screen desktop so native
 * frame chrome is included in the screenshot artifact.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param screenshotPath - Destination path for the screenshot artifact.
 * @returns Whether a native-window screenshot was captured.
 */
async function captureWindowsWindowScreenshot(
  app: RunningHudApp,
  screenshotPath: string,
): Promise<boolean> {
  if (!shouldAttemptWindowsWindowCaptureOnCi()) {
    return false;
  }

  const mediaSourceId = await readMainWindowMediaSourceId(app);
  if (
    typeof mediaSourceId !== "string" ||
    !mediaSourceId.startsWith("window:")
  ) {
    logNativeWindowCaptureFallback(
      "Windows",
      "missing Electron window media source id",
    );
    return false;
  }

  const [, windowHandle] = mediaSourceId.split(":");
  if (typeof windowHandle !== "string" || windowHandle.length === 0) {
    logNativeWindowCaptureFallback("Windows", "missing native window handle");
    return false;
  }

  try {
    await execFileAsync("pwsh", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      WINDOWS_SCREENSHOT_SCRIPT,
      "-WindowHandle",
      windowHandle,
      "-OutputPath",
      screenshotPath,
    ]);
    return true;
  } catch (error) {
    logNativeWindowCaptureFallback(
      "Windows",
      "native screen-region capture failed",
      error,
    );
    return false;
  }
}

/**
 * Formats a process-level capture failure for CI logs.
 * @param error - Unknown error thrown by the capture helper.
 * @returns A short error summary suitable for a one-line warning.
 */
function formatCaptureError(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const stderr = error.stderr;
    if (typeof stderr === "string") {
      const trimmedStderr = stderr.trim();
      if (trimmedStderr.length > 0) {
        return trimmedStderr;
      }
    } else if (Buffer.isBuffer(stderr)) {
      const trimmedStderr = stderr.toString("utf8").trim();
      if (trimmedStderr.length > 0) {
        return trimmedStderr;
      }
    }
  }

  if (error instanceof Error) {
    const stderr = error.message.trim();
    if (stderr.length > 0) {
      return stderr;
    }
  }

  return undefined;
}

/**
 * Checks whether a character is safe to use directly inside an artifact filename.
 * @param character - Single lowercase character candidate.
 * @returns Whether the character can be emitted without replacement.
 */
function isAsciiArtifactCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }

  return (
    (codePoint >= ASCII_DIGIT_ZERO_CODE_POINT &&
      codePoint <= ASCII_DIGIT_NINE_CODE_POINT) ||
    (codePoint >= ASCII_LOWERCASE_A_CODE_POINT &&
      codePoint <= ASCII_LOWERCASE_Z_CODE_POINT)
  );
}

/**
 * Emits a visible warning when a native screenshot helper falls back to the
 * renderer-only capture path.
 * @param platformLabel - Human-readable platform label for the failing helper.
 * @param reason - Human-readable explanation for the fallback.
 * @param error - Optional process error emitted by the helper.
 */
function logNativeWindowCaptureFallback(
  platformLabel: string,
  reason: string,
  error?: unknown,
): void {
  const details = formatCaptureError(error);
  const detailSuffix = details === undefined ? "" : ` (${details})`;
  process.stderr.write(
    `[hud-screenshot] ${platformLabel} native window capture fallback: ${reason}${detailSuffix}\n`,
  );
}

/**
 * Reads the media-source identifier for the current main HUD window.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @returns Desktop-capture media source id for the main window, if available.
 */
async function readMainWindowMediaSourceId(
  app: RunningHudApp,
): Promise<string | undefined> {
  return app.electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows().at(0);
    return mainWindow?.isDestroyed()
      ? undefined
      : mainWindow?.getMediaSourceId();
  });
}

/**
 * Returns whether the macOS native-window capture path should run for this
 * process.
 * @returns Whether the current run is the macOS CI screenshot environment.
 */
function shouldAttemptMacOsWindowCaptureOnCi(): boolean {
  return (
    CI_ARTIFACT_SCREENSHOTS_ENABLED &&
    CI_ENVIRONMENT_NAME === "macos" &&
    process.platform === "darwin"
  );
}

/**
 * Returns whether the Windows native-window capture path should run for this
 * process.
 * @returns Whether the current run is the Windows CI screenshot environment.
 */
function shouldAttemptWindowsWindowCaptureOnCi(): boolean {
  return (
    CI_ARTIFACT_SCREENSHOTS_ENABLED &&
    CI_ENVIRONMENT_NAME === "windows" &&
    process.platform === "win32"
  );
}

/**
 * Builds a filesystem-safe slug for Playwright artifact filenames.
 * @param label - Human-readable artifact label.
 * @returns A lowercase filename-safe slug.
 */
function slugifyArtifactLabel(label: string): string {
  let artifactSlug = "";

  for (const character of label.trim().toLowerCase()) {
    if (isAsciiArtifactCharacter(character)) {
      artifactSlug += character;
      continue;
    }

    if (!artifactSlug.endsWith("-")) {
      artifactSlug += "-";
    }
  }

  return trimArtifactDelimiter(artifactSlug);
}

/**
 * Trims leading and trailing hyphen delimiters from an artifact slug.
 * @param artifactSlug - Slug assembled from the original artifact label.
 * @returns The slug without surrounding delimiter characters.
 */
function trimArtifactDelimiter(artifactSlug: string): string {
  let endIndex = artifactSlug.length;
  let startIndex = 0;

  while (startIndex < endIndex && artifactSlug[startIndex] === "-") {
    startIndex += 1;
  }

  while (endIndex > startIndex && artifactSlug[endIndex - 1] === "-") {
    endIndex -= 1;
  }

  return artifactSlug.slice(startIndex, endIndex);
}

/**
 * Compares two window sizes for exact width and height equality.
 * @param left - First content size to compare.
 * @param right - Second content size to compare.
 * @returns Whether both content sizes are identical.
 */
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
 * @param expectedSize - Optional target size that must also stabilize before returning.
 * @param attemptLimit - Maximum number of size reads before timing out.
 * @returns The stabilized content width and height.
 */
export async function waitForStableWindowContentSize(
  app: RunningHudApp,
  expectedSize?: WindowContentSize,
  attemptLimit = WINDOW_SIZE_STABILITY_ATTEMPTS,
): Promise<WindowContentSize> {
  let previousSize: undefined | WindowContentSize;
  let stableMatchCount = 0;

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const nextSize = await readWindowContentSize(app);
    if (previousSize && sameWindowContentSize(previousSize, nextSize)) {
      stableMatchCount += 1;
      if (
        stableMatchCount >= WINDOW_SIZE_STABILITY_REQUIRED_MATCHES &&
        (expectedSize === undefined ||
          sameWindowContentSize(nextSize, expectedSize))
      ) {
        return nextSize;
      }
    } else {
      previousSize = nextSize;
      stableMatchCount = 0;
    }

    await app.page.waitForTimeout(WINDOW_SIZE_STABILITY_WAIT_MS);
  }

  throw new Error(
    expectedSize
      ? `Timed out waiting for the HUD window size to stabilize at ${String(expectedSize.width)}x${String(expectedSize.height)}.`
      : "Timed out waiting for the HUD window size to stabilize.",
  );
}
