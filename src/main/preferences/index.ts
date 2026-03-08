import type { HudMode } from "@shared/types";

import { app, type Rectangle } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const BoundsSchema = z.object({
  height: z.number().int().positive(),
  width: z.number().int().positive(),
  x: z.number().int(),
  y: z.number().int(),
});

const PrefsSchema = z.object({
  alwaysOnTop: z.boolean().default(true),
  compactMode: z.boolean().default(false),
  mode: z.enum(["elapsed", "remaining"]).default("elapsed"),
  trackLocked: z.boolean().default(false),
  windowBounds: BoundsSchema.optional(),
});

export interface HudPreferences {
  alwaysOnTop: boolean;
  compactMode: boolean;
  mode: HudMode;
  trackLocked: boolean;
  windowBounds?: Rectangle;
}

const DEFAULT_PREFS: HudPreferences = {
  alwaysOnTop: true,
  compactMode: false,
  mode: "elapsed",
  trackLocked: false,
};
const JSON_INDENT_SPACES = 2;

export class PrefStore {
  private readonly path: string;

  constructor() {
    const endToEndUserDataPath = process.env.AOSC_E2E_USER_DATA;
    const basePath = endToEndUserDataPath ?? app.getPath("userData");
    this.path = path.join(basePath, "hud-preferences.json");
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
    await mkdir(path.dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      `${JSON.stringify(nextPrefs, undefined, JSON_INDENT_SPACES)}\n`,
      "utf8",
    );
  }
}
