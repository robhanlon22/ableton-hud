import type {
  ClipTimingMeta,
  CounterParts,
  HudMode,
  HudState,
  LastBarSource,
} from "@shared/types";

import type { BridgeClipReference } from "./ableton-live-bridge-types";

import {
  computeBeatInBar,
  computeIsLastBar,
  createTimingGrid,
  EPSILON,
  formatCounterParts,
  hasValidLoopSpan,
  toElapsedCounterParts,
  toRemainingCounterParts,
} from "./counter";

interface BridgeStateSnapshot {
  activeClip: BridgeClipReference | undefined;
  beatCounter: number;
  beatFlashToken: number;
  clipColor: number | undefined;
  clipMeta: ClipTimingMeta;
  clipName: string | undefined;
  connected: boolean;
  currentPosition: number | undefined;
  isPlaying: boolean;
  launchPosition: number | undefined;
  loopWrapCount: number;
  mode: HudMode;
  sceneColor: number | undefined;
  sceneName: string | undefined;
  selectedTrack: number | undefined;
  signatureDenominator: number;
  signatureNumerator: number;
  trackColor: number | undefined;
  trackLocked: boolean;
  trackName: string | undefined;
}

interface CounterState {
  counterParts: CounterParts;
  isLastBar: boolean;
  lastBarSource: LastBarSource | undefined;
}

interface ElapsedLoopBeatsOptions {
  currentPosition: number;
  hasLoopIntro: boolean;
  inLoopSection: boolean;
  launchPosition: number;
  snapshot: BridgeStateSnapshot;
}

/**
 * Builds the current HUD state snapshot from bridge runtime state.
 * @param snapshot - The current bridge runtime snapshot.
 * @returns The rendered HUD state.
 */
export function buildHudState(snapshot: BridgeStateSnapshot): HudState {
  const sceneColor =
    snapshot.sceneColor === 0 ? undefined : snapshot.sceneColor;
  const timingGrid = createTimingGrid(
    snapshot.signatureNumerator,
    snapshot.signatureDenominator,
  );
  const beatInBar = computeBeatInBar(
    snapshot.beatCounter,
    timingGrid.beatsPerBar,
  );
  const isDownbeat = beatInBar === 1;
  const counterState = resolveCounterState(snapshot, timingGrid.beatsPerBar);

  return {
    alwaysOnTop: false,
    beatFlashToken: snapshot.beatFlashToken,
    beatInBar,
    clipColor: snapshot.clipColor,
    clipIndex: snapshot.activeClip?.clip ?? undefined,
    clipName: snapshot.clipName,
    compactView: false,
    connected: snapshot.connected,
    counterParts: counterState.counterParts,
    counterText: formatCounterParts(counterState.counterParts),
    isDownbeat,
    isLastBar: counterState.isLastBar,
    isPlaying: snapshot.isPlaying,
    lastBarSource: counterState.lastBarSource,
    mode: snapshot.mode,
    sceneColor,
    sceneName: snapshot.sceneName,
    trackColor: snapshot.trackColor,
    trackIndex: snapshot.activeClip?.track ?? snapshot.selectedTrack,
    trackLocked: snapshot.trackLocked,
    trackName: snapshot.trackName,
  };
}

/**
 * Creates zeroed counter parts for initial HUD state.
 * @returns A counter parts object with all fields set to `0`.
 */
function createDefaultCounterParts(): CounterParts {
  return {
    bar: 0,
    beat: 0,
    sixteenth: 0,
  };
}

/**
 * Computes counter display state for the currently active clip.
 * @param snapshot - The current bridge runtime snapshot.
 * @param beatsPerBar - The effective beats-per-bar value.
 * @returns The derived counter state.
 */
function resolveCounterState(
  snapshot: BridgeStateSnapshot,
  beatsPerBar: number,
): CounterState {
  const defaultState: CounterState = {
    counterParts: createDefaultCounterParts(),
    isLastBar: false,
    lastBarSource: undefined,
  };

  if (
    snapshot.activeClip === undefined ||
    snapshot.currentPosition === undefined
  ) {
    return defaultState;
  }

  const timingGrid = createTimingGrid(
    snapshot.signatureNumerator,
    snapshot.signatureDenominator,
  );
  const currentPosition = snapshot.currentPosition;
  const launchPosition = snapshot.launchPosition ?? currentPosition;

  if (hasValidLoopSpan(snapshot.clipMeta)) {
    const snapshotWithPosition = {
      ...snapshot,
      currentPosition,
    };
    return resolveLoopCounterState(
      snapshotWithPosition,
      timingGrid.beatsPerBar,
      launchPosition,
    );
  }

  const remainingToClipEnd = Math.max(
    snapshot.clipMeta.length - currentPosition,
    0,
  );
  const counterParts =
    snapshot.mode === "elapsed"
      ? toElapsedCounterParts(
          Math.max(currentPosition - launchPosition, 0),
          timingGrid,
        )
      : toRemainingCounterParts(remainingToClipEnd, timingGrid);

  return {
    counterParts,
    isLastBar: computeIsLastBar(remainingToClipEnd, beatsPerBar),
    lastBarSource: "clip_end",
  };
}

/**
 * Resolves elapsed loop beats for elapsed-mode display.
 * @param options - The current loop timing inputs and bridge snapshot.
 * @returns The elapsed beat count.
 */
function resolveElapsedLoopBeats(
  options: Readonly<ElapsedLoopBeatsOptions>,
): number {
  const {
    currentPosition,
    hasLoopIntro,
    inLoopSection,
    launchPosition,
    snapshot,
  } = options;
  const isIntroPhase = hasLoopIntro && !inLoopSection;
  const startPosition = isIntroPhase
    ? launchPosition
    : snapshot.clipMeta.loopStart;
  return Math.max(currentPosition - startPosition, 0);
}

/**
 * Computes loop-aware counter state.
 * @param snapshot - The current bridge runtime snapshot.
 * @param beatsPerBar - The effective beats-per-bar value.
 * @param launchPosition - The clip launch position.
 * @returns The loop-aware counter state.
 */
function resolveLoopCounterState(
  snapshot: BridgeStateSnapshot & { currentPosition: number },
  beatsPerBar: number,
  launchPosition: number,
): CounterState {
  const timingGrid = createTimingGrid(
    snapshot.signatureNumerator,
    snapshot.signatureDenominator,
  );
  const currentPosition = snapshot.currentPosition;
  const hasLoopIntro = launchPosition < snapshot.clipMeta.loopStart - EPSILON;
  const inLoopSection =
    snapshot.loopWrapCount > 0 ||
    currentPosition >= snapshot.clipMeta.loopStart - EPSILON;
  const elapsedBeats =
    snapshot.mode === "elapsed"
      ? resolveElapsedLoopBeats({
          currentPosition,
          hasLoopIntro,
          inLoopSection,
          launchPosition,
          snapshot,
        })
      : 0;
  const remainingToLoopEnd = Math.max(
    snapshot.clipMeta.loopEnd - currentPosition,
    0,
  );

  return {
    counterParts:
      snapshot.mode === "elapsed"
        ? toElapsedCounterParts(elapsedBeats, timingGrid)
        : toRemainingCounterParts(remainingToLoopEnd, timingGrid),
    isLastBar: computeIsLastBar(remainingToLoopEnd, beatsPerBar),
    lastBarSource: "loop_end",
  };
}
