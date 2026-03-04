export type HudMode = 'elapsed' | 'remaining';

export interface CounterParts {
  bar: number;
  beat: number;
  sixteenth: number;
}

export type LastBarSource = 'loop_end' | 'clip_end' | null;

export interface HudState {
  connected: boolean;
  isPlaying: boolean;
  trackIndex: number | null;
  clipIndex: number | null;
  clipName: string | null;
  mode: HudMode;
  counterText: string;
  counterParts: CounterParts;
  cycleLabel: string | null;
  isLoopingClip: boolean;
  isIntroPhase: boolean;
  lastBarSource: LastBarSource;
  beatInBar: number;
  isDownbeat: boolean;
  isLastBar: boolean;
  beatFlashToken: number;
}

export interface ClipTimingMeta {
  length: number;
  loopStart: number;
  loopEnd: number;
  looping: boolean;
}

export interface TimingGrid {
  beatsPerBar: number;
  beatLength: number;
  sixteenthLength: number;
  beatsPerDisplayBar: number;
}
