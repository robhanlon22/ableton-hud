import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

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

/**
 * Resolves an element by test id.
 * @param root - Root element to query.
 * @param testId - Data test id value.
 * @returns Matching HTMLElement.
 */
function requiredByTestId(root: ParentNode, testId: string): HTMLElement {
  return requiredElement(root, `[data-testid='${testId}']`);
}

/**
 * Resolves a required HTMLElement by selector.
 * @param root - Root element to query.
 * @param selector - CSS selector.
 * @returns Matching HTMLElement.
 */
function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      `Expected selector ${selector} to resolve to an HTMLElement.`,
    );
  }
  return element;
}

describe("HudSurface", () => {
  it("renders clip and counter text", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState()}
      />,
    );

    expect(requiredByTestId(view.container, "clip-pill").textContent).toContain(
      "Build",
    );
    expect(
      requiredByTestId(view.container, "track-pill").textContent,
    ).toContain("Kick");
    expect(
      requiredByTestId(view.container, "scene-pill").textContent,
    ).toContain("Drop");
    expect(
      requiredByTestId(view.container, "counter-text").textContent,
    ).toContain("2:3:4");
  });

  it("triggers mode toggle callback", async () => {
    const onToggleMode = vi.fn();

    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={onToggleMode}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ mode: "elapsed" })}
      />,
    );

    requiredByTestId(view.container, "mode-toggle").click();
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it("applies warning styling when in last bar", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={true}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ isLastBar: true })}
      />,
    );

    expect(
      requiredByTestId(view.container, "counter-text").className,
    ).toContain("text-ableton-warning");
  });

  it("uses metadata colors as pill backgrounds with contrasting text", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({
          clipColor: 0xffd000,
          sceneColor: 0x008c66,
          trackColor: 0x3344ff,
        })}
      />,
    );

    const clipPill = requiredByTestId(view.container, "clip-pill");
    const trackPill = requiredByTestId(view.container, "track-pill");
    const scenePill = requiredByTestId(view.container, "scene-pill");

    expect(clipPill.style.backgroundColor).toBe("rgb(255, 208, 0)");
    expect(clipPill.style.color).toBe("rgb(16, 18, 22)");
    expect(trackPill.style.backgroundColor).toBe("rgb(51, 68, 255)");
    expect(scenePill.style.backgroundColor).toBe("rgb(0, 140, 102)");
  });

  it("renders empty metadata pills when names are missing", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ clipName: null, sceneName: null, trackName: null })}
      />,
    );

    expect(requiredByTestId(view.container, "clip-pill").textContent).toBe("");
    expect(requiredByTestId(view.container, "track-pill").textContent).toBe("");
    expect(requiredByTestId(view.container, "scene-pill").textContent).toBe("");
  });

  it("renders topmost toggle metadata when always-on-top is enabled", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ alwaysOnTop: true })}
      />,
    );

    const topmostButton = requiredElement(
      view.container,
      "button[aria-label='Set window normal']",
    );
    expect(topmostButton.getAttribute("title")).toBe("FLOAT");
  });

  it("renders track lock metadata and triggers toggle callback", async () => {
    const onToggleTrackLock = vi.fn();
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={onToggleTrackLock}
        state={makeState({ trackLocked: true })}
      />,
    );

    const lockButton = requiredElement(
      view.container,
      "button[aria-label='Unlock track lock']",
    );
    expect(lockButton.getAttribute("title")).toBe("LOCKED");
    lockButton.click();
    expect(onToggleTrackLock).toHaveBeenCalledTimes(1);
  });

  it("renders remaining mode label", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ mode: "remaining" })}
      />,
    );

    expect(
      requiredByTestId(view.container, "mode-toggle").textContent,
    ).toContain("Remaining");
  });

  it("renders status labels for disconnected and stopped states", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ connected: false, isPlaying: false })}
      />,
    );

    expect(
      requiredElement(view.container, "[aria-label='Disconnected']"),
    ).toBeInstanceOf(HTMLElement);

    await view.rerender(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={false}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({
          connected: true,
          isLastBar: false,
          isPlaying: false,
        })}
      />,
    );

    expect(
      requiredElement(view.container, "[aria-label='Stopped']"),
    ).toBeInstanceOf(HTMLElement);
  });

  it("applies flash panel classes for downbeat and last-bar combinations", async () => {
    const view = await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={true}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ isDownbeat: true, isLastBar: true })}
      />,
    );

    let flashPanel = requiredByTestId(
      view.container,
      "counter-text",
    ).parentElement;
    expect(flashPanel?.className).toContain("border-[#83545a]");

    await view.rerender(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={true}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ isDownbeat: false, isLastBar: true })}
      />,
    );
    flashPanel = requiredByTestId(view.container, "counter-text").parentElement;
    expect(flashPanel?.className).toContain("border-[#7a4f54]");

    await view.rerender(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={true}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ isDownbeat: true, isLastBar: false })}
      />,
    );
    flashPanel = requiredByTestId(view.container, "counter-text").parentElement;
    expect(flashPanel?.className).toContain("border-[#546a4b]");

    await view.rerender(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={false}
        isFlashActive={true}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ isDownbeat: false, isLastBar: false })}
      />,
    );
    flashPanel = requiredByTestId(view.container, "counter-text").parentElement;
    expect(flashPanel?.className).toContain("border-[#4a5a45]");
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

  it("does not hold when next clip index is present", () => {
    const previous = makeState({
      clipIndex: 3,
      isPlaying: true,
      trackIndex: 1,
    });
    const next = makeState({ clipIndex: 2, isPlaying: true, trackIndex: 2 });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });

  it("does not hold when either track index is missing", () => {
    const previous = makeState({
      clipIndex: 2,
      isPlaying: true,
      trackIndex: null,
    });
    const next = makeState({ clipIndex: null, isPlaying: true, trackIndex: 1 });
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

  it("falls back to previous color when clip remains active but color is null", () => {
    const next = makeState({
      clipColor: null,
      clipIndex: 2,
      isPlaying: true,
      trackIndex: 1,
    });
    expect(resolveHeldClipColor(0xff00aa, next)).toBe(0xff00aa);
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
