/// <reference types="vite/client" />

import type { HudMode, HudState } from "../../shared/types";

declare global {
  interface Window {
    hudApi: {
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
    };
  }
}
