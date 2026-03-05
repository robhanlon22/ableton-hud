import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import type { HudState } from "../../../shared/types";

import { createDefaultHudState } from "../../../shared/ipc";
import { HudSurface } from "./hud-app";

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
  it("renders clip and counter text", async () => {
    await render(
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

    await expect
      .element(page.getByTestId("clip-pill"))
      .toHaveTextContent("Build");
    await expect
      .element(page.getByTestId("track-pill"))
      .toHaveTextContent("Kick");
    await expect
      .element(page.getByTestId("scene-pill"))
      .toHaveTextContent("Drop");
    await expect
      .element(page.getByTestId("counter-text"))
      .toHaveTextContent("2:3:4");
  });

  it("triggers mode toggle callback", async () => {
    const onToggleMode = vi.fn();

    await render(
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

    await page.getByTestId("mode-toggle").click();
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it("applies warning styling when in last bar", async () => {
    await render(
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

    await expect
      .element(page.getByTestId("counter-text"))
      .toHaveClass("text-ableton-warning");
  });

  it("uses metadata colors as pill backgrounds with contrasting text", async () => {
    await render(
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

    const clipPill = page.getByTestId("clip-pill").element();
    const trackPill = page.getByTestId("track-pill").element();
    const scenePill = page.getByTestId("scene-pill").element();

    expect(clipPill.style.backgroundColor).toBe("rgb(255, 208, 0)");
    expect(clipPill.style.color).toBe("rgb(16, 18, 22)");
    expect(trackPill.style.backgroundColor).toBe("rgb(51, 68, 255)");
    expect(scenePill.style.backgroundColor).toBe("rgb(0, 140, 102)");
  });

  it("renders empty metadata pills when names are missing", async () => {
    await render(
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

    await expect.element(page.getByTestId("clip-pill")).toHaveTextContent("");
    await expect.element(page.getByTestId("track-pill")).toHaveTextContent("");
    await expect.element(page.getByTestId("scene-pill")).toHaveTextContent("");
  });

  it("renders topmost toggle metadata when always-on-top is enabled", async () => {
    await render(
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

    const topmostButton = page.getByLabelText("Set window normal").element();
    expect(topmostButton.getAttribute("title")).toBe("FLOAT");
  });

  it("renders track lock metadata and triggers toggle callback", async () => {
    const onToggleTrackLock = vi.fn();
    await render(
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

    const lockButton = page.getByLabelText("Unlock track lock").element();
    expect(lockButton.getAttribute("title")).toBe("LOCKED");
    await page.getByLabelText("Unlock track lock").click();
    expect(onToggleTrackLock).toHaveBeenCalledTimes(1);
  });

  it("renders remaining mode label", async () => {
    await render(
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

    await expect
      .element(page.getByTestId("mode-toggle"))
      .toHaveTextContent("Remaining");
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

    await expect
      .element(page.getByLabelText("Disconnected"))
      .toBeInTheDocument();

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

    await expect.element(page.getByLabelText("Stopped")).toBeInTheDocument();
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

    await expect
      .element(page.getByTestId("counter-panel"))
      .toHaveClass("border-[#83545a]");

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
    await expect
      .element(page.getByTestId("counter-panel"))
      .toHaveClass("border-[#7a4f54]");

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
    await expect
      .element(page.getByTestId("counter-panel"))
      .toHaveClass("border-[#546a4b]");

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
    await expect
      .element(page.getByTestId("counter-panel"))
      .toHaveClass("border-[#4a5a45]");
  });

  it("uses compact flash styling without border classes", async () => {
    await render(
      <HudSurface
        compactPanelRef={{ current: null }}
        isCompactView={true}
        isFlashActive={true}
        onToggleCompactView={vi.fn()}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
        onToggleTrackLock={vi.fn()}
        state={makeState({ isLastBar: true })}
      />,
    );

    await expect
      .element(page.getByTestId("counter-panel"))
      .toHaveClass("bg-[#32252a]");
    await expect
      .element(page.getByTestId("counter-panel"))
      .not.toHaveClass("border-[#7a4f54]");
  });
});
