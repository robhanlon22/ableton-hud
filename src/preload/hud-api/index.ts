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
 * Exposes the preload HUD API on the renderer global.
 */
export function exposeHudApi(): void {
  contextBridge.exposeInMainWorld("hudApi", createIpcHudApi());
}

/**
 * Creates the normal IPC-backed preload API.
 * @returns IPC-backed HUD API implementation.
 */
function createIpcHudApi(): HudApi {
  return {
    /**
     * Fetches the renderer's initial HUD state snapshot.
     * @returns The validated initial HUD state from the main process.
     */
    getInitialState: async (): Promise<HudState> => {
      const payload: unknown = await ipcRenderer.invoke(
        HUD_CHANNELS.getInitialState,
      );
      return HudStateSchema.parse(payload);
    },

    /**
     * Subscribes to validated HUD state updates from the main process.
     * @param callback - Receives each validated HUD state snapshot.
     * @returns A cleanup function that removes the IPC listener.
     */
    onHudState: (callback: (state: HudState) => void): (() => void) => {
      /**
       * Forwards only schema-valid HUD state payloads to the renderer callback.
       * @param _event - The Electron IPC event metadata.
       * @param state - Candidate HUD state payload from the main process.
       */
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
      /**
       * Removes the HUD state IPC listener for this subscription.
       */
      return () => {
        ipcRenderer.removeListener(HUD_CHANNELS.state, listener);
      };
    },

    /**
     * Updates compact-mode state in the main process.
     * @param request - The compact-view change request to validate and send.
     */
    setCompactView: async (request): Promise<void> => {
      const parsedRequest = CompactViewRequestSchema.parse(request);
      await ipcRenderer.invoke(HUD_CHANNELS.setCompactView, parsedRequest);
    },

    /**
     * Switches the counter display mode in the main process.
     * @param mode - The requested HUD counter mode.
     */
    setMode: async (mode: HudMode): Promise<void> => {
      const parsedMode = HudModeSchema.parse(mode);
      await ipcRenderer.invoke(HUD_CHANNELS.setMode, parsedMode);
    },

    /**
     * Toggles the always-on-top window preference in the main process.
     */
    toggleTopmost: async (): Promise<void> => {
      await ipcRenderer.invoke(HUD_CHANNELS.toggleTopmost);
    },

    /**
     * Toggles the selected-track lock in the main process.
     */
    toggleTrackLock: async (): Promise<void> => {
      await ipcRenderer.invoke(HUD_CHANNELS.toggleTrackLock);
    },
  };
}
