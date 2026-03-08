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
  flushIndexMainStartup,
  importIndexMainModule,
  resetIndexMainTestEnvironment,
  resolveBridgeInstance,
  resolveIpcHandler,
  setProcessPlatform,
} from "@main/app/__tests__/utilities";
import { HUD_CHANNELS } from "@shared/ipc";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

it("quits startup when the preload bundle is missing", async () => {
  // arrange
  runtime.existsSyncMock.mockReturnValue(false);
  runtime.appWhenReadyMock.mockReturnValue(Promise.resolve());

  // act
  const startupPromise = importIndexMainModule();
  await startupPromise;
  await flushIndexMainStartup();

  // assert
  expect(runtime.appQuitMock).toHaveBeenCalledTimes(1);
  expect(runtime.windows).toHaveLength(0);
});

it("rejects compact mode requests that omit dimensions", async () => {
  // arrange
  await bootIndexMainModule(runtime);
  const compactHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.setCompactView,
  );

  // act
  const compactRequestPromise = compactHandler({}, { enabled: true });

  // assert
  await expect(compactRequestPromise).rejects.toThrow(/expected number/u);
});

it("ignores track-lock IPC after the bridge has been torn down", async () => {
  // arrange
  await bootIndexMainModule(runtime);
  const toggleTrackLockHandler = resolveIpcHandler(
    runtime,
    HUD_CHANNELS.toggleTrackLock,
  );
  const bridgeInstance = resolveBridgeInstance(runtime);
  await runtime.emitAppEvent("before-quit");
  runtime.prefSaveMock.mockClear();

  // act
  await toggleTrackLockHandler({});

  // assert
  expect(bridgeInstance.toggleTrackLock).not.toHaveBeenCalled();
  expect(runtime.prefSaveMock).not.toHaveBeenCalled();
});

it("quits startup when preference loading rejects with a non-Error failure", async () => {
  // arrange
  const stderrWriteSpy = vi
    .spyOn(process.stderr, "write")
    .mockReturnValue(true);
  runtime.prefLoadMock.mockRejectedValue("startup failed");

  // act
  await bootIndexMainModule(runtime);

  // assert
  expect(stderrWriteSpy).toHaveBeenCalledWith(
    expect.stringContaining("startup failed"),
  );
  expect(runtime.appQuitMock).toHaveBeenCalledTimes(1);
});

it("logs the message when startup errors do not expose a stack", async () => {
  // arrange
  const startupError = new Error("missing stack");
  startupError.stack = undefined;
  const stderrWriteSpy = vi
    .spyOn(process.stderr, "write")
    .mockReturnValue(true);
  runtime.prefLoadMock.mockRejectedValue(startupError);

  // act
  await bootIndexMainModule(runtime);

  // assert
  expect(stderrWriteSpy).toHaveBeenCalledWith(
    expect.stringContaining("missing stack"),
  );
  expect(runtime.appQuitMock).toHaveBeenCalledTimes(1);
});
