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
    expect(computeBeatsPerBar(4, 4)).toBe(4);
    expect(computeBeatsPerBar(7, 8)).toBe(3.5);
  });

  it("builds timing grid from signature", () => {
    const grid = createTimingGrid(4, 4);
    expect(grid.beatsPerBar).toBe(4);
    expect(grid.beatLength).toBe(1);
    expect(grid.sixteenthLength).toBe(0.25);
    expect(grid.beatsPerDisplayBar).toBe(4);
  });

  it("computes beat in bar using zero-based song beat ticks", () => {
    expect(computeBeatInBar(0, 4)).toBe(1);
    expect(computeBeatInBar(1, 4)).toBe(2);
    expect(computeBeatInBar(3, 4)).toBe(4);
    expect(computeBeatInBar(4, 4)).toBe(1);
  });

  it("formats elapsed values as bar:beat:16th", () => {
    const grid = createTimingGrid(4, 4);

    expect(formatCounterParts(toElapsedCounterParts(0, grid))).toBe("1:1:1");
    expect(formatCounterParts(toElapsedCounterParts(0.24, grid))).toBe("1:1:1");
    expect(formatCounterParts(toElapsedCounterParts(0.25, grid))).toBe("1:1:2");
    expect(formatCounterParts(toElapsedCounterParts(0.5, grid))).toBe("1:1:3");
    expect(formatCounterParts(toElapsedCounterParts(0.99, grid))).toBe("1:1:4");
    expect(formatCounterParts(toElapsedCounterParts(1, grid))).toBe("1:2:1");
    expect(formatCounterParts(toElapsedCounterParts(4, grid))).toBe("2:1:1");
  });

  it("formats remaining values with zero endpoint", () => {
    const grid = createTimingGrid(4, 4);

    expect(formatCounterParts(toRemainingCounterParts(0, grid))).toBe("0:0:0");
    expect(formatCounterParts(toRemainingCounterParts(3.75, grid))).toBe(
      "1:4:4",
    );
    expect(formatCounterParts(toRemainingCounterParts(4, grid))).toBe("2:1:1");
  });

  it("detects loop span validity", () => {
    expect(
      hasValidLoopSpan({
        length: 8,
        loopEnd: 4,
        looping: true,
        loopStart: 0,
      }),
    ).toBe(true);

    expect(
      hasValidLoopSpan({
        length: 8,
        loopEnd: 2,
        looping: true,
        loopStart: 2,
      }),
    ).toBe(false);

    expect(
      hasValidLoopSpan({
        length: 8,
        loopEnd: 4,
        looping: false,
        loopStart: 0,
      }),
    ).toBe(false);
  });

  it("detects last bar from remaining beats", () => {
    expect(computeIsLastBar(0.99, 4)).toBe(true);
    expect(computeIsLastBar(4, 4)).toBe(true);
    expect(computeIsLastBar(4.1, 4)).toBe(false);
    expect(computeIsLastBar(0, 4)).toBe(false);
  });

  it("falls back to common time when signature inputs are invalid", () => {
    expect(computeBeatsPerBar(Number.NaN, 0)).toBe(4);
    expect(computeBeatsPerBar(-7, Number.POSITIVE_INFINITY)).toBe(4);
    expect(computeBeatsPerBar(5, 0)).toBe(5);
    expect(computeBeatsPerBar(Number.NaN, 8)).toBe(2);
  });

  it("handles defensive clamping branches in musical position conversion", () => {
    const malformedGrid = {
      beatLength: -1,
      beatsPerBar: -4,
      beatsPerDisplayBar: 4,
      sixteenthLength: -0.25,
    };

    expect(toElapsedCounterParts(Number.NaN, malformedGrid)).toEqual({
      bar: 0,
      beat: 1,
      sixteenth: 1,
    });
  });
});
