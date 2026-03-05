import type { HudState } from "../../../shared/types";

/**
 * Computes flash animation duration for the current musical position.
 * @param state - HUD state used to derive downbeat and last-bar emphasis.
 * @returns The flash duration in milliseconds.
 */
export function flashDuration(state: HudState): number {
  if (state.isLastBar && state.isDownbeat) {
    return 320;
  }
  if (state.isLastBar || state.isDownbeat) {
    return 230;
  }
  return 150;
}
