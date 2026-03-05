import { describe, expect, it } from "vitest";

import { createDefaultHudState } from "../../../shared/ipc";
import { flashDuration } from "./hud-timing";

describe("flashDuration", () => {
  it("returns longest flash for last-bar downbeats", () => {
    expect(
      flashDuration({
        ...createDefaultHudState("elapsed", false),
        isDownbeat: true,
        isLastBar: true,
      }),
    ).toBe(320);
  });

  it("returns medium flash when either downbeat or last-bar is true", () => {
    expect(
      flashDuration({
        ...createDefaultHudState("elapsed", false),
        isDownbeat: true,
        isLastBar: false,
      }),
    ).toBe(230);
    expect(
      flashDuration({
        ...createDefaultHudState("elapsed", false),
        isDownbeat: false,
        isLastBar: true,
      }),
    ).toBe(230);
  });

  it("returns shortest flash during regular beats", () => {
    expect(
      flashDuration({
        ...createDefaultHudState("elapsed", false),
        isDownbeat: false,
        isLastBar: false,
      }),
    ).toBe(150);
  });
});
