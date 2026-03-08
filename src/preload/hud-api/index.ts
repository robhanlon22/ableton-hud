import type { HudMode, HudState } from "@shared/types";

import {
  CompactViewRequestSchema,
  HUD_CHANNELS,
  HudModeSchema,
  HudStateSchema,
} from "@shared/ipc";
import { contextBridge, ipcRenderer } from "electron";

/**
 * Describes the compact-mode resize request sent through preload IPC.
 */
export interface CompactViewRequest {
  /** Whether compact mode should be enabled. */
  enabled: boolean;
  /** Optional compact content height in pixels. */
  height?: number;
  /** Optional compact content width in pixels. */
  width?: number;
}

/**
 * Defines the renderer-facing preload API exposed on `window.hudApi`.
 */
export interface HudApi {
  /** Fetches the initial validated HUD state snapshot. */
  getInitialState: () => Promise<HudState>;
  /** Registers for validated HUD state pushes and returns an unsubscribe handle. */
  onHudState: (callback: (state: HudState) => void) => () => void;
  /** Sends a validated compact-mode resize request to the main process. */
  setCompactView: (request: CompactViewRequest) => Promise<void>;
  /** Sends a validated counter-mode change to the main process. */
  setMode: (mode: HudMode) => Promise<void>;
  /** Toggles the always-on-top preference in the main process. */
  toggleTopmost: () => Promise<void>;
  /** Toggles track-lock state in the main process. */
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
