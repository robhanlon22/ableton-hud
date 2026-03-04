import { z } from "zod";

import type { CounterParts, HudMode, HudState } from "./types";

export const HUD_CHANNELS = {
  getInitialState: "hud:get-initial-state",
  setMode: "hud:set-mode",
  state: "hud:state",
  toggleTopmost: "hud:toggle-topmost",
} as const;

export const HudModeSchema = z.enum(["elapsed", "remaining"]);

const CounterPartsSchema: z.ZodType<CounterParts> = z.object({
  bar: z.number().int().nonnegative(),
  beat: z.number().int().nonnegative(),
  sixteenth: z.number().int().nonnegative(),
});

export const HudStateSchema: z.ZodType<HudState> = z.object({
  alwaysOnTop: z.boolean(),
  beatFlashToken: z.number().int().nonnegative(),
  beatInBar: z.number().int().positive(),
  clipColor: z.number().int().min(0).max(0xffffff).nullable(),
  clipIndex: z.number().int().nullable(),
  clipName: z.string().nullable(),
  connected: z.boolean(),
  counterParts: CounterPartsSchema,
  counterText: z.string(),
  isDownbeat: z.boolean(),
  isLastBar: z.boolean(),
  isPlaying: z.boolean(),
  lastBarSource: z.enum(["loop_end", "clip_end"]).nullable(),
  mode: HudModeSchema,
  sceneColor: z.number().int().min(0).max(0xffffff).nullable(),
  sceneName: z.string().nullable(),
  trackColor: z.number().int().min(0).max(0xffffff).nullable(),
  trackIndex: z.number().int().nullable(),
  trackName: z.string().nullable(),
});

/**
 * Creates the initial HUD state used before OSC data arrives.
 * @param mode - The initial counter mode.
 * @param alwaysOnTop - Whether the window should start topmost.
 * @returns A fully populated default HUD state.
 */
export function createDefaultHudState(
  mode: HudMode = "elapsed",
  alwaysOnTop = false,
): HudState {
  return {
    alwaysOnTop,
    beatFlashToken: 0,
    beatInBar: 1,
    clipColor: null,
    clipIndex: null,
    clipName: null,
    connected: false,
    counterParts: {
      bar: 0,
      beat: 0,
      sixteenth: 0,
    },
    counterText: "0:0:0",
    isDownbeat: true,
    isLastBar: false,
    isPlaying: false,
    lastBarSource: null,
    mode,
    sceneColor: null,
    sceneName: null,
    trackColor: null,
    trackIndex: null,
    trackName: null,
  };
}
