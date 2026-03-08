import type { HudApi } from "@renderer/app/hud/api";

import { stubHudApi } from "@renderer/app/hud/__tests__/application-browser-support";
import { createDefaultHudState } from "@shared/ipc";
import { expect, it, vi } from "vitest";

import { getHudApi } from "../api";

const INVALID_HUD_API_PRIMITIVE = "invalid-hud-api";

/**
 * Reads the HUD API from the current global runtime.
 * @returns The typed HUD API bridge.
 */
function readHudApiFromRuntime(): HudApi {
  return getHudApi();
}

it("returns the typed hudApi bridge from the global runtime", () => {
  // arrange
  const hudApi: HudApi = {
    getInitialState: vi.fn(() => Promise.resolve(createDefaultHudState())),
    onHudState: vi.fn(() => vi.fn()),
    setCompactView: vi.fn(() => Promise.resolve()),
    setMode: vi.fn(() => Promise.resolve()),
    toggleTopmost: vi.fn(() => Promise.resolve()),
    toggleTrackLock: vi.fn(() => Promise.resolve()),
  };
  stubHudApi(hudApi);

  // act
  const resolvedHudApi = getHudApi();

  // assert
  expect(resolvedHudApi).toBe(hudApi);
});

it("throws when hudApi is missing from the global runtime", () => {
  // arrange
  vi.unstubAllGlobals();

  // act
  const hudApiReader = readHudApiFromRuntime;

  // assert
  expect(hudApiReader).toThrowError(
    "hudApi is unavailable in the renderer context.",
  );
});

it("throws when hudApi is present but not an object", () => {
  // arrange
  vi.stubGlobal("hudApi", INVALID_HUD_API_PRIMITIVE);

  // act
  const hudApiReader = readHudApiFromRuntime;

  // assert
  expect(hudApiReader).toThrowError(
    "hudApi is unavailable in the renderer context.",
  );
});

it("throws when hudApi does not expose the full preload contract", () => {
  // arrange
  vi.stubGlobal("hudApi", {
    getInitialState: vi.fn(() => Promise.resolve()),
  });

  // act
  const hudApiReader = readHudApiFromRuntime;

  // assert
  expect(hudApiReader).toThrowError(
    "hudApi is unavailable in the renderer context.",
  );
});
