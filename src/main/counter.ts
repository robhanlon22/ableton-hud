import type { ClipTimingMeta, ElapsedAccumulator } from '../shared/types';

const EPSILON = 1e-4;

export function computeBeatsPerBar(
  signatureNumerator: number,
  signatureDenominator: number
): number {
  const numerator = Number.isFinite(signatureNumerator) && signatureNumerator > 0 ? signatureNumerator : 4;
  const denominator = Number.isFinite(signatureDenominator) && signatureDenominator > 0 ? signatureDenominator : 4;
  return (numerator * 4) / denominator;
}

export function createElapsedAccumulator(): ElapsedAccumulator {
  return {
    prevPosition: null,
    elapsedBeats: 0
  };
}

export function updateElapsedAccumulator(
  accumulator: ElapsedAccumulator,
  currentPosition: number,
  clipMeta: ClipTimingMeta
): ElapsedAccumulator {
  if (accumulator.prevPosition === null) {
    return {
      prevPosition: currentPosition,
      elapsedBeats: 0
    };
  }

  let elapsedBeats = accumulator.elapsedBeats;
  const delta = currentPosition - accumulator.prevPosition;

  if (delta >= -EPSILON) {
    elapsedBeats += Math.max(delta, 0);
  } else {
    const loopSpan = clipMeta.loopEnd - clipMeta.loopStart;
    if (clipMeta.looping && loopSpan > EPSILON) {
      const wrappedDelta = currentPosition + loopSpan - accumulator.prevPosition;
      if (wrappedDelta >= -EPSILON && wrappedDelta <= loopSpan + 4) {
        elapsedBeats += Math.max(wrappedDelta, 0);
      } else {
        // Relaunch or non-loop jump: restart elapsed count.
        elapsedBeats = 0;
      }
    } else {
      elapsedBeats = 0;
    }
  }

  return {
    prevPosition: currentPosition,
    elapsedBeats
  };
}

export function computeRemainingBeats(position: number, clipMeta: ClipTimingMeta): number {
  if (clipMeta.looping && clipMeta.loopEnd > clipMeta.loopStart + EPSILON) {
    const remainingLoop = clipMeta.loopEnd - position;
    return Math.max(remainingLoop, 0);
  }

  return Math.max(clipMeta.length - position, 0);
}

export function computeBeatInBar(beatCounter: number, beatsPerBar: number): number {
  const beats = Math.max(1, Math.round(beatsPerBar));
  const zeroBased = ((beatCounter - 1) % beats + beats) % beats;
  return zeroBased + 1;
}

export function computeIsLastBar(remainingBars: number): boolean {
  return remainingBars > 0 && remainingBars <= 1;
}
