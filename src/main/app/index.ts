import type { HudMode, HudState } from "@shared/types";

import { AbletonLiveBridge } from "@main/ableton-live-bridge";
import { areHudStatesEqual } from "@main/app/hud-state-equality";
import { PrefStore } from "@main/preferences";
import {
  CompactViewRequestSchema,
  createDefaultHudState,
  HUD_CHANNELS,
  HudModeSchema,
  HudStateSchema,
} from "@shared/ipc";
import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const E2E_SESSION_DATA_DIRECTORY_NAME = "session-data";
const MAX_PORT_NUMBER = 65_535;

/**
 * Stores the content-size bounds to restore after leaving compact mode.
 */
interface CompactWindowBounds {
  /** Restored content height in pixels. */
  contentHeight: number;
  /** Restored content width in pixels. */
  contentWidth: number;
  /** Restored window x-position in screen coordinates. */
  x: number;
  /** Restored window y-position in screen coordinates. */
  y: number;
}

/**
 * Describes the initial content bounds used when creating the HUD window.
 */
interface InitialWindowBounds {
  /** Initial content height in pixels. */
  height: number;
  /** Initial content width in pixels. */
  width: number;
  /** Optional initial window x-position in screen coordinates. */
  x?: number;
  /** Optional initial window y-position in screen coordinates. */
  y?: number;
}

/**
 * Persists a concrete window rectangle for the HUD window.
 */
interface StoredWindowBounds {
  /** Stored content height in pixels. */
  height: number;
  /** Stored content width in pixels. */
  width: number;
  /** Stored window x-position in screen coordinates. */
  x: number;
  /** Stored window y-position in screen coordinates. */
  y: number;
}

let mainWindow: BrowserWindow | undefined;
let latestHudState: HudState | undefined;
let bridge: AbletonLiveBridge | undefined;
let mode: HudMode = "elapsed";
let trackLocked = false;
let isCompactView = false;
let suppressPersist = false;
let preCompactBounds: CompactWindowBounds | undefined;

const WINDOW_CONTENT_WIDTH = 370;
const WINDOW_CONTENT_HEIGHT = 180;
const COMPACT_CONTENT_WIDTH = 320;
const COMPACT_CONTENT_HEIGHT = 138;

configureAppPaths();
const prefStore = new PrefStore();
const rendererDebugPort = process.env.AOSC_RENDERER_DEBUG_PORT;

if (rendererDebugPort) {
  const parsedPort = Number.parseInt(rendererDebugPort, 10);
  if (
    Number.isInteger(parsedPort) &&
    parsedPort > 0 &&
    parsedPort <= MAX_PORT_NUMBER
  ) {
    app.commandLine.appendSwitch("remote-debugging-port", String(parsedPort));
  }
}

/**
 * Queues the Electron app startup on the next microtask.
 */
export function queueApplicationStart(): void {
  queueMicrotask(() => {
    void startApplication();
  });
}

/**
 * Applies the floating-window policy used by the HUD.
 * @param win - Main HUD window instance.
 * @param enabled - Whether FLOAT mode is enabled.
 */
function applyHudTopmost(win: BrowserWindow, enabled: boolean): void {
  if (process.platform === "darwin") {
    if (enabled) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, "screen-saver");
      return;
    }

    win.setAlwaysOnTop(false);
    if (win.isVisibleOnAllWorkspaces()) {
      win.setVisibleOnAllWorkspaces(false);
    }
    return;
  }

  win.setAlwaysOnTop(enabled);
}

/**
 * Builds the fallback HUD state used before the bridge publishes live data.
 * @returns The default HUD state snapshot for the current window mode.
 */
function buildDefaultState(): HudState {
  return createDefaultHudState(
    mode,
    resolveAlwaysOnTop(),
    isCompactView,
    trackLocked,
  );
}

/**
 * Redirects Electron profile storage during end-to-end runs.
 */
function configureAppPaths(): void {
  const endToEndUserDataPath = process.env.AOSC_E2E_USER_DATA;
  if (!endToEndUserDataPath) {
    return;
  }

  app.setPath("userData", endToEndUserDataPath);
  app.setPath(
    "sessionData",
    path.join(endToEndUserDataPath, E2E_SESSION_DATA_DIRECTORY_NAME),
  );
}

/**
 * Creates the Electron browser window and restores persisted preferences.
 * @returns A promise that settles after the window is ready.
 */
async function createWindow(): Promise<void> {
  const prefs = await prefStore.load();
  const windowBounds = prefs.windowBounds;
  isCompactView = prefs.compactMode;
  preCompactBounds = resolvePreCompactBounds(windowBounds);

  mainWindow = new BrowserWindow({
    ...resolveInitialWindowBounds(windowBounds),
    alwaysOnTop: false,
    autoHideMenuBar: true,
    resizable: !isCompactView,
    titleBarStyle: "default",
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolvePreloadPath(),
      sandbox: false,
    },
  });
  applyHudTopmost(mainWindow, prefs.alwaysOnTop);
  await loadRenderer(mainWindow);
  registerWindowListeners(mainWindow);
}

