import { createDefaultHudState } from "@shared/ipc";
import { describe, expect, it } from "vitest";

import {
  DOWNBEAT_LAST_BAR_FLASH_MS,
  EMPHASIZED_FLASH_MS,
  flashDuration,
  STANDARD_FLASH_MS,
} from "../timing";

describe("flashDuration", () => {
  it("returns longest flash for last-bar downbeats", () => {
    // arrange
    const state = {
      ...createDefaultHudState("elapsed", false),
      isDownbeat: true,
      isLastBar: true,
    };

    // act
    const duration = flashDuration(state);

    // assert
    expect(duration).toBe(DOWNBEAT_LAST_BAR_FLASH_MS);
  });

  it("returns medium flash when either downbeat or last-bar is true", () => {
    // arrange
    const downbeatState = {
      ...createDefaultHudState("elapsed", false),
      isDownbeat: true,
      isLastBar: false,
    };
    const lastBarState = {
      ...createDefaultHudState("elapsed", false),
      isDownbeat: false,
      isLastBar: true,
    };

    // act
    const downbeatDuration = flashDuration(downbeatState);
    const lastBarDuration = flashDuration(lastBarState);

    // assert
    expect(downbeatDuration).toBe(EMPHASIZED_FLASH_MS);
    expect(lastBarDuration).toBe(EMPHASIZED_FLASH_MS);
  });

  it("returns shortest flash during regular beats", () => {
    // arrange
    const state = {
      ...createDefaultHudState("elapsed", false),
      isDownbeat: false,
      isLastBar: false,
    };

    // act
    const duration = flashDuration(state);

    // assert
    expect(duration).toBe(STANDARD_FLASH_MS);
  });
});
