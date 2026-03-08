import { vi } from "vitest";

import type {
  AbletonLiveBridgeLike,
  BrowserWindowLike,
  IndexMainRuntime,
} from "./index-test-types";

const STARTUP_FLUSH_COUNT = 8;

const originalProcessPlatformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
);

/**
 * Imports the main index module and flushes the mocked `whenReady` promise.
 * @param runtime - The shared test runtime.
 * @returns A promise that settles once startup microtasks are flushed.
 */
export async function bootIndexMainModule(
  runtime: IndexMainRuntime,
): Promise<void> {
  const importPromise = importIndexMainModule();
  await flushIndexMainStartup();
  await runtime.resolveWhenReady();
  await flushIndexMainStartup();
  await importPromise;
  await flushIndexMainStartup();
}

/**
 * Settles queued index startup work and tears down any live app listeners.
 * @param runtime - The shared test runtime.
 */
export async function cleanupIndexMainTestEnvironment(
  runtime: IndexMainRuntime,
): Promise<void> {
  await runtime.resolveWhenReady();
  await flushIndexMainStartup();
  await runtime.emitAppEvent("before-quit");
  await resetIndexMainTestEnvironment(runtime);
  restoreProcessPlatform();
}

/**
 * Triggers the renderer `did-finish-load` callback for a mocked window.
 * @param windowInstance - The window whose renderer load should complete.
 */
export function emitDidFinishLoad(windowInstance: BrowserWindowLike): void {
  const didFinishLoadListener = windowInstance.webContents.listeners
    .get("did-finish-load")
    ?.at(0);
  if (didFinishLoadListener === undefined) {
    throw new Error("Expected a did-finish-load listener to be registered.");
  }

  didFinishLoadListener();
}

/**
 * Flushes queued startup microtasks used by the Electron main-index tests.
 * @returns A promise that settles after the startup queue is drained.
 */
export async function flushIndexMainStartup(): Promise<void> {
  for (let index = 0; index < STARTUP_FLUSH_COUNT; index += 1) {
    await Promise.resolve();
  }
}

/**
 * Imports the Electron main index module under test.
 * @returns A promise that settles after the module finishes evaluating.
 */
export async function importIndexMainModule(): Promise<void> {
  await import("../index");
}

/**
 * Resets modules, mocks, and environment variables between index tests.
 * @param runtime - The shared test runtime.
 */
export async function resetIndexMainTestEnvironment(
  runtime: IndexMainRuntime,
): Promise<void> {
  await flushIndexMainStartup();
  runtime.reset();
  vi.resetModules();
  delete process.env.AOSC_RENDERER_DEBUG_PORT;
  delete process.env.ELECTRON_RENDERER_URL;
  delete process.env.VITE_DEV_SERVER_URL;
  await flushIndexMainStartup();
}

/**
 * Returns the first bridge instance created by the main module.
 * @param runtime - The shared test runtime.
 * @returns The first bridge instance.
 */
export function resolveBridgeInstance(
  runtime: IndexMainRuntime,
): AbletonLiveBridgeLike {
  const bridgeInstance = runtime.bridgeInstances.at(0);
  if (bridgeInstance === undefined) {
    throw new Error("Expected the Ableton bridge to be created.");
  }

  return bridgeInstance;
}

/**
 * Returns a registered IPC handler for a HUD channel.
 * @param runtime - The shared test runtime.
 * @param channel - The HUD channel name.
 * @returns The resolved IPC handler.
 */
export function resolveIpcHandler(
  runtime: IndexMainRuntime,
  channel: string,
): (...arguments_: unknown[]) => unknown {
  const handler = runtime.ipcHandlers.get(channel);
  if (handler === undefined) {
    throw new Error(`Expected an IPC handler for channel: ${channel}`);
  }

  return handler;
}

/**
 * Returns the first BrowserWindow created by the main module.
 * @param runtime - The shared test runtime.
 * @returns The first window instance.
 */
export function resolveWindowInstance(
  runtime: IndexMainRuntime,
): BrowserWindowLike {
  const windowInstance = runtime.windows.at(0);
  if (windowInstance === undefined) {
    throw new Error("Expected the main window to be created.");
  }

  return windowInstance;
}

/**
 * Restores the original `process.platform` descriptor after the tests finish.
 */
export function restoreProcessPlatform(): void {
  if (originalProcessPlatformDescriptor !== undefined) {
    Object.defineProperty(
      process,
      "platform",
      originalProcessPlatformDescriptor,
    );
  }
}

/**
 * Overrides `process.platform` for the current test.
 * @param platform - The platform value to expose during the test.
 */
export function setProcessPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
}