/**
 * Returns the latest HUD state, augmented with window-derived flags.
 * @returns The state that preload should hand to the renderer on first load.
 */
function getInitialState(): HudState {
  return latestHudState ? withWindowState(latestHudState) : buildDefaultState();
}

/**
 * Updates compact-mode window state from an IPC request payload.
 * @param _event - The IPC invocation event, unused here.
 * @param request - Untrusted renderer payload to validate before applying.
 * @returns A promise that settles after window state and preferences are updated.
 */
async function handleSetCompactView(
  _event: unknown,
  request: unknown,
): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const parsedRequest = CompactViewRequestSchema.parse(request);
  if (parsedRequest.enabled) {
    const { height, width } = parsedRequest;
    if (!isCompactView) {
      const bounds = mainWindow.getBounds();
      const [contentWidth, contentHeight] = mainWindow.getContentSize();
      preCompactBounds = {
        contentHeight,
        contentWidth,
        x: bounds.x,
        y: bounds.y,
      };
    }

    suppressPersist = true;
    isCompactView = true;
    mainWindow.setResizable(false);
    mainWindow.setContentSize(width, height);
    suppressPersist = false;
    await persistPrefs();
    return;
  }

  if (!isCompactView) {
    return;
  }

  suppressPersist = true;
  mainWindow.setResizable(true);
  if (preCompactBounds) {
    mainWindow.setPosition(preCompactBounds.x, preCompactBounds.y);
    mainWindow.setContentSize(
      preCompactBounds.contentWidth,
      preCompactBounds.contentHeight,
    );
  }

  isCompactView = false;
  suppressPersist = false;
  preCompactBounds = undefined;
  await persistPrefs();
}

/**
 * Persists a requested HUD timing mode.
 * @param _event - The IPC invocation event, unused here.
 * @param nextMode - The requested mode from the renderer.
 * @returns A promise that settles after the bridge and prefs are updated.
 */
async function handleSetMode(
  _event: unknown,
  nextMode: HudMode,
): Promise<void> {
  const parsedMode = HudModeSchema.parse(nextMode);
  mode = parsedMode;
  bridge?.setMode(parsedMode);
  await persistPrefs();
}

/**
 * Logs startup failure details and terminates the Electron app.
 * @param error - The startup failure.
 */
