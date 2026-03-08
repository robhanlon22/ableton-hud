import type { ClipTimingMeta, HudMode } from "@shared/types";

import { buildHudState } from "@main/ableton-live-bridge-state";
import { expect, it } from "vitest";

const ACTIVE_TRACK_INDEX = 2;
const LOOP_END = 4;
const LOOP_START = 2;
const LOOPING_CLIP_LENGTH = 8;
const NON_LOOPING_CLIP_LENGTH = 6;
const PRE_LOOP_POSITION = 1;
const REMAINING_POSITION = 5;
const SIGNATURE_DENOMINATOR = 4;
const SIGNATURE_NUMERATOR = 4;

interface SnapshotOverrides {
  activeClip?: { clip: number; track: number };
  clipMeta?: ClipTimingMeta;
  currentPosition?: number;
  launchPosition?: number;
  loopWrapCount?: number;
  mode?: HudMode;
  sceneColor?: number;
}

it("returns the default HUD state when clip timing is unavailable", () => {
  // arrange
  const snapshot = createSnapshot();

  // act
  const hudState = buildHudState(snapshot);

  // assert
  expect(hudState.clipIndex).toBeUndefined();
  expect(hudState.counterText).toBe("0:0:0");
  expect(hudState.lastBarSource).toBeUndefined();
  expect(hudState.trackIndex).toBe(ACTIVE_TRACK_INDEX);
});

it("uses the launch position during the intro before a loop begins", () => {
  // arrange
  const snapshot = createSnapshot({
    activeClip: { clip: 1, track: ACTIVE_TRACK_INDEX },
    clipMeta: {
      length: LOOPING_CLIP_LENGTH,
      loopEnd: LOOP_END,
      looping: true,
      loopStart: LOOP_START,
    },
    currentPosition: PRE_LOOP_POSITION,
    launchPosition: 0,
    mode: "elapsed",
    sceneColor: 0,
  });

  // act
  const hudState = buildHudState(snapshot);

  // assert
  expect(hudState.lastBarSource).toBe("loop_end");
  expect(hudState.sceneColor).toBeUndefined();
  expect(hudState.trackIndex).toBe(ACTIVE_TRACK_INDEX);
});

it("computes remaining clip-end state without a loop span", () => {
  // arrange
  const snapshot = createSnapshot({
    activeClip: { clip: 1, track: ACTIVE_TRACK_INDEX },
    clipMeta: {
      length: NON_LOOPING_CLIP_LENGTH,
      loopEnd: LOOP_START,
      looping: false,
      loopStart: LOOP_START,
    },
    currentPosition: REMAINING_POSITION,
    mode: "remaining",
  });

  // act
  const hudState = buildHudState(snapshot);

  // assert
  expect(hudState.lastBarSource).toBe("clip_end");
  expect(hudState.isLastBar).toBe(true);
  expect(hudState.trackIndex).toBe(ACTIVE_TRACK_INDEX);
});

/**
 * Creates a bridge-state snapshot with sensible HUD defaults.
 * @param overrides - Snapshot fields to override for the current assertion.
 * @returns A bridge-state snapshot suitable for `buildHudState`.
 */
function createSnapshot(overrides: SnapshotOverrides = {}) {
  return {
    activeClip: overrides.activeClip,
    beatCounter: 0,
    beatFlashToken: 0,
    clipColor: undefined,
    clipMeta: overrides.clipMeta ?? {
      length: LOOPING_CLIP_LENGTH,
      loopEnd: LOOP_END,
      looping: false,
      loopStart: 0,
    },
    clipName: "Clip",
    connected: true,
    currentPosition: overrides.currentPosition,
    isPlaying: true,
    launchPosition: overrides.launchPosition,
    loopWrapCount: overrides.loopWrapCount ?? 0,
    mode: overrides.mode ?? "elapsed",
    sceneColor: overrides.sceneColor ?? 1,
    sceneName: "Scene",
    selectedTrack: ACTIVE_TRACK_INDEX,
    signatureDenominator: SIGNATURE_DENOMINATOR,
    signatureNumerator: SIGNATURE_NUMERATOR,
    trackColor: 1,
    trackLocked: false,
    trackName: "Track",
  };
}
