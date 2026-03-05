import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HudMode, HudState } from "../shared/types";

import {
  CompactViewRequestSchema,
  createDefaultHudState,
  HUD_CHANNELS,
  HudModeSchema,
  HudStateSchema,
} from "../shared/ipc";
import { AbletonOscBridge } from "./osc-bridge";
import { PrefStore } from "./prefs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let latestHudState: HudState | null = null;
let bridge: AbletonOscBridge | null = null;
let mode: HudMode = "elapsed";
let trackLocked = false;
let isCompactView = false;
let suppressPersist = false;
let preCompactBounds: null | {
  contentHeight: number;
  contentWidth: number;
  x: number;
  y: number;
} = null;

const WINDOW_CONTENT_WIDTH = 370;
const WINDOW_CONTENT_HEIGHT = 180;
const COMPACT_CONTENT_WIDTH = 320;
const COMPACT_CONTENT_HEIGHT = 138;

const prefStore = new PrefStore();
const isE2EMock = process.env.AOSC_E2E_MOCK === "1";
const rendererDebugPort = process.env.AOSC_RENDERER_DEBUG_PORT;

if (rendererDebugPort) {
  const parsedPort = Number.parseInt(rendererDebugPort, 10);
  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    app.commandLine.appendSwitch("remote-debugging-port", String(parsedPort));
  }
}

/**
 *
 */
async function createWindow(): Promise<void> {
  const prefs = await prefStore.load();
  const windowBounds = prefs.windowBounds;
  isCompactView = prefs.compactMode;
  const positionBounds = windowBounds
    ? {
        x: windowBounds.x,
        y: windowBounds.y,
      }
    : {};
  const initialBounds = isCompactView
    ? {
        ...positionBounds,
        height: COMPACT_CONTENT_HEIGHT,
        width: COMPACT_CONTENT_WIDTH,
      }
    : {
        ...positionBounds,
        height: windowBounds?.height ?? WINDOW_CONTENT_HEIGHT,
        width: windowBounds?.width ?? WINDOW_CONTENT_WIDTH,
      };
  preCompactBounds =
    isCompactView && windowBounds
      ? {
          contentHeight: windowBounds.height,
          contentWidth: windowBounds.width,
          x: windowBounds.x,
          y: windowBounds.y,
        }
      : null;

  const preloadCandidates = [
    join(__dirname, "../preload/index.cjs"),
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs"),
  ];
  const preloadPath =
    preloadCandidates.find((candidate) => existsSync(candidate)) ??
    preloadCandidates[0];

  if (!existsSync(preloadPath)) {
    throw new Error(
      `Unable to find preload bundle. Tried: ${preloadCandidates.join(", ")}`,
    );
  }

  mainWindow = new BrowserWindow({
    ...initialBounds,
    alwaysOnTop: prefs.alwaysOnTop,
    autoHideMenuBar: true,
    resizable: !isCompactView,
    titleBarStyle: "default",
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: false,
    },
  });

  const rendererUrl =
    process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("resize", () => {
    if (suppressPersist) {
      return;
    }
    void persistPrefs();
  });

  mainWindow.on("move", () => {
    if (suppressPersist) {
      return;
    }
    void persistPrefs();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    const initialState = latestHudState
      ? withWindowState(latestHudState)
      : createDefaultHudState(
          mode,
          resolveAlwaysOnTop(),
          isCompactView,
          trackLocked,
        );
    mainWindow?.webContents.send(HUD_CHANNELS.state, initialState);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 *
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
 *
 */
function registerIpcHandlers(): void {
  ipcMain.removeHandler(HUD_CHANNELS.getInitialState);
  ipcMain.handle(HUD_CHANNELS.getInitialState, () => {
    return latestHudState
      ? withWindowState(latestHudState)
      : createDefaultHudState(
          mode,
          resolveAlwaysOnTop(),
          isCompactView,
          trackLocked,
        );
  });

  ipcMain.removeHandler(HUD_CHANNELS.setMode);
  ipcMain.handle(HUD_CHANNELS.setMode, async (_event, nextMode: HudMode) => {
    const parsedMode = HudModeSchema.parse(nextMode);
    mode = parsedMode;
    bridge?.setMode(parsedMode);
    await persistPrefs();
  });

  ipcMain.removeHandler(HUD_CHANNELS.setCompactView);
  ipcMain.handle(HUD_CHANNELS.setCompactView, async (_event, request) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const parsedRequest = CompactViewRequestSchema.parse(request);
    if (parsedRequest.enabled) {
      if (
        parsedRequest.width === undefined ||
        parsedRequest.height === undefined
      ) {
        throw new Error("Compact view dimensions are required when enabled.");
      }

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
      mainWindow.setContentSize(parsedRequest.width, parsedRequest.height);
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
    preCompactBounds = null;
    await persistPrefs();
  });

  ipcMain.removeHandler(HUD_CHANNELS.toggleTrackLock);
  ipcMain.handle(HUD_CHANNELS.toggleTrackLock, async () => {
    if (isE2EMock) {
      return;
    }

    if (!bridge) {
      return;
    }

    trackLocked = bridge.toggleTrackLock();
    await persistPrefs();
  });

  ipcMain.removeHandler(HUD_CHANNELS.toggleTopmost);
  ipcMain.handle(HUD_CHANNELS.toggleTopmost, async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
    await persistPrefs();

    const nextState = latestHudState
      ? withWindowState(latestHudState)
      : createDefaultHudState(
          mode,
          resolveAlwaysOnTop(),
          isCompactView,
          trackLocked,
        );
    sendStateToWindow(nextState);
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
 * Sends sanitized HUD state to the renderer process.
 * @param state - The next HUD state to validate and broadcast.
 */
function sendStateToWindow(state: HudState): void {
  const parsedState = HudStateSchema.safeParse(withWindowState(state));
  if (!parsedState.success) {
    return;
  }

  latestHudState = parsedState.data;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(HUD_CHANNELS.state, latestHudState);
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

void app.whenReady().then(async () => {
  const prefs = await prefStore.load();
  isCompactView = prefs.compactMode;
  mode = prefs.mode;
  trackLocked = prefs.trackLocked;

  if (!isE2EMock) {
    bridge = new AbletonOscBridge(mode, sendStateToWindow, trackLocked);
    bridge.start();
  }

  registerIpcHandlers();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  bridge?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
