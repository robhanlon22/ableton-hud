// Keeps this contract module concrete for runtime tooling and coverage.
export const SHARED_TYPES_MODULE = true;

export interface ClipTimingMeta {
  length: number;
  loopEnd: number;
  looping: boolean;
  loopStart: number;
}

export interface CounterParts {
  bar: number;
  beat: number;
  sixteenth: number;
}

export type HudMode = "elapsed" | "remaining";

export interface HudState {
  alwaysOnTop: boolean;
  beatFlashToken: number;
  beatInBar: number;
  clipColor: number | undefined;
  clipIndex: number | undefined;
  clipName: string | undefined;
  compactView: boolean;
  connected: boolean;
  counterParts: CounterParts;
  counterText: string;
  isDownbeat: boolean;
  isLastBar: boolean;
  isPlaying: boolean;
  lastBarSource: LastBarSource;
  mode: HudMode;
  sceneColor: number | undefined;
  sceneName: string | undefined;
  trackColor: number | undefined;
  trackIndex: number | undefined;
  trackLocked: boolean;
  trackName: string | undefined;
}

export type LastBarSource = "clip_end" | "loop_end" | undefined;

export interface TimingGrid {
  beatLength: number;
  beatsPerBar: number;
  beatsPerDisplayBar: number;
  sixteenthLength: number;
}
