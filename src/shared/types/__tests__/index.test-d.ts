import type {
  ClipTimingMeta,
  CounterParts,
  HudMode,
  HudState,
  TimingGrid,
} from "@shared/types";

import { assertType, expectTypeOf, test } from "vitest";

test("exports shared HUD and timing contracts", () => {
  // arrange
  const counterParts: CounterParts = {
    bar: 1,
    beat: 2,
    sixteenth: 3,
  };
  const clipTiming: ClipTimingMeta = {
    length: 64,
    loopEnd: 64,
    looping: true,
    loopStart: 0,
  };
  const timingGrid: TimingGrid = {
    beatLength: 0.5,
    beatsPerBar: 4,
    beatsPerDisplayBar: 4,
    sixteenthLength: 0.125,
  };
  const hudState: HudState = {
    alwaysOnTop: false,
    beatFlashToken: 1,
    beatInBar: 1,
    clipColor: undefined,
    clipIndex: undefined,
    clipName: "Clip",
    compactView: false,
    connected: true,
    counterParts,
    counterText: "1:1:1",
    isDownbeat: true,
    isLastBar: false,
    isPlaying: true,
    lastBarSource: "clip_end",
    mode: "elapsed",
    sceneColor: 12,
    sceneName: "Scene",
    trackColor: 34,
    trackIndex: 1,
    trackLocked: false,
    trackName: "Track",
  };
  const hudMode: HudMode = hudState.mode;

  // act
  assertType<CounterParts>(counterParts);
  assertType<ClipTimingMeta>(clipTiming);
  assertType<TimingGrid>(timingGrid);
  assertType<HudState>(hudState);
  assertType<HudMode>(hudMode);

  // assert
  expectTypeOf(counterParts).toEqualTypeOf<CounterParts>();
  expectTypeOf(clipTiming).toEqualTypeOf<ClipTimingMeta>();
  expectTypeOf(timingGrid).toEqualTypeOf<TimingGrid>();
  expectTypeOf(hudState).toEqualTypeOf<HudState>();
  expectTypeOf(hudMode).toEqualTypeOf<HudMode>();
});
