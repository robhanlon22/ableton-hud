import { app, type Rectangle } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import type { HudMode } from "../shared/types";

const BoundsSchema = z.object({
  height: z.number().int().positive(),
  width: z.number().int().positive(),
  x: z.number().int(),
  y: z.number().int(),
});

const PrefsSchema = z.object({
  alwaysOnTop: z.boolean().default(true),
  mode: z.enum(["elapsed", "remaining"]).default("elapsed"),
  trackLocked: z.boolean().default(false),
  windowBounds: BoundsSchema.optional(),
});

export interface HudPreferences {
  alwaysOnTop: boolean;
  mode: HudMode;
  trackLocked: boolean;
  windowBounds?: Rectangle;
}

const DEFAULT_PREFS: HudPreferences = {
  alwaysOnTop: true,
  mode: "elapsed",
  trackLocked: false,
};

export class PrefStore {
  private readonly path: string;

  constructor() {
    this.path = join(app.getPath("userData"), "hud-preferences.json");
  }

  async load(): Promise<HudPreferences> {
    try {
      const raw = await readFile(this.path, "utf8");
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
    await writeFile(
      this.path,
      `${JSON.stringify(nextPrefs, null, 2)}\n`,
      "utf8",
    );
  }
}
