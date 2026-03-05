import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { HudState } from "../../../shared/types";

import { createDefaultHudState } from "../../../shared/ipc";
import { HudApp } from "./hud-app";

interface Deferred<TValue> {
  promise: Promise<TValue>;
  reject: (reason?: unknown) => void;
  resolve: (value: TValue) => void;
}

interface HudApiController {
  emit: (state: HudState) => void;
  listenerCount: () => number;
  setCompactView: ReturnType<typeof vi.fn>;
  setMode: ReturnType<typeof vi.fn>;
  toggleTopmost: ReturnType<typeof vi.fn>;
  toggleTrackLock: ReturnType<typeof vi.fn>;
}

const NOOP_LISTENER = (state: HudState): void => {
  void state;
};
const NOOP_REJECT = (reason?: unknown): void => {
  void reason;
};
const NOOP_RESOLVE = (value: unknown): void => {
  void value;
};

/**
 * Creates a deferred promise pair for deterministic async test control.
 * @returns Deferred promise handles.
 */
function createDeferred<TValue>(): Deferred<TValue> {
  let reject: (reason?: unknown) => void = NOOP_REJECT;
  let resolve: (value: TValue) => void = (value: TValue) => {
    NOOP_RESOLVE(value);
  };

  const promise = new Promise<TValue>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

/**
 * Installs `window.hudApi` with a rejected initial-state request.
 */
function installRejectedHudApiMock(): void {
  stubHudApi({
    getInitialState: vi.fn(() => Promise.reject(new Error("boom"))),
    onHudState: vi.fn(() => vi.fn()),
    setCompactView: vi.fn(() => Promise.resolve()),
    setMode: vi.fn(() => Promise.resolve()),
    toggleTopmost: vi.fn(() => Promise.resolve()),
    toggleTrackLock: vi.fn(() => Promise.resolve()),
  });
}

/**
 * Installs a controllable `window.hudApi` mock with a resolved initial state.
 * @param initialState - Initial state returned by `getInitialState`.
 * @returns A controller for emissions and spy assertions.
 */
function installResolvedHudApiMock(initialState: HudState): HudApiController {
  let activeListener = NOOP_LISTENER;
  let subscriptions = 0;

  const setMode = vi.fn((mode: HudState["mode"]) => {
    void mode;
    return Promise.resolve();
  });
  const setCompactView = vi.fn(() => Promise.resolve());
  const toggleTrackLock = vi.fn(() => Promise.resolve());
  const toggleTopmost = vi.fn(() => Promise.resolve());

  stubHudApi({
    getInitialState: () => Promise.resolve(initialState),
    onHudState: (callback: (state: HudState) => void) => {
      activeListener = callback;
      subscriptions = 1;
      return () => {
        activeListener = NOOP_LISTENER;
        subscriptions = 0;
      };
    },
    setCompactView,
    setMode,
    toggleTopmost,
    toggleTrackLock,
  });

  return {
    emit: (state: HudState) => {
      activeListener(state);
    },
    listenerCount: () => subscriptions,
    setCompactView,
    setMode,
    toggleTopmost,
    toggleTrackLock,
  };
}

/**
 * Creates a full HUD state fixture for integration tests.
 * @param overrides - Partial state overrides.
 * @returns A complete HUD state.
 */
function makeState(overrides: Partial<HudState> = {}): HudState {
  return {
    ...createDefaultHudState(),
    clipColor: 0x112233,
    clipIndex: 1,
    clipName: "Build",
    connected: true,
    counterText: "1:1:1",
    isDownbeat: false,
    isPlaying: true,
    mode: "elapsed",
    sceneName: "Scene A",
    trackIndex: 0,
    trackName: "Track A",
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

/**
 * Stubs `window.hudApi` with the provided implementation.
 * @param hudApi - API implementation for the test.
 */
function stubHudApi(hudApi: Window["hudApi"]): void {
  vi.stubGlobal("hudApi", hudApi);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HudApp integration", () => {
  it("hydrates from hudApi and forwards toggle commands", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({
        alwaysOnTop: false,
        counterText: "3:2:1",
        mode: "remaining",
      }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "3:2:1",
      );
    });
    requiredByTestId(view.container, "mode-toggle").click();
    requiredElement(
      view.container,
      "button[aria-label='Set window floating']",
    ).click();
    requiredByTestId(view.container, "track-lock-toggle").click();

    // assert
    expect(
      requiredByTestId(view.container, "mode-toggle").textContent,
    ).toContain("Remaining");
    expect(hudApi.setMode).toHaveBeenCalledWith("elapsed");
    expect(hudApi.toggleTrackLock).toHaveBeenCalledTimes(1);
    expect(hudApi.toggleTopmost).toHaveBeenCalledTimes(1);
  });

  it("toggles mode from elapsed to remaining", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState({ mode: "elapsed" }));

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "mode-toggle").textContent).toBe(
        "Elapsed",
      );
    });
    requiredByTestId(view.container, "mode-toggle").click();

    // assert
    expect(hudApi.setMode).toHaveBeenCalledWith("remaining");
  });

  it("toggles compact view and forwards window resize requests", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "6:6:6", mode: "elapsed" }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "6:6:6",
      );
    });
    requiredByTestId(view.container, "compact-toggle").click();

    // assert
    await vi.waitFor(() => {
      expect(hudApi.setCompactView).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        }),
      );
    });
    expect(
      view.container.querySelector('[data-testid="mode-toggle"]'),
    ).toBeNull();

    // act
    requiredByTestId(view.container, "compact-toggle").click();

    // assert
    await vi.waitFor(() => {
      expect(hudApi.setCompactView).toHaveBeenCalledWith({ enabled: false });
    });
    expect(requiredByTestId(view.container, "mode-toggle").textContent).toBe(
      "Elapsed",
    );
  });

  it("restores full view when compact resize request fails", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "6:6:6", mode: "elapsed" }),
    );
    hudApi.setCompactView.mockRejectedValueOnce(new Error("failed"));

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "6:6:6",
      );
    });
    requiredByTestId(view.container, "compact-toggle").click();

    // assert
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "mode-toggle").textContent).toBe(
        "Elapsed",
      );
    });
  });

  it("uses minimal compact dimensions when panel ref is unavailable", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "6:6:6" }),
    );
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => {
        return undefined as unknown as DOMRect;
      });

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "6:6:6",
      );
    });
    requiredByTestId(view.container, "compact-toggle").click();

    // assert
    await vi.waitFor(() => {
      expect(hudApi.setCompactView).toHaveBeenCalledWith({
        enabled: true,
        height: 5,
        width: 320,
      });
    });
    getBoundingClientRectSpy.mockRestore();
  });

  it("falls back to default hud state when initial load fails", async () => {
    // arrange
    installRejectedHudApiMock();

    // act
    const view = await render(<HudApp />);

    // assert
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "0:0:0",
      );
    });
    expect(
      requiredByTestId(view.container, "mode-toggle").textContent,
    ).toContain("Elapsed");
  });

  it("holds null clip transitions until timeout elapses", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "1:1:1",
      );
    });
    hudApi.emit(
      makeState({
        clipColor: null,
        clipIndex: null,
        clipName: null,
        counterText: "9:9:9",
        trackIndex: 1,
      }),
    );
    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        resolve();
      }, 95);
    });

    // assert
    expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
      "9:9:9",
    );
  });

  it("cancels pending null clip hold when a concrete clip arrives", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "1:1:1",
      );
    });
    hudApi.emit(
      makeState({
        clipColor: null,
        clipIndex: null,
        counterText: "9:9:9",
        trackIndex: 1,
      }),
    );
    hudApi.emit(
      makeState({
        clipColor: 0xaabbcc,
        clipIndex: 4,
        clipName: "Lead",
        counterText: "5:5:5",
        trackIndex: 1,
      }),
    );
    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        resolve();
      }, 95);
    });

    // assert
    expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
      "5:5:5",
    );
  });

  it("unsubscribes listeners on unmount", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState());

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "hud-root")).toBeInstanceOf(
        HTMLElement,
      );
    });
    await view.unmount();

    // assert
    expect(hudApi.listenerCount()).toBe(0);
  });

  it("ignores hud state callbacks after unmount", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "1:1:1",
      );
    });
    await view.unmount();
    hudApi.emit(makeState({ counterText: "7:7:7" }));

    // assert
    expect(hudApi.listenerCount()).toBe(0);
  });

  it("guards state updates when onHudState callback fires after unmount", async () => {
    // arrange
    const listenerRef: {
      current: (state: HudState) => void;
    } = {
      current: NOOP_LISTENER,
    };
    const unsubscribe = vi.fn();

    stubHudApi({
      getInitialState: vi.fn(() =>
        Promise.resolve(makeState({ counterText: "1:1:1" })),
      ),
      onHudState: vi.fn((callback: (state: HudState) => void) => {
        listenerRef.current = callback;
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
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "1:1:1",
      );
    });
    await view.unmount();
    listenerRef.current(makeState({ counterText: "9:9:9" }));

    // assert
    expect(
      view.container.querySelector('[data-testid="counter-text"]'),
    ).toBeNull();
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
    deferred.resolve(makeState({ counterText: "8:8:8" }));
    await Promise.resolve();

    // assert
    expect(view.container.querySelector('[data-testid="hud-root"]')).toBeNull();
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
    expect(view.container.querySelector('[data-testid="hud-root"]')).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("reuses held clip color during temporary null color updates", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ clipColor: 0x112233, counterText: "2:2:2" }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "2:2:2",
      );
    });
    await vi.waitFor(() => {
      expect(
        requiredByTestId(view.container, "clip-pill").style.backgroundColor,
      ).toBe("rgb(17, 34, 51)");
    });
    hudApi.emit(
      makeState({
        clipColor: null,
        clipIndex: 1,
        counterText: "2:2:3",
        trackIndex: 0,
      }),
    );

    // assert
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "2:2:3",
      );
      expect(
        requiredByTestId(view.container, "clip-pill").style.backgroundColor,
      ).toBe("rgb(17, 34, 51)");
    });
  });

  it("clears pending handoff timeout during unmount cleanup", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState());
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "1:1:1",
      );
    });
    hudApi.emit(
      makeState({
        clipColor: null,
        clipIndex: null,
        counterText: "9:9:9",
        trackIndex: 1,
      }),
    );
    await view.unmount();

    // assert
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("turns off flash state after the duration window", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({
        beatFlashToken: 5,
        counterText: "4:1:1",
        isDownbeat: false,
        isLastBar: false,
      }),
    );

    // act
    const view = await render(<HudApp />);
    await vi.waitFor(() => {
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "4:1:1",
      );
    });
    expect(
      requiredByTestId(view.container, "counter-text").parentElement?.className,
    ).toContain("border-[#4a5a45]");
    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        resolve();
      }, 170);
    });
    hudApi.emit(
      makeState({
        beatFlashToken: 5,
        counterText: "4:1:2",
        isDownbeat: false,
        isLastBar: false,
      }),
    );

    // assert
    await vi.waitFor(() => {
      expect(
        requiredByTestId(view.container, "counter-text").parentElement
          ?.className,
      ).not.toContain("border-[#4a5a45]");
      expect(requiredByTestId(view.container, "counter-text").textContent).toBe(
        "4:1:2",
      );
    });
  });
});
