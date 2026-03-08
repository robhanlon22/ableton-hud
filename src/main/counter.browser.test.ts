import { describe, expect, it } from "vitest";

import {
  computeBeatInBar,
  computeBeatsPerBar,
  computeIsLastBar,
  createTimingGrid,
  formatCounterParts,
  hasValidLoopSpan,
  toElapsedCounterParts,
  toRemainingCounterParts,
} from "./counter";

const COMMON_DENOMINATOR = 4;
const COMMON_NUMERATOR = 4;
const COMPOUND_DENOMINATOR = 8;
const COMPOUND_NUMERATOR = 7;
const DOUBLE_BAR_COUNT = 2;
const FOURTH_SIXTEENTH = 0.25;
const FULL_BAR = 4;
const HALF_BEAT = 0.5;
const LAST_SIXTEENTH = 0.99;
const MALFORMED_BEAT_LENGTH = -1;
const MALFORMED_BEATS_PER_BAR = -4;
const NEAR_FULL_BAR = 3.75;
const NON_LAST_BAR_REMAINDER = 4.1;
const QUARTER_BEAT_EPSILON = 0.24;
const RARE_METER_FALLBACK = 5;
const SEVEN_EIGHTHS_NUMERATOR = -7;
const THREE_AND_A_HALF_BEATS = 3.5;
const THREE_BEAT_TICK = 3;

describe("counter timing helpers", () => {
  it("computes beats per bar from signature", () => {
    // arrange
    const numerator = COMMON_NUMERATOR;
    const denominator = COMMON_DENOMINATOR;
    const compoundNumerator = COMPOUND_NUMERATOR;
    const compoundDenominator = COMPOUND_DENOMINATOR;

    // act
    const quarterTimeResult = computeBeatsPerBar(numerator, denominator);
    const compoundResult = computeBeatsPerBar(
      compoundNumerator,
      compoundDenominator,
    );

    // assert
    expect(quarterTimeResult).toBe(COMMON_NUMERATOR);
    expect(compoundResult).toBe(THREE_AND_A_HALF_BEATS);
  });

  it("builds timing grid from signature", () => {
    // arrange
    // act
    const grid = createTimingGrid(COMMON_NUMERATOR, COMMON_DENOMINATOR);

    // assert
    expect(grid.beatsPerBar).toBe(COMMON_NUMERATOR);
    expect(grid.beatLength).toBe(1);
    expect(grid.sixteenthLength).toBe(FOURTH_SIXTEENTH);
    expect(grid.beatsPerDisplayBar).toBe(COMMON_NUMERATOR);
  });

  it("computes beat in bar using zero-based song beat ticks", () => {
    // arrange
    const beatsPerBar = COMMON_NUMERATOR;
    const songBeatTicks = [0, 1, THREE_BEAT_TICK, COMMON_NUMERATOR];

    // act
    const mappedBeats = songBeatTicks.map((tick) =>
      computeBeatInBar(tick, beatsPerBar),
    );

    // assert
    expect(mappedBeats).toEqual([1, DOUBLE_BAR_COUNT, COMMON_NUMERATOR, 1]);
  });

  it("formats elapsed values as bar:beat:16th", () => {
    // arrange
    const grid = createTimingGrid(COMMON_NUMERATOR, COMMON_DENOMINATOR);

    // act
    const elapsedParts = [
      toElapsedCounterParts(0, grid),
      toElapsedCounterParts(QUARTER_BEAT_EPSILON, grid),
      toElapsedCounterParts(FOURTH_SIXTEENTH, grid),
      toElapsedCounterParts(HALF_BEAT, grid),
      toElapsedCounterParts(LAST_SIXTEENTH, grid),
      toElapsedCounterParts(1, grid),
      toElapsedCounterParts(FULL_BAR, grid),
    ];

    // assert
    expect(elapsedParts.map((parts) => formatCounterParts(parts))).toEqual([
      "1:1:1",
      "1:1:1",
      "1:1:2",
      "1:1:3",
      "1:1:4",
      "1:2:1",
      "2:1:1",
    ]);
  });

  it("formats remaining values with zero endpoint", () => {
    // arrange
    const grid = createTimingGrid(COMMON_NUMERATOR, COMMON_DENOMINATOR);

    // act
    const remainingParts = [
      toRemainingCounterParts(0, grid),
      toRemainingCounterParts(NEAR_FULL_BAR, grid),
      toRemainingCounterParts(FULL_BAR, grid),
    ];

    // assert
    expect(remainingParts.map((parts) => formatCounterParts(parts))).toEqual([
      "0:0:0",
      "1:4:4",
      "2:1:1",
    ]);
  });
});

describe("counter edge cases", () => {
  it("detects loop span validity", () => {
    // arrange
    const validLoopMeta: Parameters<typeof hasValidLoopSpan>[0] = {
      length: COMPOUND_DENOMINATOR,
      loopEnd: FULL_BAR,
      looping: true,
      loopStart: 0,
    };
    const zeroSpanMeta: Parameters<typeof hasValidLoopSpan>[0] = {
      length: COMPOUND_DENOMINATOR,
      loopEnd: DOUBLE_BAR_COUNT,
      looping: true,
      loopStart: DOUBLE_BAR_COUNT,
    };
    const nonLoopingMeta: Parameters<typeof hasValidLoopSpan>[0] = {
      length: COMPOUND_DENOMINATOR,
      loopEnd: FULL_BAR,
      looping: false,
      loopStart: 0,
    };

    // act
    const validLoopResult = hasValidLoopSpan(validLoopMeta);
    const zeroSpanResult = hasValidLoopSpan(zeroSpanMeta);
    const nonLoopingResult = hasValidLoopSpan(nonLoopingMeta);

    // assert
    expect(validLoopResult).toBe(true);
    expect(zeroSpanResult).toBe(false);
    expect(nonLoopingResult).toBe(false);
  });

  it("detects last bar from remaining beats", () => {
    // arrange
    const remainingValues = [
      LAST_SIXTEENTH,
      FULL_BAR,
      NON_LAST_BAR_REMAINDER,
      0,
    ];
    const beatsPerBar = COMMON_NUMERATOR;

    // act
    const results = remainingValues.map((remaining) =>
      computeIsLastBar(remaining, beatsPerBar),
    );

    // assert
    expect(results).toEqual([true, true, false, false]);
  });

  it("falls back to common time when signature inputs are invalid", () => {
    // arrange
    const signatures: [number, number][] = [
      [Number.NaN, 0],
      [SEVEN_EIGHTHS_NUMERATOR, Number.POSITIVE_INFINITY],
      [RARE_METER_FALLBACK, 0],
      [Number.NaN, COMPOUND_DENOMINATOR],
    ];

    // act
    const results = signatures.map(([number_, den]) =>
      computeBeatsPerBar(number_, den),
    );

    // assert
    expect(results).toEqual([
      COMMON_NUMERATOR,
      COMMON_NUMERATOR,
      RARE_METER_FALLBACK,
      DOUBLE_BAR_COUNT,
    ]);
  });

  it("handles defensive clamping branches in musical position conversion", () => {
    // arrange
    const malformedGrid = {
      beatLength: MALFORMED_BEAT_LENGTH,
      beatsPerBar: MALFORMED_BEATS_PER_BAR,
      beatsPerDisplayBar: COMMON_NUMERATOR,
      sixteenthLength: -FOURTH_SIXTEENTH,
    };

    // act
    const parts = toElapsedCounterParts(Number.NaN, malformedGrid);

    // assert
    expect(parts).toEqual({
      bar: 0,
      beat: 1,
      sixteenth: 1,
    });
  });
});
