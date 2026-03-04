/// <reference types="vite/client" />

import type { HudMode, HudState } from "../../shared/types";

declare global {
  interface Window {
    hudApi: {
      getInitialState: () => Promise<HudState>;
      onHudState: (callback: (state: HudState) => void) => () => void;
      setMode: (mode: HudMode) => Promise<void>;
      toggleTopmost: () => Promise<void>;
    };
  }
}
