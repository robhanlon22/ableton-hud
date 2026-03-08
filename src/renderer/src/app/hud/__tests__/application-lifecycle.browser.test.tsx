import type { HudState } from "@shared/types";

import {
  createDeferred,
  installResolvedHudApiMock,
  makeHudState,
  stubHudApi,
} from "@renderer/app/hud/__tests__/application-browser-support";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudApp } from "..";

/**
 * Throws if a test forgets to capture the HUD state listener callback.
 * @param state - The state that tried to update after the listener was lost.
 */
const unassignedHudStateListener = (state: HudState): void => {
  throw new Error(`Listener was not assigned for ${state.counterText}.`);
};

it("unsubscribes listeners on unmount", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(makeHudState());

  // act
  const view = await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("hud-root").element()).toBeInstanceOf(HTMLElement);
  });
  await view.unmount();

  // assert
  expect(hudApi.listenerCount()).toBe(0);
});

it("ignores hud state callbacks after unmount", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "1:1:1" }),
  );

  // act
  const view = await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "1:1:1",
    );
  });
  await view.unmount();
  hudApi.emit(makeHudState({ counterText: "7:7:7" }));

  // assert
  expect(hudApi.listenerCount()).toBe(0);
});

it("guards state updates when onHudState callback fires after unmount", async () => {
  // arrange
  let listener = unassignedHudStateListener;
  const unsubscribe = vi.fn();
  stubHudApi({
    getInitialState: vi.fn(() =>
      Promise.resolve(makeHudState({ counterText: "1:1:1" })),
    ),
    onHudState: vi.fn((callback: (state: HudState) => void) => {
      listener = callback;
      return unsubscribe;
    }),
    setCompactView: vi.fn(() => Promise.resolve()),
    setMode: vi.fn(() => Promise.resolve()),
    toggleTopmost: vi.fn(() => Promise.resolve()),
    toggleTrackLock: vi.fn(() => Promise.resolve()),
  });

  // act
  const view = await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "1:1:1",
    );
  });
  await view.unmount();
  listener(makeHudState({ counterText: "9:9:9" }));

  // assert
  await expect
    .element(page.getByTestId("counter-text"))
    .not.toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("does not apply resolved initial state after unmount", async () => {
  // arrange
  const deferred = createDeferred<HudState>();
  const unsubscribe = vi.fn();
  stubHudApi({
    getInitialState: vi.fn(() => deferred.promise),
    onHudState: vi.fn(() => unsubscribe),
    setCompactView: vi.fn(() => Promise.resolve()),
    setMode: vi.fn(() => Promise.resolve()),
    toggleTopmost: vi.fn(() => Promise.resolve()),
    toggleTrackLock: vi.fn(() => Promise.resolve()),
  });

  // act
  const view = await render(<HudApp />);
  await view.unmount();
  deferred.resolve(makeHudState({ counterText: "8:8:8" }));
  await Promise.resolve();

  // assert
  await expect.element(page.getByTestId("hud-root")).not.toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("does not apply rejected initial state fallback after unmount", async () => {
  // arrange
  const deferred = createDeferred<HudState>();
  const unsubscribe = vi.fn();
  stubHudApi({
    getInitialState: vi.fn(() => deferred.promise),
    onHudState: vi.fn(() => unsubscribe),
    setCompactView: vi.fn(() => Promise.resolve()),
    setMode: vi.fn(() => Promise.resolve()),
    toggleTopmost: vi.fn(() => Promise.resolve()),
    toggleTrackLock: vi.fn(() => Promise.resolve()),
  });

  // act
  const view = await render(<HudApp />);
  await view.unmount();
  deferred.reject(new Error("boom"));
  await Promise.resolve();

  // assert
  await expect.element(page.getByTestId("hud-root")).not.toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
