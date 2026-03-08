import { z } from "zod";

import type { CounterParts, HudMode, HudState } from "./types";

export const HUD_CHANNELS = {
  getInitialState: "hud:get-initial-state",
  setCompactView: "hud:set-compact-view",
  setMode: "hud:set-mode",
  state: "hud:state",
  toggleTopmost: "hud:toggle-topmost",
  toggleTrackLock: "hud:toggle-track-lock",
} as const;

export const HudModeSchema = z.enum(["elapsed", "remaining"]);
const MAX_COLOR_VALUE = 0xff_ff_ff;
const HudColorSchema = z.number().int().min(0).max(MAX_COLOR_VALUE);
const UndefinedableColorSchema = z.union([HudColorSchema, z.undefined()]);
const UndefinedableLastBarSourceSchema = z.union([
  z.enum(["loop_end", "clip_end"]),
  z.undefined(),
]);
const UndefinedableIntegerSchema = z.union([z.number().int(), z.undefined()]);
const UndefinedableStringSchema = z.union([z.string(), z.undefined()]);

const CounterPartsSchema: z.ZodType<CounterParts> = z.object({
  bar: z.number().int().nonnegative(),
  beat: z.number().int().nonnegative(),
  sixteenth: z.number().int().nonnegative(),
});

export const CompactViewRequestSchema = z.discriminatedUnion("enabled", [
  z.object({
    enabled: z.literal(false),
  }),
  z.object({
    enabled: z.literal(true),
    height: z.number().int().positive(),
    width: z.number().int().positive(),
  }),
]);

export const HudStateSchema: z.ZodType<HudState> = z.object({
  alwaysOnTop: z.boolean(),
  beatFlashToken: z.number().int().nonnegative(),
  beatInBar: z.number().int().positive(),
  clipColor: UndefinedableColorSchema,
  clipIndex: UndefinedableIntegerSchema,
  clipName: UndefinedableStringSchema,
  compactView: z.boolean(),
  connected: z.boolean(),
  counterParts: CounterPartsSchema,
  counterText: z.string(),
  isDownbeat: z.boolean(),
  isLastBar: z.boolean(),
  isPlaying: z.boolean(),
  lastBarSource: UndefinedableLastBarSourceSchema,
  mode: HudModeSchema,
  sceneColor: UndefinedableColorSchema,
  sceneName: UndefinedableStringSchema,
  trackColor: UndefinedableColorSchema,
  trackIndex: UndefinedableIntegerSchema,
  trackLocked: z.boolean(),
  trackName: UndefinedableStringSchema,
});

/**
 * Creates the initial HUD state used before OSC data arrives.
 * @param mode - The initial counter mode.
 * @param alwaysOnTop - Whether the window should start topmost.
 * @param compactView - Whether compact counter-only mode is active.
 * @param trackLocked - Whether track selection starts locked.
 * @returns A fully populated default HUD state.
 */
export function createDefaultHudState(
  mode: HudMode = "elapsed",
  alwaysOnTop = true,
  compactView = false,
  trackLocked = false,
): HudState {
  return {
    alwaysOnTop,
    beatFlashToken: 0,
    beatInBar: 1,
    clipColor: undefined,
    clipIndex: undefined,
    clipName: undefined,
    compactView,
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
    lastBarSource: undefined,
    mode,
    sceneColor: undefined,
    sceneName: undefined,
    trackColor: undefined,
    trackIndex: undefined,
    trackLocked,
    trackName: undefined,
  };
}
