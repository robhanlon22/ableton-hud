import { contextBridge, ipcRenderer } from 'electron';
import type { HudMode, HudState } from '../shared/types';
import { HUD_CHANNELS, HudModeSchema, HudStateSchema } from '../shared/ipc';

const hudApi = {
  onHudState: (callback: (state: HudState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: HudState) => {
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

  getInitialState: async (): Promise<HudState> => {
    const payload = await ipcRenderer.invoke(HUD_CHANNELS.getInitialState);
    return HudStateSchema.parse(payload);
  },

  setMode: async (mode: HudMode): Promise<void> => {
    const parsedMode = HudModeSchema.parse(mode);
    await ipcRenderer.invoke(HUD_CHANNELS.setMode, parsedMode);
  },

  toggleTopmost: async (): Promise<void> => {
    await ipcRenderer.invoke(HUD_CHANNELS.toggleTopmost);
  }
};

contextBridge.exposeInMainWorld('hudApi', hudApi);
