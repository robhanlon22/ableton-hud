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

describe("counter", () => {
  it("computes beats per bar from signature", () => {
    // arrange
    const numerator = 4;
    const denominator = 4;
    const compoundNumerator = 7;
    const compoundDenominator = 8;

    // act
    const quarterTimeResult = computeBeatsPerBar(numerator, denominator);
    const compoundResult = computeBeatsPerBar(
      compoundNumerator,
      compoundDenominator,
    );

    // assert
    expect(quarterTimeResult).toBe(4);
    expect(compoundResult).toBe(3.5);
  });

  it("builds timing grid from signature", () => {
    // arrange
    // act
    const grid = createTimingGrid(4, 4);
    // assert
    expect(grid.beatsPerBar).toBe(4);
    expect(grid.beatLength).toBe(1);
    expect(grid.sixteenthLength).toBe(0.25);
    expect(grid.beatsPerDisplayBar).toBe(4);
  });

  it("computes beat in bar using zero-based song beat ticks", () => {
    // arrange
    const beatsPerBar = 4;
    const songBeatTicks = [0, 1, 3, 4];

    // act
    const mappedBeats = songBeatTicks.map((tick) =>
      computeBeatInBar(tick, beatsPerBar),
    );

    // assert
    expect(mappedBeats).toEqual([1, 2, 4, 1]);
  });

  it("formats elapsed values as bar:beat:16th", () => {
    // arrange
    // act
    const grid = createTimingGrid(4, 4);

    // assert
    expect(formatCounterParts(toElapsedCounterParts(0, grid))).toBe("1:1:1");
    expect(formatCounterParts(toElapsedCounterParts(0.24, grid))).toBe("1:1:1");
    expect(formatCounterParts(toElapsedCounterParts(0.25, grid))).toBe("1:1:2");
    expect(formatCounterParts(toElapsedCounterParts(0.5, grid))).toBe("1:1:3");
    expect(formatCounterParts(toElapsedCounterParts(0.99, grid))).toBe("1:1:4");
    expect(formatCounterParts(toElapsedCounterParts(1, grid))).toBe("1:2:1");
    expect(formatCounterParts(toElapsedCounterParts(4, grid))).toBe("2:1:1");
  });

  it("formats remaining values with zero endpoint", () => {
    // arrange
    // act
    const grid = createTimingGrid(4, 4);

    // assert
    expect(formatCounterParts(toRemainingCounterParts(0, grid))).toBe("0:0:0");
    expect(formatCounterParts(toRemainingCounterParts(3.75, grid))).toBe(
      "1:4:4",
    );
    expect(formatCounterParts(toRemainingCounterParts(4, grid))).toBe("2:1:1");
  });

  it("detects loop span validity", () => {
    // arrange
    const validLoopMeta: Parameters<typeof hasValidLoopSpan>[0] = {
      length: 8,
      loopEnd: 4,
      looping: true,
      loopStart: 0,
    };
    const zeroSpanMeta: Parameters<typeof hasValidLoopSpan>[0] = {
      length: 8,
      loopEnd: 2,
      looping: true,
      loopStart: 2,
    };
    const nonLoopingMeta: Parameters<typeof hasValidLoopSpan>[0] = {
      length: 8,
      loopEnd: 4,
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
    const remainingValues = [0.99, 4, 4.1, 0];
    const beatsPerBar = 4;

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
      [-7, Number.POSITIVE_INFINITY],
      [5, 0],
      [Number.NaN, 8],
    ];

    // act
    const results = signatures.map(([num, den]) =>
      computeBeatsPerBar(num, den),
    );

    // assert
    expect(results).toEqual([4, 4, 5, 2]);
  });

  it("handles defensive clamping branches in musical position conversion", () => {
    // arrange
    const malformedGrid = {
      beatLength: -1,
      beatsPerBar: -4,
      beatsPerDisplayBar: 4,
      sixteenthLength: -0.25,
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
