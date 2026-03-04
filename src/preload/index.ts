import { contextBridge, ipcRenderer } from 'electron';
import type { HudMode, HudState } from '../shared/types';

const hudApi = {
  onHudState: (callback: (state: HudState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: HudState) => {
      callback(state);
    };

    ipcRenderer.on('hud:state', listener);
    return () => {
      ipcRenderer.removeListener('hud:state', listener);
    };
  },

  setMode: async (mode: HudMode): Promise<void> => {
    await ipcRenderer.invoke('hud:set-mode', mode);
  },

  toggleTopmost: async (): Promise<void> => {
    await ipcRenderer.invoke('hud:toggle-topmost');
  }
};

contextBridge.exposeInMainWorld('hudApi', hudApi);
