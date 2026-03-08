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
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const COMPACT_HEIGHT = 138;
const COMPACT_WIDTH = 320;
const INVALID_DEBUG_PORT = "invalid-port";
const MACOS_WINDOW_HEIGHT = 333;
const MACOS_WINDOW_WIDTH = 444;
const MACOS_WINDOW_X = 8;
const MACOS_WINDOW_Y = 9;
const RENDERER_INDEX_FILE_PATTERN = /renderer[/\\]index\.html$/u;
const SINGLE_WINDOW_COUNT = 1;

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

it("uses the loadFile fallback on darwin and ignores invalid bridge snapshots", async () => {
  // arrange
  runtime.prefLoadMock.mockResolvedValue({
    alwaysOnTop: true,
    compactMode: true,
    mode: "elapsed",
    trackLocked: false,
    windowBounds: {
      height: MACOS_WINDOW_HEIGHT,
      width: MACOS_WINDOW_WIDTH,
      x: MACOS_WINDOW_X,
      y: MACOS_WINDOW_Y,
    },
  });
  runtime.existsSyncMock.mockReturnValueOnce(false);
  runtime.existsSyncMock.mockReturnValueOnce(true);
  setProcessPlatform("darwin");

  // act
  await bootIndexMainModule(runtime);

  // assert
  const windowInstance = resolveWindowInstance(runtime);
  emitDidFinishLoad(windowInstance);
  expect(windowInstance.loadFile).toHaveBeenCalledWith(
    expect.stringMatching(RENDERER_INDEX_FILE_PATTERN),
  );
  expect(windowInstance.options.resizable).toBe(false);
  expect(windowInstance.webContents.send).toHaveBeenCalledWith(
    HUD_CHANNELS.state,
    createDefaultHudState("elapsed", true, true, false),
  );
  resolveBridgeInstance(runtime).emitState({
    ...createDefaultHudState(),
    counterText: 42,
  });
  expect(windowInstance.webContents.send).toHaveBeenCalledTimes(1);
});

it("handles darwin topmost toggles and leaves the app running when windows close", async () => {
  // arrange
  runtime.prefLoadMock.mockResolvedValue({
    alwaysOnTop: true,
    compactMode: true,
    mode: "elapsed",
    trackLocked: false,
  });
  process.env.ABLETON_HUD_RENDERER_DEBUG_PORT = INVALID_DEBUG_PORT;
  setProcessPlatform("darwin");
  await bootIndexMainModule(runtime);
  const windowInstance = resolveWindowInstance(runtime);
  const toggleTopmostHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.toggleTopmost,
  );
  windowInstance.visibleOnAllWorkspaces = true;

  // act
  await toggleTopmostHandler({});
  await runtime.emitAppEvent("window-all-closed");

  // assert
  expect(runtime.appendSwitchMock).not.toHaveBeenCalled();
  expect(windowInstance.setAlwaysOnTop).toHaveBeenCalledWith(false);
  expect(windowInstance.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(false);
  expect(runtime.appQuitMock).not.toHaveBeenCalled();
});

it("covers no-op IPC branches when the window is gone or compact mode is unchanged", async () => {
  // arrange
  await bootIndexMainModule(runtime);
  const windowInstance = resolveWindowInstance(runtime);
  const compactHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.setCompactView,
  );
  const setModeHandler = resolveIpcHandler(runtime, HUD_CHANNELS.setMode);
  const toggleTopmostHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.toggleTopmost,
  );

  // act
  await compactHandler({}, { enabled: false });
  windowInstance.emit("closed");
  await compactHandler({}, { enabled: false });
  await toggleTopmostHandler({});
  await setModeHandler({}, "remaining");

  // assert
  expect(windowInstance.setResizable).not.toHaveBeenCalled();
  expect(runtime.prefSaveMock).not.toHaveBeenCalled();
});

it("keeps the latest pushed state and round-trips compact toggles", async () => {
  // arrange
  runtime.prefLoadMock.mockResolvedValue({
    alwaysOnTop: true,
    compactMode: true,
    mode: "elapsed",
    trackLocked: false,
  });
  setProcessPlatform("darwin");
  await bootIndexMainModule(runtime);
  const windowInstance = resolveWindowInstance(runtime);
  const bridgeInstance = resolveBridgeInstance(runtime);
  const compactHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.setCompactView,
  );
  const getInitialStateHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.getInitialState,
  );
  const toggleTopmostHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.toggleTopmost,
  );
  const pushedState = {
    ...createDefaultHudState(),
    connected: true,
    counterText: "1:1:1",
  };

  // act
  bridgeInstance.emitState(pushedState);
  emitDidFinishLoad(windowInstance);
  await compactHandler(
    {},
    { enabled: true, height: COMPACT_HEIGHT, width: COMPACT_WIDTH },
  );
  await compactHandler({}, { enabled: false });
  windowInstance.visibleOnAllWorkspaces = false;
  await toggleTopmostHandler({});
  await runtime.emitAppEvent("activate");

  // assert
  expect(windowInstance.webContents.send).toHaveBeenCalledWith(
    HUD_CHANNELS.state,
    expect.objectContaining({
      connected: true,
      counterText: "1:1:1",
    }),
  );
  expect(getInitialStateHandler({})).toEqual(
    expect.objectContaining({
      connected: true,
      counterText: "1:1:1",
    }),
  );
  expect(windowInstance.setPosition).not.toHaveBeenCalled();
  expect(windowInstance.setAlwaysOnTop).toHaveBeenCalledWith(false);
  expect(windowInstance.setVisibleOnAllWorkspaces).toHaveBeenCalledTimes(1);
  expect(runtime.windows).toHaveLength(SINGLE_WINDOW_COUNT);
  windowInstance.emit("closed");
  bridgeInstance.emitState(pushedState);
});
