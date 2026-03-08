import type { HudSurfaceProperties } from "@renderer/app/hud/surface";
import type { HudState } from "@shared/types";

import { createDefaultHudState } from "@shared/ipc";
import { vi } from "vitest";

export const makeNamedHudState = (
  overrides: Partial<HudState> = {},
): HudState => ({
  ...createDefaultHudState(),
  clipIndex: 1,
  clipName: "Build",
  connected: true,
  counterText: "2:3:4",
  isPlaying: true,
  sceneName: "Drop",
  trackIndex: 0,
  trackName: "Kick",
  ...overrides,
});

export const makeMetadataPlaceholderHudState = (
  overrides: Partial<HudState> = {},
): HudState => ({
  ...createDefaultHudState(),
  connected: true,
  counterText: "2:3:4",
  isPlaying: true,
  ...overrides,
});

export const makeHudSurfaceProperties = (
  state: HudState,
  propertyOverrides: Partial<
    Omit<HudSurfaceProperties, "compactPanelRef" | "state">
  > = {},
): HudSurfaceProperties => ({
  compactPanelRef: { current: document.createElement("div") },
  isCompactView: false,
  isFlashActive: false,
  onToggleCompactView: vi.fn(),
  onToggleMode: vi.fn(),
  onToggleTopmost: vi.fn(),
  onToggleTrackLock: vi.fn(),
  state,
  ...propertyOverrides,
});
