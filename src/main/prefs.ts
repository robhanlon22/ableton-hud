import { app, type Rectangle } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { HudMode } from '../shared/types';

const BoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const PrefsSchema = z.object({
  mode: z.enum(['elapsed', 'remaining']).default('elapsed'),
  alwaysOnTop: z.boolean().default(true),
  windowBounds: BoundsSchema.optional()
});

export interface HudPreferences {
  mode: HudMode;
  alwaysOnTop: boolean;
  windowBounds?: Rectangle;
}

const DEFAULT_PREFS: HudPreferences = {
  mode: 'elapsed',
  alwaysOnTop: true
};

export class PrefStore {
  private readonly path: string;

  constructor() {
    this.path = join(app.getPath('userData'), 'hud-preferences.json');
  }

  async load(): Promise<HudPreferences> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = PrefsSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        return { ...DEFAULT_PREFS };
      }
      return parsed.data;
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  async save(nextPrefs: HudPreferences): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(nextPrefs, null, 2)}\n`, 'utf8');
  }
}
