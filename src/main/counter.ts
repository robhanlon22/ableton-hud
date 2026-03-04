import type { ClipTimingMeta, CounterParts, TimingGrid } from '../shared/types';

export const EPSILON = 1e-4;

export function computeBeatsPerBar(
  signatureNumerator: number,
  signatureDenominator: number
): number {
  const numerator = Number.isFinite(signatureNumerator) && signatureNumerator > 0 ? signatureNumerator : 4;
  const denominator = Number.isFinite(signatureDenominator) && signatureDenominator > 0 ? signatureDenominator : 4;
  return (numerator * 4) / denominator;
}

export function createTimingGrid(
  signatureNumerator: number,
  signatureDenominator: number
): TimingGrid {
  const beatsPerBar = computeBeatsPerBar(signatureNumerator, signatureDenominator);
  const beatsPerDisplayBar = Math.max(1, Math.round(signatureNumerator));
  const beatLength = beatsPerBar / beatsPerDisplayBar;

  return {
    beatsPerBar,
    beatLength,
    sixteenthLength: beatLength / 4,
    beatsPerDisplayBar
  };
}

// AbletonOSC beat listener reports integer song-beat ticks starting at 0.
export function computeBeatInBar(beatCounter: number, beatsPerBar: number): number {
  const beats = Math.max(1, Math.round(beatsPerBar));
  const zeroBased = ((beatCounter % beats) + beats) % beats;
  return zeroBased + 1;
}

export function hasValidLoopSpan(clipMeta: ClipTimingMeta): boolean {
  return clipMeta.looping && clipMeta.loopEnd > clipMeta.loopStart + EPSILON;
}

export function computeIsLastBar(remainingBeats: number, beatsPerBar: number): boolean {
  return remainingBeats > EPSILON && remainingBeats <= beatsPerBar + EPSILON;
}

function toMusicalPositionParts(totalBeats: number, timingGrid: TimingGrid): CounterParts {
  const safeBeats = Number.isFinite(totalBeats) ? Math.max(0, totalBeats) : 0;

  const barIndex = Math.floor((safeBeats + EPSILON) / timingGrid.beatsPerBar);
  let withinBar = safeBeats - barIndex * timingGrid.beatsPerBar;
  if (withinBar < 0) {
    withinBar = 0;
  }

  const beatIndex = Math.floor((withinBar + EPSILON) / timingGrid.beatLength);
  const clampedBeatIndex = Math.min(Math.max(0, beatIndex), timingGrid.beatsPerDisplayBar - 1);

  let withinBeat = withinBar - clampedBeatIndex * timingGrid.beatLength;
  if (withinBeat < 0) {
    withinBeat = 0;
  }

  const sixteenthIndex = Math.floor((withinBeat + EPSILON) / timingGrid.sixteenthLength);
  const clampedSixteenthIndex = Math.min(Math.max(0, sixteenthIndex), 3);

  return {
    bar: barIndex + 1,
    beat: clampedBeatIndex + 1,
    sixteenth: clampedSixteenthIndex + 1
  };
}

export function toElapsedCounterParts(elapsedBeats: number, timingGrid: TimingGrid): CounterParts {
  return toMusicalPositionParts(elapsedBeats, timingGrid);
}

export function toRemainingCounterParts(remainingBeats: number, timingGrid: TimingGrid): CounterParts {
  if (remainingBeats <= EPSILON) {
    return {
      bar: 0,
      beat: 0,
      sixteenth: 0
    };
  }

  return toMusicalPositionParts(remainingBeats, timingGrid);
}

export function formatCounterParts(parts: CounterParts): string {
  return `${parts.bar}:${parts.beat}:${parts.sixteenth}`;
}
