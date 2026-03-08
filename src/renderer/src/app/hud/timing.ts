import type { HudState } from "@shared/types";

export const DOWNBEAT_LAST_BAR_FLASH_MS = 320;
export const EMPHASIZED_FLASH_MS = 230;
export const STANDARD_FLASH_MS = 150;

/**
 * Computes flash animation duration for the current musical position.
 * @param state - HUD state used to derive downbeat and last-bar emphasis.
 * @returns The flash duration in milliseconds.
 */
export function flashDuration(state: HudState): number {
  if (state.isLastBar && state.isDownbeat) {
    return DOWNBEAT_LAST_BAR_FLASH_MS;
  }
  if (state.isLastBar || state.isDownbeat) {
    return EMPHASIZED_FLASH_MS;
  }
  return STANDARD_FLASH_MS;
}
