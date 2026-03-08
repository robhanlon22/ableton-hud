import type { HudMode, HudState } from "@shared/types";

import {
  CompactViewRequestSchema,
  HUD_CHANNELS,
  HudModeSchema,
  HudStateSchema,
} from "@shared/ipc";
import { contextBridge, ipcRenderer } from "electron";

export interface HudApi {
  getInitialState: () => Promise<HudState>;
  onHudState: (callback: (state: HudState) => void) => () => void;
  setCompactView: (request: {
    enabled: boolean;
    height?: number;
    width?: number;
  }) => Promise<void>;
  setMode: (mode: HudMode) => Promise<void>;
  toggleTopmost: () => Promise<void>;
  toggleTrackLock: () => Promise<void>;
}

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

    setCompactView: async (request): Promise<void> => {
      const parsedRequest = CompactViewRequestSchema.parse(request);
      await ipcRenderer.invoke(HUD_CHANNELS.setCompactView, parsedRequest);
    },

    setMode: async (mode: HudMode): Promise<void> => {
      const parsedMode = HudModeSchema.parse(mode);
      await ipcRenderer.invoke(HUD_CHANNELS.setMode, parsedMode);
    },

    toggleTopmost: async (): Promise<void> => {
      await ipcRenderer.invoke(HUD_CHANNELS.toggleTopmost);
    },

    toggleTrackLock: async (): Promise<void> => {
      await ipcRenderer.invoke(HUD_CHANNELS.toggleTrackLock);
    },
  };
}

const hudApi = createIpcHudApi();

contextBridge.exposeInMainWorld("hudApi", hudApi);
