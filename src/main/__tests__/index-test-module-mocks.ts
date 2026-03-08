import type { IndexMainRuntime } from "./index-test-types";

/**
 * Builds the mocked bridge module for the current runtime.
 * @param runtime - The shared test runtime.
 * @returns The mocked `AbletonLiveBridge` export.
 */
export function createBridgeModuleMock(runtime: IndexMainRuntime) {
  return {
    AbletonLiveBridge: runtime.AbletonLiveBridgeMock,
  };
}

/**
 * Builds the mocked `electron` module for the current runtime.
 * @param runtime - The shared test runtime.
 * @returns The mocked `electron` exports used by `src/main/index.ts`.
 */
export function createElectronModuleMock(runtime: IndexMainRuntime) {
  return {
    app: {
      commandLine: {
        appendSwitch: runtime.appendSwitchMock,
      },
      on: runtime.appOnMock,
      quit: runtime.appQuitMock,
      whenReady: runtime.appWhenReadyMock,
    },
    BrowserWindow: runtime.BrowserWindowMock,
    ipcMain: {
      handle: runtime.ipcHandleMock,
      removeHandler: runtime.ipcRemoveHandlerMock,
    },
  };
}

/**
 * Builds the mocked `node:fs` module for the current runtime.
 * @param runtime - The shared test runtime.
 * @returns The mocked `existsSync` export.
 */
export function createFsModuleMock(runtime: IndexMainRuntime) {
  return {
    existsSync: runtime.existsSyncMock,
  };
}

/**
 * Builds the mocked preference store module for the current runtime.
 * @param runtime - The shared test runtime.
 * @returns The mocked `PrefStore` export.
 */
export function createPrefsModuleMock(runtime: IndexMainRuntime) {
  return {
    PrefStore: class PrefStoreMock {
      readonly load = runtime.prefLoadMock;
      readonly save = runtime.prefSaveMock;
    },
  };
}