function handleStartupFailure(error: unknown): void {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Failed to start Ableton HUD.\n${message}\n`);
  app.quit();
}

/**
 * Toggles the always-on-top window flag.
 * @returns A promise that settles after preferences are persisted.
 */
async function handleToggleTopmost(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const nextEnabled = !mainWindow.isAlwaysOnTop();
  applyHudTopmost(mainWindow, nextEnabled);
  await persistPrefs();
  sendStateToWindow(getInitialState());
}

/**
 * Toggles track locking in the Ableton bridge.
 * @returns A promise that settles after preferences are persisted.
 */
async function handleToggleTrackLock(): Promise<void> {
  if (!bridge) {
    return;
  }

  trackLocked = bridge.toggleTrackLock();
  await persistPrefs();
}

/**
 * Loads the renderer bundle or dev server into the main window.
 * @param win - The window to populate.
 * @returns A promise that settles after the renderer target loads.
 */
async function loadRenderer(win: BrowserWindow): Promise<void> {
  const rendererUrl =
    process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
  await (rendererUrl
    ? win.loadURL(rendererUrl)
    : win.loadFile(path.join(__dirname, "../renderer/index.html")));
}

/**
 * Persists the latest window and HUD preferences to disk.
 * @returns A promise that settles after the preferences file is written.
 */
async function persistPrefs(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const [contentWidth, contentHeight] = mainWindow.getContentSize();
  const persistedBounds =
    isCompactView && preCompactBounds
      ? preCompactBounds
      : {
          contentHeight,
          contentWidth,
          x: bounds.x,
          y: bounds.y,
        };

  await prefStore.save({
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    compactMode: isCompactView,
    mode,
    trackLocked,
    windowBounds: {
      height: persistedBounds.contentHeight,
      width: persistedBounds.contentWidth,
      x: persistedBounds.x,
      y: persistedBounds.y,
    },
  });
}

/**
 * Persists preferences unless a temporary resize/move mutation is in progress.
 */
function persistUnlessSuppressed(): void {
  if (suppressPersist) {
    return;
  }

  void persistPrefs();
}

/**
 * Registers or refreshes all main-process IPC handlers exposed to preload.
 */
function registerIpcHandlers(): void {
  ipcMain.removeHandler(HUD_CHANNELS.getInitialState);
  ipcMain.handle(HUD_CHANNELS.getInitialState, getInitialState);
  ipcMain.removeHandler(HUD_CHANNELS.setMode);
  ipcMain.handle(HUD_CHANNELS.setMode, handleSetMode);
  ipcMain.removeHandler(HUD_CHANNELS.setCompactView);
  ipcMain.handle(HUD_CHANNELS.setCompactView, handleSetCompactView);
  ipcMain.removeHandler(HUD_CHANNELS.toggleTrackLock);
  ipcMain.handle(HUD_CHANNELS.toggleTrackLock, handleToggleTrackLock);
  ipcMain.removeHandler(HUD_CHANNELS.toggleTopmost);
  ipcMain.handle(HUD_CHANNELS.toggleTopmost, handleToggleTopmost);
}

/**
 * Registers main-window lifecycle listeners used for persistence and hydration.
 * @param win - The window to observe.
 */
function registerWindowListeners(win: BrowserWindow): void {
  win.on("resize", persistUnlessSuppressed);
  win.on("move", persistUnlessSuppressed);
  win.webContents.on("did-finish-load", () => {
    const initialState = latestHudState
      ? withWindowState(latestHudState)
      : buildDefaultState();
    mainWindow?.webContents.send(HUD_CHANNELS.state, initialState);
  });
  win.on("closed", () => {
    mainWindow = undefined;
  });
}

/**
 * Resolves the current always-on-top state of the main window.
 * @returns `true` when the main window exists and is topmost.
 */
function resolveAlwaysOnTop(): boolean {
  return Boolean(
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop(),
  );
}

/**
 * Resolves the starting bounds for the main HUD window.
 * @param windowBounds - Stored content bounds, if preferences already exist.
 * @returns Window bounds suitable for the next BrowserWindow construction.
 */
function resolveInitialWindowBounds(
  windowBounds?: StoredWindowBounds,
): InitialWindowBounds {
  const positionBounds = windowBounds
    ? {
        x: windowBounds.x,
        y: windowBounds.y,
      }
    : {};
  if (isCompactView) {
    return {
      ...positionBounds,
      height: COMPACT_CONTENT_HEIGHT,
      width: COMPACT_CONTENT_WIDTH,
    };
  }

  return {
    ...positionBounds,
    height: windowBounds?.height ?? WINDOW_CONTENT_HEIGHT,
    width: windowBounds?.width ?? WINDOW_CONTENT_WIDTH,
  };
}

/**
 * Resolves the bounds to restore when exiting compact mode.
 * @param windowBounds - Stored content bounds from the preference file.
 * @returns The non-compact window bounds when compact mode is active.
 */
function resolvePreCompactBounds(
  windowBounds?: StoredWindowBounds,
): CompactWindowBounds | undefined {
  if (!isCompactView || !windowBounds) {
    return undefined;
  }

  return {
    contentHeight: windowBounds.height,
    contentWidth: windowBounds.width,
    x: windowBounds.x,
    y: windowBounds.y,
  };
}

/**
 * Finds the emitted preload bundle across the supported output extensions.
 * @returns The absolute preload bundle path that exists on disk.
 */
function resolvePreloadPath(): string {
  const preloadCandidates = [
    path.join(__dirname, "../preload/index.cjs"),
    path.join(__dirname, "../preload/index.js"),
    path.join(__dirname, "../preload/index.mjs"),
  ];
  const preloadPath =
    preloadCandidates.find((candidate) => existsSync(candidate)) ??
    preloadCandidates[0];

  if (!existsSync(preloadPath)) {
    throw new Error(
      `Unable to find preload bundle. Tried: ${preloadCandidates.join(", ")}`,
    );
  }

  return preloadPath;
}

/**
 * Sends sanitized HUD state to the renderer process.
 * @param state - The next HUD state to validate and broadcast.
 */
function sendStateToWindow(state: HudState): void {
  const parsedState = HudStateSchema.safeParse(withWindowState(state));
  if (!parsedState.success) {
    return;
  }

  if (
    latestHudState !== undefined &&
    areHudStatesEqual(latestHudState, parsedState.data)
  ) {
    return;
  }

  latestHudState = parsedState.data;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(HUD_CHANNELS.state, latestHudState);
  }
}

/**
 * Boots the Electron main process after the app-ready signal is available.
 * @returns A promise that settles once startup listeners and the first window are ready.
 */
async function startApplication(): Promise<void> {
  try {
    await app.whenReady();

    const prefs = await prefStore.load();
    isCompactView = prefs.compactMode;
    mode = prefs.mode;
    trackLocked = prefs.trackLocked;

    bridge = new AbletonLiveBridge(mode, sendStateToWindow, trackLocked);
    bridge.start();

    registerIpcHandlers();
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });

    app.on("before-quit", () => {
      bridge?.stop();
      bridge = undefined;
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  } catch (error) {
    handleStartupFailure(error);
  }
}

/**
 * Adds live window flags to a HUD state snapshot.
 * @param state - The HUD state to augment.
 * @returns The provided state with the latest window-derived fields.
 */
function withWindowState(state: HudState): HudState {
  return {
    ...state,
    alwaysOnTop: resolveAlwaysOnTop(),
    compactView: isCompactView,
  };
}
