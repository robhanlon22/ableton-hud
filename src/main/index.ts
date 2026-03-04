import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AbletonOscBridge } from './osc-bridge';
import { PrefStore } from './prefs';
import type { HudMode, HudState } from '../shared/types';
import { createDefaultHudState, HUD_CHANNELS, HudModeSchema, HudStateSchema } from '../shared/ipc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let latestHudState: HudState | null = null;
let bridge: AbletonOscBridge | null = null;
let mode: HudMode = 'elapsed';

const WINDOW_CONTENT_WIDTH = 370;
const WINDOW_CONTENT_HEIGHT = 180;

const prefStore = new PrefStore();
const rendererDebugPort = process.env.AOSC_RENDERER_DEBUG_PORT;

if (rendererDebugPort) {
  const parsedPort = Number.parseInt(rendererDebugPort, 10);
  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    app.commandLine.appendSwitch('remote-debugging-port', String(parsedPort));
  }
}

function resolveAlwaysOnTop(): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop());
}

function withWindowState(state: HudState): HudState {
  return {
    ...state,
    alwaysOnTop: resolveAlwaysOnTop()
  };
}

async function persistPrefs(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const [contentWidth, contentHeight] = mainWindow.getContentSize();

  await prefStore.save({
    mode,
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    windowBounds: {
      x: bounds.x,
      y: bounds.y,
      width: contentWidth,
      height: contentHeight
    }
  });
}

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

async function createWindow(): Promise<void> {
  const prefs = await prefStore.load();
  const windowBounds = prefs.windowBounds;
  const initialBounds = {
    width: windowBounds?.width ?? WINDOW_CONTENT_WIDTH,
    height: windowBounds?.height ?? WINDOW_CONTENT_HEIGHT,
    ...(windowBounds
      ? {
          x: windowBounds.x,
          y: windowBounds.y
        }
      : {})
  };

  const preloadCandidates = [
    join(__dirname, '../preload/index.cjs'),
    join(__dirname, '../preload/index.js'),
    join(__dirname, '../preload/index.mjs')
  ];
  const preloadPath = preloadCandidates.find((candidate) => existsSync(candidate)) ?? preloadCandidates[0];

  if (!existsSync(preloadPath)) {
    throw new Error(`Unable to find preload bundle. Tried: ${preloadCandidates.join(', ')}`);
  }

  mainWindow = new BrowserWindow({
    ...initialBounds,
    useContentSize: true,
    resizable: true,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    alwaysOnTop: prefs.alwaysOnTop,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('resize', () => {
    void persistPrefs();
  });

  mainWindow.on('move', () => {
    void persistPrefs();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const initialState = latestHudState ? withWindowState(latestHudState) : createDefaultHudState(mode, resolveAlwaysOnTop());
    mainWindow?.webContents.send(HUD_CHANNELS.state, initialState);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.removeHandler(HUD_CHANNELS.getInitialState);
  ipcMain.handle(HUD_CHANNELS.getInitialState, () => {
    return latestHudState ? withWindowState(latestHudState) : createDefaultHudState(mode, resolveAlwaysOnTop());
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

app.whenReady().then(async () => {
  const prefs = await prefStore.load();
  mode = prefs.mode;

  bridge = new AbletonOscBridge(mode, sendStateToWindow);
  bridge.start();

  registerIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('before-quit', () => {
  bridge?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
