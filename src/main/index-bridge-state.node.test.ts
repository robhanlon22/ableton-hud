import type { IndexMainRuntime } from "@main/__tests__/index-test-types";

import {
  createBridgeModuleMock,
  createElectronModuleMock,
  createFsModuleMock,
  createPrefsModuleMock,
} from "@main/__tests__/index-test-module-mocks";
import { createIndexMainRuntime } from "@main/__tests__/index-test-runtime";
import {
  bootIndexMainModule,
  cleanupIndexMainTestEnvironment,
  emitDidFinishLoad,
  resetIndexMainTestEnvironment,
  resolveBridgeInstance,
  resolveIpcHandler,
  resolveWindowInstance,
  setProcessPlatform,
} from "@main/__tests__/index-test-utilities";
import { createDefaultHudState, HUD_CHANNELS } from "@shared/ipc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECOND_RENDER_UPDATE = 2;

let runtime: IndexMainRuntime;

describe("main/index bridge state flows", () => {
  beforeEach(async () => {
    runtime = createIndexMainRuntime();
    await resetIndexMainTestEnvironment(runtime);
    setProcessPlatform("linux");
    vi.doMock("electron", () => createElectronModuleMock(runtime));
    vi.doMock("./ableton-live-bridge", () => createBridgeModuleMock(runtime));
    vi.doMock("./prefs", () => createPrefsModuleMock(runtime));
    vi.doMock("node:fs", () => createFsModuleMock(runtime));
  });

  afterEach(async () => {
    await cleanupIndexMainTestEnvironment(runtime);
  });

  it("forwards disconnected and reconnected bridge snapshots to the renderer", async () => {
    // arrange
    await bootIndexMainModule(runtime);
    const windowInstance = resolveWindowInstance(runtime);
    const bridgeInstance = resolveBridgeInstance(runtime);
    const getInitialStateHandler = resolveIpcHandler(
      runtime,
      HUD_CHANNELS.getInitialState,
    );
    const disconnectedState = {
      ...createDefaultHudState(),
      connected: false,
      counterText: "0:0:0",
      isPlaying: false,
    };
    const reconnectedState = {
      ...createDefaultHudState(),
      connected: true,
      counterText: "4:1:1",
      isPlaying: true,
      trackName: "Recovered Track",
    };
    emitDidFinishLoad(windowInstance);
    windowInstance.webContents.send.mockClear();

    // act
    bridgeInstance.emitState(disconnectedState);
    bridgeInstance.emitState(reconnectedState);

    // assert
    expect(windowInstance.webContents.send).toHaveBeenNthCalledWith(
      1,
      HUD_CHANNELS.state,
      expect.objectContaining({
        connected: false,
        counterText: "0:0:0",
      }),
    );
    expect(windowInstance.webContents.send).toHaveBeenNthCalledWith(
      SECOND_RENDER_UPDATE,
      HUD_CHANNELS.state,
      expect.objectContaining({
        connected: true,
        counterText: "4:1:1",
        isPlaying: true,
        trackName: "Recovered Track",
      }),
    );
    expect(getInitialStateHandler({})).toEqual(
      expect.objectContaining({
        connected: true,
        counterText: "4:1:1",
        trackName: "Recovered Track",
      }),
    );
  });
});
