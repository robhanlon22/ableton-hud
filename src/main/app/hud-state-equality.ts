import type { HudState } from "@shared/types";

/**
 * Checks whether two HUD state snapshots are identical.
 * @param left - The first HUD state snapshot.
 * @param right - The second HUD state snapshot.
 * @returns Whether the two snapshots match exactly.
 */
export function areHudStatesEqual(left: HudState, right: HudState): boolean {
  const scalarPairs = [
    [left.alwaysOnTop, right.alwaysOnTop],
    [left.beatFlashToken, right.beatFlashToken],
    [left.beatInBar, right.beatInBar],
    [left.clipColor, right.clipColor],
    [left.clipIndex, right.clipIndex],
    [left.clipName, right.clipName],
    [left.compactView, right.compactView],
    [left.connected, right.connected],
    [left.counterText, right.counterText],
    [left.isDownbeat, right.isDownbeat],
    [left.isLastBar, right.isLastBar],
    [left.isPlaying, right.isPlaying],
    [left.lastBarSource, right.lastBarSource],
    [left.mode, right.mode],
    [left.sceneColor, right.sceneColor],
    [left.sceneName, right.sceneName],
    [left.trackColor, right.trackColor],
    [left.trackIndex, right.trackIndex],
    [left.trackLocked, right.trackLocked],
    [left.trackName, right.trackName],
  ] as const;

  return (
    areCounterPartsEqual(left, right) &&
    scalarPairs.every(([leftValue, rightValue]) => leftValue === rightValue)
  );
}

/**
 * Checks whether two HUD counter payloads are identical.
 * @param left - The first counter payload.
 * @param right - The second counter payload.
 * @returns Whether the counter payloads match exactly.
 */
function areCounterPartsEqual(left: HudState, right: HudState): boolean {
  return (
    left.counterParts.bar === right.counterParts.bar &&
    left.counterParts.beat === right.counterParts.beat &&
    left.counterParts.sixteenth === right.counterParts.sixteenth
  );
}
