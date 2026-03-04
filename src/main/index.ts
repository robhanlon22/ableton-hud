import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AbletonOscBridge } from './osc-bridge';
import { PrefStore } from './prefs';
import type { HudMode, HudState } from '../shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let latestHudState: HudState | null = null;
let bridge: AbletonOscBridge | null = null;
let mode: HudMode = 'elapsed';

const prefStore = new PrefStore();

async function persistPrefs(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  await prefStore.save({
    mode,
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
    windowBounds: mainWindow.getBounds()
  });
}

function sendStateToWindow(state: HudState): void {
  latestHudState = state;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hud:state', state);
  }
}

async function createWindow(): Promise<void> {
  const prefs = await prefStore.load();
  const windowBounds = prefs.windowBounds ?? {
    width: 420,
    height: 180
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
    ...windowBounds,
    minWidth: 320,
    minHeight: 140,
    resizable: true,
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
    if (latestHudState) {
      mainWindow?.webContents.send('hud:state', latestHudState);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.removeHandler('hud:set-mode');
  ipcMain.handle('hud:set-mode', async (_event, nextMode: HudMode) => {
    mode = nextMode;
    bridge?.setMode(nextMode);
    await persistPrefs();
  });

  ipcMain.removeHandler('hud:toggle-topmost');
  ipcMain.handle('hud:toggle-topmost', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
    await persistPrefs();
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
