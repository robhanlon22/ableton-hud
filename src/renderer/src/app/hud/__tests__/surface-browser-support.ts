import type { HudSurfaceProperties } from "@renderer/app/hud/surface";
import type { HudState } from "@shared/types";

import { createDefaultHudState } from "@shared/ipc";
import { vi } from "vitest";

/**
 * Builds a connected HUD state fixture with named metadata.
 * @param overrides - Partial state overrides to merge into the fixture.
 * @returns The HUD state fixture.
 */
export const makeNamedHudState = (
  overrides: Partial<HudState> = {},
): HudState => ({
  ...createDefaultHudState(),
  clipIndex: 1,
  clipName: "Clip",
  connected: true,
  counterText: "2:3:4",
  isPlaying: true,
  sceneName: "Drop",
  trackIndex: 0,
  trackName: "Kick",
  ...overrides,
});

/**
 * Builds a HUD state fixture with metadata placeholders.
 * @param overrides - Partial state overrides to merge into the fixture.
 * @returns The HUD state fixture.
 */
export const makeMetadataPlaceholderHudState = (
  overrides: Partial<HudState> = {},
): HudState => ({
  ...createDefaultHudState(),
  connected: true,
  counterText: "2:3:4",
  isPlaying: true,
  ...overrides,
});

/**
 * Builds a HUD surface prop object for renderer tests.
 * @param state - The HUD state to render.
 * @param propertyOverrides - Partial prop overrides to merge into the fixture.
 * @returns The HUD surface props fixture.
 */
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
