export type HudMode = 'elapsed' | 'remaining';

export interface HudState {
  connected: boolean;
  isPlaying: boolean;
  trackIndex: number | null;
  clipIndex: number | null;
  clipName: string | null;
  mode: HudMode;
  barsValue: number;
  beatInBar: number;
  isLastBar: boolean;
  beatFlashToken: number;
}

export interface ClipTimingMeta {
  length: number;
  loopStart: number;
  loopEnd: number;
  looping: boolean;
}

export interface ElapsedAccumulator {
  prevPosition: number | null;
  elapsedBeats: number;
}
