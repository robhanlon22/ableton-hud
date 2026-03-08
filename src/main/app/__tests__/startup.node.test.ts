import type { IndexMainRuntime } from "@main/app/__tests__/types";

import {
  createBridgeModuleMock,
  createElectronModuleMock,
  createFsModuleMock,
  createPrefsModuleMock,
} from "@main/app/__tests__/module-mocks";
import { createIndexMainRuntime } from "@main/app/__tests__/runtime";
import {
  bootIndexMainModule,
  cleanupIndexMainTestEnvironment,
  emitDidFinishLoad,
  resetIndexMainTestEnvironment,
  resolveBridgeInstance,
  resolveIpcHandler,
  resolveWindowInstance,
  setProcessPlatform,
} from "@main/app/__tests__/utilities";
import { createDefaultHudState, HUD_CHANNELS } from "@shared/ipc";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const COMPACT_HEIGHT = 130;
const COMPACT_WIDTH = 300;
const DEBUG_PORT = "9222";
const PERSISTED_MOVE_SAVE_COUNT = 1;
const RENDERER_URL = "http://127.0.0.1:5173";
const SESSION_DATA_DIRECTORY_NAME = "session-data";
const SECOND_WINDOW_COUNT = 2;
const WINDOW_HEIGHT = 250;
const WINDOW_WIDTH = 420;
const WINDOW_X = 41;
const WINDOW_Y = 42;

let runtime: IndexMainRuntime;

beforeEach(async () => {
  runtime = createIndexMainRuntime();
  await resetIndexMainTestEnvironment(runtime);
  setProcessPlatform("linux");
  vi.doMock("electron", () => createElectronModuleMock(runtime));
  vi.doMock("@main/ableton-live-bridge", () => createBridgeModuleMock(runtime));
  vi.doMock("@main/preferences", () => createPrefsModuleMock(runtime));
  vi.doMock("node:fs", () => createFsModuleMock(runtime));
});

afterEach(async () => {
  await cleanupIndexMainTestEnvironment(runtime);
});

it("boots app side effects and registers core IPC handlers", async () => {
  // arrange
  process.env.AOSC_RENDERER_DEBUG_PORT = DEBUG_PORT;
  process.env.ELECTRON_RENDERER_URL = RENDERER_URL;
  runtime.prefLoadMock.mockResolvedValue({
    alwaysOnTop: false,
    compactMode: false,
    mode: "remaining",
    trackLocked: true,
    windowBounds: {
      height: WINDOW_HEIGHT,
      width: WINDOW_WIDTH,
      x: WINDOW_X,
      y: WINDOW_Y,
    },
  });

  // act
  await bootIndexMainModule(runtime);

  // assert
  const windowInstance = resolveWindowInstance(runtime);
  emitDidFinishLoad(windowInstance);
  expect(runtime.appendSwitchMock).toHaveBeenCalledWith(
    "remote-debugging-port",
    DEBUG_PORT,
  );
  expect(resolveBridgeInstance(runtime).start).toHaveBeenCalledTimes(1);
  expect(windowInstance.loadURL).toHaveBeenCalledWith(RENDERER_URL);
  expect(runtime.ipcHandlers.has(HUD_CHANNELS.getInitialState)).toBe(true);
  expect(runtime.ipcHandlers.has(HUD_CHANNELS.setMode)).toBe(true);
  expect(runtime.ipcHandlers.has(HUD_CHANNELS.setCompactView)).toBe(true);
  expect(runtime.ipcHandlers.has(HUD_CHANNELS.toggleTopmost)).toBe(true);
  expect(runtime.ipcHandlers.has(HUD_CHANNELS.toggleTrackLock)).toBe(true);
  expect(windowInstance.webContents.send).toHaveBeenCalledWith(
    HUD_CHANNELS.state,
    createDefaultHudState("remaining", false, false, true),
  );
});

it("redirects Electron profile storage for e2e launches", async () => {
  // arrange
  const endToEndUserDataPath = path.resolve(
    "test-results",
    "aosc-e2e-user-data",
  );
  process.env.AOSC_E2E_USER_DATA = endToEndUserDataPath;

  // act
  await bootIndexMainModule(runtime);

  // assert
  expect(runtime.appSetPathMock).toHaveBeenCalledWith(
    "userData",
    endToEndUserDataPath,
  );
  expect(runtime.appSetPathMock).toHaveBeenCalledWith(
    "sessionData",
    path.join(endToEndUserDataPath, SESSION_DATA_DIRECTORY_NAME),
  );
});

