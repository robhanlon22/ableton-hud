/// <reference types="vite/client" />

import type { HudApi } from "./app/hud/api";

declare global {
  interface Window {
    hudApi: HudApi;
  }
}
