import type { IndexMainRuntime } from "@main/app/__tests__/types";
import type { HudState } from "@shared/types";

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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECOND_RENDER_UPDATE = 2;

let runtime: IndexMainRuntime;

describe("main/index bridge state flows", () => {
  beforeEach(async () => {
    runtime = createIndexMainRuntime();
    await resetIndexMainTestEnvironment(runtime);
    setProcessPlatform("linux");
    vi.doMock("electron", () => createElectronModuleMock(runtime));
    vi.doMock("@main/ableton-live-bridge", () =>
      createBridgeModuleMock(runtime),
    );
    vi.doMock("@main/preferences", () => createPrefsModuleMock(runtime));
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
    const disconnectedState: HudState = {
      ...createDefaultHudState(),
      connected: false,
      counterText: "0:0:0",
      isPlaying: false,
    };
    const reconnectedState: HudState = {
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
