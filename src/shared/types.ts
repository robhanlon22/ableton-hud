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
  clipColor: null | number;
  clipIndex: null | number;
  clipName: null | string;
  connected: boolean;
  counterParts: CounterParts;
  counterText: string;
  isDownbeat: boolean;
  isLastBar: boolean;
  isPlaying: boolean;
  lastBarSource: LastBarSource;
  mode: HudMode;
  sceneColor: null | number;
  sceneName: null | string;
  trackColor: null | number;
  trackIndex: null | number;
  trackLocked: boolean;
  trackName: null | string;
}

export type LastBarSource = "clip_end" | "loop_end" | null;

export interface TimingGrid {
  beatLength: number;
  beatsPerBar: number;
  beatsPerDisplayBar: number;
  sixteenthLength: number;
}
