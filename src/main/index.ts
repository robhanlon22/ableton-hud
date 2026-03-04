import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HudMode, HudState } from "../shared/types";

import {
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

const WINDOW_CONTENT_WIDTH = 370;
const WINDOW_CONTENT_HEIGHT = 180;

const prefStore = new PrefStore();
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
  const initialBounds = {
    height: windowBounds?.height ?? WINDOW_CONTENT_HEIGHT,
    width: windowBounds?.width ?? WINDOW_CONTENT_WIDTH,
    ...(windowBounds
      ? {
          x: windowBounds.x,
          y: windowBounds.y,
        }
      : {}),
  };

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
    resizable: true,
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
    void persistPrefs();
  });

  mainWindow.on("move", () => {
    void persistPrefs();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    const initialState = latestHudState
      ? withWindowState(latestHudState)
      : createDefaultHudState(mode, resolveAlwaysOnTop());
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

  await prefStore.save({
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    mode,
    windowBounds: {
      height: contentHeight,
      width: contentWidth,
      x: bounds.x,
      y: bounds.y,
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
      : createDefaultHudState(mode, resolveAlwaysOnTop());
  });

  ipcMain.removeHandler(HUD_CHANNELS.setMode);
  ipcMain.handle(HUD_CHANNELS.setMode, async (_event, nextMode: HudMode) => {
    const parsedMode = HudModeSchema.parse(nextMode);
    mode = parsedMode;
    bridge?.setMode(parsedMode);
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
      : createDefaultHudState(mode, resolveAlwaysOnTop());
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
  };
}

void app.whenReady().then(async () => {
  const prefs = await prefStore.load();
  mode = prefs.mode;

  bridge = new AbletonOscBridge(mode, sendStateToWindow);
  bridge.start();

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
