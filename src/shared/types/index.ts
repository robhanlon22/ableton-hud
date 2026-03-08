// Keeps this contract module concrete for runtime tooling and coverage.
export const SHARED_TYPES_MODULE = true;

/**
 * Describes the loop span and playback metadata for the active clip.
 */
export interface ClipTimingMeta {
  /** Total clip length in beats. */
  length: number;
  /** Loop end position in beats. */
  loopEnd: number;
  /** Whether the clip is currently looping. */
  looping: boolean;
  /** Loop start position in beats. */
  loopStart: number;
}

/**
 * Breaks a musical position into bar, beat, and sixteenth counters.
 */
export interface CounterParts {
  /** One-based bar index. */
  bar: number;
  /** One-based beat index within the current bar. */
  beat: number;
  /** One-based sixteenth index within the current beat. */
  sixteenth: number;
}

/**
 * Selects whether the HUD shows elapsed or remaining musical time.
 */
export type HudMode = "elapsed" | "remaining";

/**
 * Represents the validated HUD state shared across Electron processes.
 */
export interface HudState {
  /** Whether the window is currently always-on-top. */
  alwaysOnTop: boolean;
  /** Token used to retrigger beat-flash animations. */
  beatFlashToken: number;
  /** Current beat index within the bar. */
  beatInBar: number;
  /** Optional color assigned to the active clip. */
  clipColor: number | undefined;
  /** Optional index of the active clip slot. */
  clipIndex: number | undefined;
  /** Optional name of the active clip. */
  clipName: string | undefined;
  /** Whether the renderer is currently in compact mode. */
  compactView: boolean;
  /** Whether the bridge is connected to Ableton Live. */
  connected: boolean;
  /** Structured musical counter components. */
  counterParts: CounterParts;
  /** Human-readable counter text shown in the HUD. */
  counterText: string;
  /** Whether the current beat is the downbeat. */
  isDownbeat: boolean;
  /** Whether the counter is currently in its last visible bar. */
  isLastBar: boolean;
  /** Whether Ableton Live is currently playing. */
  isPlaying: boolean;
  /** Why the HUD is currently marking the last bar. */
  lastBarSource: LastBarSource;
  /** Current counter mode. */
  mode: HudMode;
  /** Optional color assigned to the active scene. */
  sceneColor: number | undefined;
  /** Optional name of the active scene. */
  sceneName: string | undefined;
  /** Optional color assigned to the selected track. */
  trackColor: number | undefined;
  /** Optional zero-based selected track index. */
  trackIndex: number | undefined;
  /** Whether track selection is locked. */
  trackLocked: boolean;
  /** Optional name of the selected track. */
  trackName: string | undefined;
}

/**
 * Identifies why the HUD is currently marking the last bar.
 */
export type LastBarSource = "clip_end" | "loop_end" | undefined;

/**
 * Describes the derived beat grid used for elapsed and remaining counters.
 */
export interface TimingGrid {
  /** Length of a beat in seconds. */
  beatLength: number;
  /** Number of beats in a musical bar. */
  beatsPerBar: number;
  /** Number of beats shown in one display bar. */
  beatsPerDisplayBar: number;
  /** Length of a sixteenth note in seconds. */
  sixteenthLength: number;
}
