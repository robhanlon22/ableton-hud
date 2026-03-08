import type { HudMode, HudState } from "@shared/types";

/**
 * Renderer-facing HUD API exposed by preload on `window.hudApi`.
 */
export interface HudApi {
  /** Fetches the initial validated HUD state. */
  getInitialState: () => Promise<HudState>;
  /** Subscribes to HUD state updates and returns an unsubscribe handle. */
  onHudState: (callback: (state: HudState) => void) => () => void;
  /** Requests a compact-mode transition in the main process. */
  setCompactView: (request: {
    /** Whether compact mode should be enabled. */
    enabled: boolean;
    /** Optional compact content height in pixels. */
    height?: number;
    /** Optional compact content width in pixels. */
    width?: number;
  }) => Promise<void>;
  /** Switches the HUD between elapsed and remaining counter modes. */
  setMode: (mode: HudMode) => Promise<void>;
  /** Toggles the always-on-top preference in the main process. */
  toggleTopmost: () => Promise<void>;
  /** Toggles selected-track lock state in the main process. */
  toggleTrackLock: () => Promise<void>;
}

/**
 * Returns the preload-provided HUD bridge from the global runtime.
 * @returns The typed renderer bridge API.
 */
export function getHudApi(): HudApi {
  const hudApi = readRuntimeHudApi(globalThis);

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

/**
 * Reads the preload HUD bridge from a runtime that may expose `hudApi`.
 * @param runtime - Runtime object that may carry the preload API.
 * @returns The raw runtime `hudApi` value, when present.
 */
function readRuntimeHudApi(
  runtime: typeof globalThis & {
    /** Preload-provided HUD API attached to the renderer global. */
    hudApi?: unknown;
  },
): unknown {
  return runtime.hudApi;
}
