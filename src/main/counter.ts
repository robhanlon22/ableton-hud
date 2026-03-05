import type { ClipTimingMeta, CounterParts, TimingGrid } from "../shared/types";

export const EPSILON = 1e-4;

// AbletonOSC beat listener reports integer song-beat ticks starting at 0.
/**
 * Computes the 1-based beat index within the current bar.
 * @param beatCounter - The running beat count reported by Live.
 * @param beatsPerBar - The number of beats in one bar.
 * @returns The beat position in the range `1..beatsPerBar`.
 */
export function computeBeatInBar(
  beatCounter: number,
  beatsPerBar: number,
): number {
  const beats = Math.max(1, Math.round(beatsPerBar));
  const zeroBased = ((beatCounter % beats) + beats) % beats;
  return zeroBased + 1;
}

/**
 * Computes beats per bar from a time signature.
 * @param signatureNumerator - The time signature numerator.
 * @param signatureDenominator - The time signature denominator.
 * @returns The number of quarter-note beats per bar.
 */
export function computeBeatsPerBar(
  signatureNumerator: number,
  signatureDenominator: number,
): number {
  const numerator =
    Number.isFinite(signatureNumerator) && signatureNumerator > 0
      ? signatureNumerator
      : 4;
  const denominator =
    Number.isFinite(signatureDenominator) && signatureDenominator > 0
      ? signatureDenominator
      : 4;
  return (numerator * 4) / denominator;
}

/**
 * Determines whether the remaining beats fit within a single bar.
 * @param remainingBeats - The remaining clip length in beats.
 * @param beatsPerBar - The number of beats in one bar.
 * @returns `true` when the remaining duration is in the final bar.
 */
export function computeIsLastBar(
  remainingBeats: number,
  beatsPerBar: number,
): boolean {
  return remainingBeats > EPSILON && remainingBeats <= beatsPerBar + EPSILON;
}

/**
 * Builds a timing grid derived from a time signature.
 * @param signatureNumerator - The time signature numerator.
 * @param signatureDenominator - The time signature denominator.
 * @returns The normalized timing grid used for counter calculations.
 */
export function createTimingGrid(
  signatureNumerator: number,
  signatureDenominator: number,
): TimingGrid {
  const beatsPerBar = computeBeatsPerBar(
    signatureNumerator,
    signatureDenominator,
  );
  const beatsPerDisplayBar = Math.max(1, Math.round(signatureNumerator));
  const beatLength = beatsPerBar / beatsPerDisplayBar;

  return {
    beatLength,
    beatsPerBar,
    beatsPerDisplayBar,
    sixteenthLength: beatLength / 4,
  };
}

/**
 * Formats split counter parts as `bar:beat:sixteenth`.
 * @param parts - The counter parts to format.
 * @returns The display-ready counter string.
 */
export function formatCounterParts(parts: CounterParts): string {
  return [parts.bar, parts.beat, parts.sixteenth].join(":");
}

/**
 * Checks whether a clip has a valid active loop span.
 * @param clipMeta - The clip timing metadata from Live.
 * @returns `true` if looping is enabled and loop end is after loop start.
 */
export function hasValidLoopSpan(clipMeta: ClipTimingMeta): boolean {
  return clipMeta.looping && clipMeta.loopEnd > clipMeta.loopStart + EPSILON;
}

/**
 * Converts elapsed beats to bar/beat/sixteenth parts.
 * @param elapsedBeats - Elapsed beats since the clip start.
 * @param timingGrid - The timing grid used for conversion.
 * @returns Counter parts for the elapsed position.
 */
export function toElapsedCounterParts(
  elapsedBeats: number,
  timingGrid: TimingGrid,
): CounterParts {
  return toMusicalPositionParts(elapsedBeats, timingGrid);
}

/**
 * Converts remaining beats to bar/beat/sixteenth parts.
 * @param remainingBeats - Remaining beats until the clip end.
 * @param timingGrid - The timing grid used for conversion.
 * @returns Counter parts for the remaining position.
 */
export function toRemainingCounterParts(
  remainingBeats: number,
  timingGrid: TimingGrid,
): CounterParts {
  if (remainingBeats <= EPSILON) {
    return {
      bar: 0,
      beat: 0,
      sixteenth: 0,
    };
  }

  return toMusicalPositionParts(remainingBeats, timingGrid);
}

/**
 * Converts a beat position to bar/beat/sixteenth parts.
 * @param totalBeats - The absolute beat position to convert.
 * @param timingGrid - The timing grid used for conversion.
 * @returns Counter parts normalized to display-friendly values.
 */
function toMusicalPositionParts(
  totalBeats: number,
  timingGrid: TimingGrid,
): CounterParts {
  const safeBeats = Number.isFinite(totalBeats) ? Math.max(0, totalBeats) : 0;

  const barIndex = Math.floor((safeBeats + EPSILON) / timingGrid.beatsPerBar);
  let withinBar = safeBeats - barIndex * timingGrid.beatsPerBar;
  if (withinBar < 0) {
    withinBar = 0;
  }

  const beatIndex = Math.floor((withinBar + EPSILON) / timingGrid.beatLength);
  const clampedBeatIndex = Math.min(
    Math.max(0, beatIndex),
    timingGrid.beatsPerDisplayBar - 1,
  );

  const withinBeat = withinBar - clampedBeatIndex * timingGrid.beatLength;

  const sixteenthIndex = Math.floor(
    (withinBeat + EPSILON) / timingGrid.sixteenthLength,
  );
  const clampedSixteenthIndex = Math.min(Math.max(0, sixteenthIndex), 3);

  return {
    bar: barIndex + 1,
    beat: clampedBeatIndex + 1,
    sixteenth: clampedSixteenthIndex + 1,
  };
}
