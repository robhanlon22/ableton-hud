import { contextBridge, ipcRenderer } from "electron";

import type { HudMode, HudState } from "../shared/types";

import {
  createDefaultHudState,
  HUD_CHANNELS,
  HudModeSchema,
  HudStateSchema,
} from "../shared/ipc";

interface HudApi {
  getInitialState: () => Promise<HudState>;
  onHudState: (callback: (state: HudState) => void) => () => void;
  setMode: (mode: HudMode) => Promise<void>;
  toggleTopmost: () => Promise<void>;
}

interface HudApiWithE2E extends HudApi {
  __injectState?: (state: HudState) => Promise<void>;
}

const isE2EMock = process.env.AOSC_E2E_MOCK === "1";

const mockSubscribers = new Set<(state: HudState) => void>();
let mockState: HudState = createDefaultHudState("elapsed", true);

/**
 * Creates the normal IPC-backed preload API.
 * @returns IPC-backed HUD API implementation.
 */
function createIpcHudApi(): HudApi {
  return {
    getInitialState: async (): Promise<HudState> => {
      const payload: unknown = await ipcRenderer.invoke(
        HUD_CHANNELS.getInitialState,
      );
      return HudStateSchema.parse(payload);
    },

    onHudState: (callback: (state: HudState) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: HudState,
      ): void => {
        const parsed = HudStateSchema.safeParse(state);
        if (parsed.success) {
          callback(parsed.data);
        }
      };

      ipcRenderer.on(HUD_CHANNELS.state, listener);
      return () => {
        ipcRenderer.removeListener(HUD_CHANNELS.state, listener);
      };
    },

    setMode: async (mode: HudMode): Promise<void> => {
      const parsedMode = HudModeSchema.parse(mode);
      await ipcRenderer.invoke(HUD_CHANNELS.setMode, parsedMode);
    },

    toggleTopmost: async (): Promise<void> => {
      await ipcRenderer.invoke(HUD_CHANNELS.toggleTopmost);
    },
  };
}

/**
 * Creates a deterministic in-memory HUD API for Electron E2E tests.
 * @returns Mock HUD API with optional state injection helper.
 */
function createMockHudApi(): HudApiWithE2E {
  return {
    __injectState: (state: HudState): Promise<void> => {
      mockState = HudStateSchema.parse(state);
      emitMockState();
      return Promise.resolve();
    },

    getInitialState: (): Promise<HudState> => {
      return Promise.resolve(mockState);
    },

    onHudState: (callback: (state: HudState) => void): (() => void) => {
      mockSubscribers.add(callback);
      return () => {
        mockSubscribers.delete(callback);
      };
    },

    setMode: (mode: HudMode): Promise<void> => {
      const parsedMode = HudModeSchema.parse(mode);
      mockState = {
        ...mockState,
        mode: parsedMode,
      };
      emitMockState();
      return Promise.resolve();
    },

    toggleTopmost: (): Promise<void> => {
      mockState = {
        ...mockState,
        alwaysOnTop: !mockState.alwaysOnTop,
      };
      emitMockState();
      return Promise.resolve();
    },
  };
}

/**
 * Broadcasts mock state to all subscribers.
 */
function emitMockState(): void {
  for (const subscriber of mockSubscribers) {
    subscriber(mockState);
  }
}

const hudApi = isE2EMock ? createMockHudApi() : createIpcHudApi();

contextBridge.exposeInMainWorld("hudApi", hudApi);
