import type {
  ClipTimingMeta,
  CounterParts,
  HudMode,
  HudState,
  LastBarSource,
  TimingGrid,
} from "@shared/types";

import {
  computeBeatInBar,
  computeIsLastBar,
  createTimingGrid,
  EPSILON,
  formatCounterParts,
  hasValidLoopSpan,
  toElapsedCounterParts,
  toRemainingCounterParts,
} from "@main/counter";

import type { BridgeClipReference } from "./types";

/**
 * Immutable bridge fields needed to derive the current HUD state.
 */
interface BridgeStateSnapshot {
  /**
   * Currently active clip reference, when one is selected and playing.
   */
  activeClip: BridgeClipReference | undefined;
  /**
   * One-based beat counter tracked by the bridge runtime.
   */
  beatCounter: number;
  /**
   * Monotonic token used to trigger beat-flash animations.
   */
  beatFlashToken: number;
  /**
   * Active clip color currently shown in the HUD.
   */
  clipColor: number | undefined;
  /**
   * Loop and length metadata for the active clip.
   */
  clipMeta: ClipTimingMeta;
  /**
   * Active clip name currently shown in the HUD.
   */
  clipName: string | undefined;
  /**
   * Whether the bridge is connected to Ableton Live.
   */
  connected: boolean;
  /**
   * Current playback position reported by Live in beats.
   */
  currentPosition: number | undefined;
  /**
   * Whether Live is currently playing.
   */
  isPlaying: boolean;
  /**
   * Playback position at clip launch time, when known.
   */
  launchPosition: number | undefined;
  /**
   * Number of detected loop wraps since the clip started.
   */
  loopWrapCount: number;
  /**
   * Counter mode currently selected for the HUD.
   */
  mode: HudMode;
  /**
   * Active scene color currently shown in the HUD.
   */
  sceneColor: number | undefined;
  /**
   * Active scene name currently shown in the HUD.
   */
  sceneName: string | undefined;
  /**
   * Currently selected track index, when one is available.
   */
  selectedTrack: number | undefined;
  /**
   * Live time-signature denominator.
   */
  signatureDenominator: number;
  /**
   * Live time-signature numerator.
   */
  signatureNumerator: number;
  /**
   * Selected-track color currently shown in the HUD.
   */
  trackColor: number | undefined;
  /**
   * Whether track selection is pinned instead of following Live.
   */
  trackLocked: boolean;
  /**
   * Selected-track name currently shown in the HUD.
   */
  trackName: string | undefined;
}

/**
 * Counter rendering state derived from the bridge snapshot.
 */
interface CounterState {
  /**
   * Formatted bar/beat/sixteenth counter parts.
   */
  counterParts: CounterParts;
  /**
   * Whether the transport is currently within the final bar of the target span.
   */
  isLastBar: boolean;
  /**
   * Source used to determine last-bar status.
   */
  lastBarSource: LastBarSource | undefined;
}

/**
 * Inputs required to compute elapsed beats in a loop-aware clip.
 */
interface ElapsedLoopBeatsOptions {
  /**
   * Current playback position in beats.
   */
  currentPosition: number;
  /**
   * Whether playback started before the loop start point.
   */
  hasLoopIntro: boolean;
  /**
   * Whether playback has entered the looped section.
   */
  inLoopSection: boolean;
  /**
   * Playback position at clip launch time.
   */
  launchPosition: number;
  /**
   * Bridge snapshot used to resolve loop boundaries.
   */
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
  const counterState = resolveCounterState(snapshot, timingGrid);

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
 * @param timingGrid - The effective timing grid for the current signature.
 * @returns The derived counter state.
 */
function resolveCounterState(
  snapshot: BridgeStateSnapshot,
  timingGrid: TimingGrid,
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

  const currentPosition = snapshot.currentPosition;
  const launchPosition = snapshot.launchPosition ?? currentPosition;

  if (hasValidLoopSpan(snapshot.clipMeta)) {
    const snapshotWithPosition = {
      ...snapshot,
      currentPosition,
    };
    return resolveLoopCounterState(
      snapshotWithPosition,
      timingGrid,
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
    isLastBar: computeIsLastBar(remainingToClipEnd, timingGrid.beatsPerBar),
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
 * @param timingGrid - The effective timing grid for the current signature.
 * @param launchPosition - The clip launch position.
 * @returns The loop-aware counter state.
 */
function resolveLoopCounterState(
  snapshot: BridgeStateSnapshot & {
    /**
     *
     */
    currentPosition: number;
  },
  timingGrid: TimingGrid,
  launchPosition: number,
): CounterState {
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
    isLastBar: computeIsLastBar(remainingToLoopEnd, timingGrid.beatsPerBar),
    lastBarSource: "loop_end",
  };
}
