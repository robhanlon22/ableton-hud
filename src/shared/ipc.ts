import { z } from 'zod';
import type { CounterParts, HudMode, HudState } from './types';

export const HUD_CHANNELS = {
  state: 'hud:state',
  setMode: 'hud:set-mode',
  toggleTopmost: 'hud:toggle-topmost',
  getInitialState: 'hud:get-initial-state'
} as const;

export const HudModeSchema = z.enum(['elapsed', 'remaining']);

const CounterPartsSchema: z.ZodType<CounterParts> = z.object({
  bar: z.number().int().nonnegative(),
  beat: z.number().int().nonnegative(),
  sixteenth: z.number().int().nonnegative()
});

export const HudStateSchema: z.ZodType<HudState> = z.object({
  connected: z.boolean(),
  isPlaying: z.boolean(),
  trackIndex: z.number().int().nullable(),
  trackName: z.string().nullable(),
  trackColor: z.number().int().min(0).max(0xffffff).nullable(),
  clipIndex: z.number().int().nullable(),
  clipName: z.string().nullable(),
  clipColor: z.number().int().min(0).max(0xffffff).nullable(),
  sceneName: z.string().nullable(),
  sceneColor: z.number().int().min(0).max(0xffffff).nullable(),
  alwaysOnTop: z.boolean(),
  mode: HudModeSchema,
  counterText: z.string(),
  counterParts: CounterPartsSchema,
  lastBarSource: z.enum(['loop_end', 'clip_end']).nullable(),
  beatInBar: z.number().int().positive(),
  isDownbeat: z.boolean(),
  isLastBar: z.boolean(),
  beatFlashToken: z.number().int().nonnegative()
});

export function createDefaultHudState(mode: HudMode = 'elapsed', alwaysOnTop = false): HudState {
  return {
    connected: false,
    isPlaying: false,
    trackIndex: null,
    trackName: null,
    trackColor: null,
    clipIndex: null,
    clipName: null,
    clipColor: null,
    sceneName: null,
    sceneColor: null,
    alwaysOnTop,
    mode,
    counterText: '0:0:0',
    counterParts: {
      bar: 0,
      beat: 0,
      sixteenth: 0
    },
    lastBarSource: null,
    beatInBar: 1,
    isDownbeat: true,
    isLastBar: false,
    beatFlashToken: 0
  };
}
