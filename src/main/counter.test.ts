import { describe, expect, it } from 'vitest';
import {
  computeBeatInBar,
  computeBeatsPerBar,
  computeIsLastBar,
  computeRemainingBeats,
  createElapsedAccumulator,
  updateElapsedAccumulator
} from './counter';
import type { ClipTimingMeta } from '../shared/types';

const loopClip: ClipTimingMeta = {
  length: 8,
  loopStart: 0,
  loopEnd: 4,
  looping: true
};

describe('counter', () => {
  it('computes beats per bar from signature', () => {
    expect(computeBeatsPerBar(4, 4)).toBe(4);
    expect(computeBeatsPerBar(7, 8)).toBe(3.5);
  });

  it('tracks elapsed beats across normal increments', () => {
    let acc = createElapsedAccumulator();
    acc = updateElapsedAccumulator(acc, 0, loopClip);
    acc = updateElapsedAccumulator(acc, 1, loopClip);
    acc = updateElapsedAccumulator(acc, 2.5, loopClip);
    expect(acc.elapsedBeats).toBeCloseTo(2.5, 5);
  });

  it('tracks elapsed beats across loop wrap', () => {
    let acc = createElapsedAccumulator();
    acc = updateElapsedAccumulator(acc, 3.75, loopClip);
    acc = updateElapsedAccumulator(acc, 0.25, loopClip);
    expect(acc.elapsedBeats).toBeCloseTo(0.5, 5);
  });

  it('resets elapsed beats on relaunch-like jump', () => {
    const nonLoopClip: ClipTimingMeta = {
      length: 8,
      loopStart: 0,
      loopEnd: 8,
      looping: false
    };

    let acc = createElapsedAccumulator();
    acc = updateElapsedAccumulator(acc, 3, nonLoopClip);
    acc = updateElapsedAccumulator(acc, 4, nonLoopClip);
    acc = updateElapsedAccumulator(acc, 0.1, nonLoopClip);
    expect(acc.elapsedBeats).toBeCloseTo(0, 5);
  });

  it('computes remaining beats for looping and one-shot clips', () => {
    expect(computeRemainingBeats(2.25, loopClip)).toBeCloseTo(1.75, 5);

    const oneShot: ClipTimingMeta = {
      length: 8,
      loopStart: 0,
      loopEnd: 8,
      looping: false
    };
    expect(computeRemainingBeats(7.25, oneShot)).toBeCloseTo(0.75, 5);
  });

  it('computes beat in bar using AbletonOSC beat counter semantics', () => {
    expect(computeBeatInBar(1, 4)).toBe(1);
    expect(computeBeatInBar(4, 4)).toBe(4);
    expect(computeBeatInBar(5, 4)).toBe(1);
  });

  it('detects last bar threshold', () => {
    expect(computeIsLastBar(0.99)).toBe(true);
    expect(computeIsLastBar(1.0)).toBe(true);
    expect(computeIsLastBar(1.01)).toBe(false);
    expect(computeIsLastBar(0)).toBe(false);
  });
});
