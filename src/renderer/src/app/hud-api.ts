import type { HudMode, HudState } from "@shared/types";

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
 * Returns the preload-provided HUD bridge from the global runtime.
 * @returns The typed renderer bridge API.
 */
export function getHudApi(): HudApi {
  const hudApi: unknown = Reflect.get(globalThis, "hudApi");

  if (!isHudApi(hudApi)) {
    throw new Error("hudApi is unavailable in the renderer context.");
  }

  return hudApi;
}

/**
 * Checks whether an unknown runtime value matches the HUD bridge contract.
 * @param candidate - Runtime value read from the global object.
 * @returns Whether the candidate exposes the preload HUD API shape.
 */
function isHudApi(candidate: unknown): candidate is HudApi {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  return (
    "getInitialState" in candidate &&
    "onHudState" in candidate &&
    "setCompactView" in candidate &&
    "setMode" in candidate &&
    "toggleTopmost" in candidate &&
    "toggleTrackLock" in candidate
  );
}
