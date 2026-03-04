import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HudState } from "../../../shared/types";

import { createDefaultHudState } from "../../../shared/ipc";
import {
  HudSurface,
  resolveHeldClipColor,
  shouldHoldNullClipTransition,
} from "./hud-app";

/**
 * Creates a HUD state fixture with sensible defaults for tests.
 * @param overrides - Partial state values to override in the default fixture.
 * @returns A complete HUD state object for rendering assertions.
 */
function makeState(overrides: Partial<HudState> = {}): HudState {
  return {
    ...createDefaultHudState(),
    clipIndex: 1,
    clipName: "Build",
    connected: true,
    counterText: "2:3:4",
    isPlaying: true,
    sceneName: "Drop",
    trackIndex: 0,
    trackName: "Kick",
    ...overrides,
  };
}

describe("HudSurface", () => {
  it("renders clip and counter text", () => {
    render(
      <HudSurface
        isFlashActive={false}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        state={makeState()}
      />,
    );

    expect(screen.getByTestId("clip-pill")).toHaveTextContent("Build");
    expect(screen.getByTestId("track-pill")).toHaveTextContent("Kick");
    expect(screen.getByTestId("scene-pill")).toHaveTextContent("Drop");
    expect(screen.getByTestId("counter-text")).toHaveTextContent("2:3:4");
  });

  it("triggers mode toggle callback", () => {
    const onToggleMode = vi.fn();

    render(
      <HudSurface
        isFlashActive={false}
        onToggleMode={onToggleMode}
        onToggleTopmost={vi.fn()}
        state={makeState({ mode: "elapsed" })}
      />,
    );

    fireEvent.click(screen.getByTestId("mode-toggle"));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it("applies warning styling when in last bar", () => {
    render(
      <HudSurface
        isFlashActive={true}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        state={makeState({ isLastBar: true })}
      />,
    );

    expect(screen.getByTestId("counter-text")).toHaveClass(
      "text-ableton-warning",
    );
  });

  it("uses metadata colors as pill backgrounds with contrasting text", () => {
    render(
      <HudSurface
        isFlashActive={false}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        state={makeState({
          clipColor: 0xffd000,
          sceneColor: 0x008c66,
          trackColor: 0x3344ff,
        })}
      />,
    );

    const clipPill = screen.getByTestId("clip-pill");
    const trackPill = screen.getByTestId("track-pill");
    const scenePill = screen.getByTestId("scene-pill");

    expect(clipPill).toHaveStyle("background-color: rgb(255, 208, 0)");
    expect(clipPill).toHaveStyle("color: rgb(16, 18, 22)");
    expect(trackPill).toHaveStyle("background-color: rgb(51, 68, 255)");
    expect(scenePill).toHaveStyle("background-color: rgb(0, 140, 102)");
  });

  it("renders empty metadata pills when names are missing", () => {
    render(
      <HudSurface
        isFlashActive={false}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        state={makeState({ clipName: null, sceneName: null, trackName: null })}
      />,
    );

    expect(screen.getByTestId("clip-pill").textContent).toBe("");
    expect(screen.getByTestId("track-pill").textContent).toBe("");
    expect(screen.getByTestId("scene-pill").textContent).toBe("");
  });
});

describe("shouldHoldNullClipTransition", () => {
  it("holds when next state temporarily drops clip during track handoff", () => {
    const previous = makeState({
      clipIndex: 2,
      isPlaying: true,
      trackIndex: 0,
    });
    const next = makeState({ clipIndex: null, isPlaying: true, trackIndex: 1 });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(true);
  });

  it("does not hold when transport is stopped", () => {
    const previous = makeState({ clipIndex: 2, isPlaying: true });
    const next = makeState({ clipIndex: null, isPlaying: false });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });

  it("does not hold when there was no previous clip", () => {
    const previous = makeState({ clipIndex: null, isPlaying: true });
    const next = makeState({ clipIndex: null, isPlaying: true });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });

  it("does not hold when clip drops on same track", () => {
    const previous = makeState({
      clipIndex: 3,
      isPlaying: true,
      trackIndex: 2,
    });
    const next = makeState({ clipIndex: null, isPlaying: true, trackIndex: 2 });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });
});

describe("resolveHeldClipColor", () => {
  it("keeps previous color during playing null-clip handoff", () => {
    const next = makeState({
      clipColor: null,
      clipIndex: null,
      isPlaying: true,
    });
    expect(resolveHeldClipColor(0xff00aa, next)).toBe(0xff00aa);
  });

  it("uses incoming clip color when provided", () => {
    const next = makeState({ clipColor: 0x00ccff, isPlaying: true });
    expect(resolveHeldClipColor(0xff00aa, next)).toBe(0x00ccff);
  });

  it("clears held color when transport is stopped", () => {
    const next = makeState({
      clipColor: null,
      clipIndex: null,
      isPlaying: false,
    });
    expect(resolveHeldClipColor(0xff00aa, next)).toBeNull();
  });
});