it("persists compact toggles and topmost changes", async () => {
  // arrange
  runtime.prefLoadMock.mockResolvedValue({
    alwaysOnTop: false,
    compactMode: false,
    mode: "remaining",
    trackLocked: true,
    windowBounds: {
      height: WINDOW_HEIGHT,
      width: WINDOW_WIDTH,
      x: WINDOW_X,
      y: WINDOW_Y,
    },
  });
  await bootIndexMainModule(runtime);
  const windowInstance = resolveWindowInstance(runtime);
  const compactHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.setCompactView,
  );
  const toggleTopmostHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.toggleTopmost,
  );
  const prefSaveCallCountBeforeCompact = runtime.prefSaveMock.mock.calls.length;
  windowInstance.setContentSize.mockImplementationOnce(
    (width: number, height: number) => {
      windowInstance.contentSize = [width, height];
      windowInstance.bounds.width = width;
      windowInstance.bounds.height = height;
      windowInstance.emit("resize");
      windowInstance.emit("move");
    },
  );

  // act
  await compactHandler(
    {},
    { enabled: true, height: COMPACT_HEIGHT, width: COMPACT_WIDTH },
  );
  await compactHandler({}, { enabled: false });
  await toggleTopmostHandler({});

  // assert
  expect(windowInstance.setResizable).toHaveBeenCalledWith(false);
  expect(windowInstance.setContentSize).toHaveBeenCalledWith(
    COMPACT_WIDTH,
    COMPACT_HEIGHT,
  );
  expect(runtime.prefSaveMock.mock.calls.length).toBeGreaterThan(
    prefSaveCallCountBeforeCompact + 1,
  );
  expect(windowInstance.setResizable).toHaveBeenLastCalledWith(true);
  expect(windowInstance.setPosition).toHaveBeenCalledWith(WINDOW_X, WINDOW_Y);
  expect(windowInstance.setContentSize).toHaveBeenCalledWith(
    WINDOW_WIDTH,
    WINDOW_HEIGHT,
  );
  expect(windowInstance.setAlwaysOnTop).toHaveBeenCalledWith(true);
  expect(runtime.prefSaveMock).toHaveBeenLastCalledWith({
    alwaysOnTop: true,
    compactMode: false,
    mode: "remaining",
    trackLocked: true,
    windowBounds: {
      height: WINDOW_HEIGHT,
      width: WINDOW_WIDTH,
      x: WINDOW_X,
      y: WINDOW_Y,
    },
  });
});

it("stops the bridge on quit and recreates the window on activate", async () => {
  // arrange
  await bootIndexMainModule(runtime);
  const bridgeInstance = resolveBridgeInstance(runtime);
  const windowInstance = resolveWindowInstance(runtime);

  // act
  await runtime.emitAppEvent("before-quit");
  windowInstance.closed = true;
  await runtime.emitAppEvent("activate");

  // assert
  expect(bridgeInstance.stop).toHaveBeenCalledTimes(1);
  expect(runtime.windows).toHaveLength(SECOND_WINDOW_COUNT);
});

it("persists unsuppressed move events from the main window", async () => {
  // arrange
  await bootIndexMainModule(runtime);
  const windowInstance = resolveWindowInstance(runtime);
  runtime.prefSaveMock.mockClear();

  // act
  windowInstance.emit("move");
  await Promise.resolve();

  // assert
  expect(runtime.prefSaveMock).toHaveBeenCalledTimes(PERSISTED_MOVE_SAVE_COUNT);
});

it("quits the app when all windows close on non-darwin platforms", async () => {
  // arrange
  await bootIndexMainModule(runtime);

  // act
  await runtime.emitAppEvent("window-all-closed");

  // assert
  expect(runtime.appQuitMock).toHaveBeenCalledTimes(1);
});

it("forwards mode and track-lock IPC requests to the bridge", async () => {
  // arrange
  await bootIndexMainModule(runtime);
  const bridgeInstance = resolveBridgeInstance(runtime);
  const setModeHandler = resolveIpcHandler(runtime, HUD_CHANNELS.setMode);
  const toggleTrackLockHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.toggleTrackLock,
  );

  // act
  await setModeHandler({}, "elapsed");
  await toggleTrackLockHandler({});

  // assert
  expect(bridgeInstance.setMode).toHaveBeenCalledWith("elapsed");
  expect(bridgeInstance.toggleTrackLock).toHaveBeenCalledTimes(1);
});
