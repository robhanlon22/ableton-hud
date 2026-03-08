import {
  installResolvedHudApiMock,
  makeHudState,
} from "@renderer/app/hud/__tests__/application-browser-support";
import { useEffect, useRef } from "react";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { useHudAppState } from "../use-hud-app-state";

const MEASURED_COMPACT_PANEL_HEIGHT = 20;
const MEASURED_COMPACT_PANEL_WIDTH = 200;

/**
 * Triggers compact-mode activation without mounting a compact panel element.
 * @returns A minimal test harness.
 */
function CompactFallbackHarness() {
  const { onToggleCompactView, state } = useHudAppState();
  const hasToggledReference = useRef(false);

  useEffect(() => {
    if (hasToggledReference.current || state.counterText !== "6:6:6") {
      return;
    }

    hasToggledReference.current = true;
    onToggleCompactView();
  }, [onToggleCompactView, state.counterText]);

  return <div data-testid="compact-fallback-harness" />;
}

/**
 * Exposes the compact panel ref while toggling compact mode on mount.
 * @returns A minimal test harness with a measurable compact panel.
 */
function CompactResizeDedupHarness() {
  const { compactPanelRef, onToggleCompactView, state } = useHudAppState();
  const hasToggledReference = useRef(false);

  useEffect(() => {
    if (hasToggledReference.current || state.counterText !== "6:6:6") {
      return;
    }

    hasToggledReference.current = true;
    onToggleCompactView();
  }, [onToggleCompactView, state.counterText]);

  return (
    <div>
      <div data-testid="compact-panel" ref={compactPanelRef} />
      <span data-testid="counter-text">{state.counterText}</span>
    </div>
  );
}

it("uses the fallback compact height when no panel element is attached", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6" }),
  );

  // act
  await render(<CompactFallbackHarness />);

  // assert
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 5,
      width: 320,
    });
  });
});

it("does not resend compact resize when the measured compact size is unchanged", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6", mode: "elapsed" }),
  );
  const getBoundingClientRectSpy = vi
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockImplementation(
      () =>
        new DOMRect(
          0,
          0,
          MEASURED_COMPACT_PANEL_WIDTH,
          MEASURED_COMPACT_PANEL_HEIGHT,
        ),
    );

  // act
  await render(<CompactResizeDedupHarness />);
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 24,
      width: 320,
    });
  });
  hudApi.setCompactView.mockClear();
  hudApi.emit(makeHudState({ compactView: true, counterText: "7:7:7" }));
  await new Promise<void>((resolve) => {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        resolve();
      });
    });
  });

  // assert
  expect(page.getByTestId("counter-text").element().textContent).toBe("7:7:7");
  expect(hudApi.setCompactView).not.toHaveBeenCalled();
  getBoundingClientRectSpy.mockRestore();
});
