import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

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
 * Stubs `window.hudApi` with the provided implementation.
 * @param hudApi - API implementation for the test.
 */
function stubHudApi(hudApi: Window["hudApi"]): void {
  vi.stubGlobal("hudApi", hudApi);
}

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
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "3:2:1",
      );
    });
    await page.getByTestId("mode-toggle").click();
    await page.getByLabelText("Set window floating").click();
    await page.getByTestId("track-lock-toggle").click();

    expect(page.getByTestId("mode-toggle").element().textContent).toContain(
      "Remaining",
    );
    expect(hudApi.setMode).toHaveBeenCalledWith("elapsed");
    expect(hudApi.toggleTrackLock).toHaveBeenCalledTimes(1);
    expect(hudApi.toggleTopmost).toHaveBeenCalledTimes(1);
  });

  it("toggles mode from elapsed to remaining", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState({ mode: "elapsed" }));

    // act
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("mode-toggle").element().textContent).toBe(
        "Elapsed",
      );
    });
    await page.getByTestId("mode-toggle").click();

    expect(hudApi.setMode).toHaveBeenCalledWith("remaining");
  });

  it("toggles compact view and forwards window resize requests", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "6:6:6", mode: "elapsed" }),
    );

    // act
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "6:6:6",
      );
    });
    await page.getByTestId("compact-toggle").click();

    await vi.waitFor(() => {
      expect(hudApi.setCompactView).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        }),
      );
    });
    await expect
      .element(page.getByTestId("mode-toggle"))
      .not.toBeInTheDocument();

    await page.getByTestId("compact-toggle").click();

    await vi.waitFor(() => {
      expect(hudApi.setCompactView).toHaveBeenCalledWith({ enabled: false });
    });
    expect(page.getByTestId("mode-toggle").element().textContent).toBe(
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
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "6:6:6",
      );
    });
    await page.getByTestId("compact-toggle").click();

    await vi.waitFor(() => {
      expect(page.getByTestId("mode-toggle").element().textContent).toBe(
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
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "6:6:6",
      );
    });
    await page.getByTestId("compact-toggle").click();

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
    await render(<HudApp />);

    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "0:0:0",
      );
    });
    expect(page.getByTestId("mode-toggle").element().textContent).toContain(
      "Elapsed",
    );
    expect(page.getByLabelText("Set window normal").element()).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("applies incoming state updates immediately", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "1:1:1",
      );
    });
    hudApi.emit(
      makeState({
        clipColor: 0xaabbcc,
        clipIndex: 4,
        clipName: "Lead",
        counterText: "5:5:5",
        trackIndex: 1,
      }),
    );

    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "5:5:5",
      );
      expect(page.getByTestId("clip-pill").element().textContent).toBe("Lead");
    });
  });

  it("unsubscribes listeners on unmount", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState());

    // act
    const view = await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("hud-root").element()).toBeInstanceOf(
        HTMLElement,
      );
    });
    await view.unmount();

    expect(hudApi.listenerCount()).toBe(0);
  });

  it("ignores hud state callbacks after unmount", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    const view = await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "1:1:1",
      );
    });
    await view.unmount();
    hudApi.emit(makeState({ counterText: "7:7:7" }));

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
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "1:1:1",
      );
    });
    await view.unmount();
    listenerRef.current(makeState({ counterText: "9:9:9" }));

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

    const view = await render(<HudApp />);
    await view.unmount();
    deferred.resolve(makeState({ counterText: "8:8:8" }));
    // act
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

    const view = await render(<HudApp />);
    await view.unmount();
    deferred.reject(new Error("boom"));
    // act
    await Promise.resolve();

    // assert
    await expect.element(page.getByTestId("hud-root")).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("clears clip color immediately when incoming clip color is null", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ clipColor: 0x112233, counterText: "2:2:2" }),
    );

    // act
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "2:2:2",
      );
    });
    await vi.waitFor(() => {
      expect(
        page.getByTestId("clip-pill").element().style.backgroundColor,
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

    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "2:2:3",
      );
      expect(
        page.getByTestId("clip-pill").element().style.backgroundColor,
      ).toBe("");
    });
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
    await render(<HudApp />);
    // assert
    await vi.waitFor(() => {
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "4:1:1",
      );
    });
    const counterPanelClassNameBefore =
      page.getByTestId("counter-panel").element().getAttribute("class") ?? "";
    expect(counterPanelClassNameBefore).toContain("border-[#4a5a45]");
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

    await vi.waitFor(() => {
      const counterPanelClassNameAfter =
        page.getByTestId("counter-panel").element().getAttribute("class") ?? "";
      expect(counterPanelClassNameAfter).not.toContain("border-[#4a5a45]");
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "4:1:2",
      );
    });
  });

  it("transitions status and metadata through disconnect and reconnect updates", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({
        clipName: "Clip A",
        connected: true,
        counterText: "3:2:1",
        isPlaying: true,
        sceneName: "Scene A",
        trackName: "Track A",
      }),
    );

    // act
    await render(<HudApp />);

    // assert
    await vi.waitFor(() => {
      expect(page.getByLabelText("Playing").element()).toBeInstanceOf(
        HTMLElement,
      );
      expect(page.getByTestId("track-pill").element().textContent).toContain(
        "Track A",
      );
    });

    hudApi.emit(
      makeState({
        clipName: null,
        connected: false,
        counterText: "0:0:0",
        isPlaying: false,
        sceneName: null,
        trackName: null,
      }),
    );
    await vi.waitFor(() => {
      expect(page.getByLabelText("Disconnected").element()).toBeInstanceOf(
        HTMLElement,
      );
      expect(page.getByTestId("status-badge").element().textContent).toContain(
        "Disconnected",
      );
      expect(page.getByTestId("clip-pill").element().textContent).toBe("-");
      expect(page.getByTestId("track-pill").element().textContent).toBe("-");
      expect(page.getByTestId("scene-pill").element().textContent).toBe("-");
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "0:0:0",
      );
      expect(
        page.getByTestId("counter-text").element().getAttribute("class"),
      ).toContain("text-zinc-500");
    });

    hudApi.emit(
      makeState({
        clipName: "Clip B",
        connected: true,
        counterText: "9:1:2",
        isPlaying: true,
        sceneName: "Scene B",
        trackName: "Track B",
      }),
    );
    await vi.waitFor(() => {
      expect(page.getByLabelText("Playing").element()).toBeInstanceOf(
        HTMLElement,
      );
      expect(page.getByTestId("track-pill").element().textContent).toContain(
        "Track B",
      );
      expect(page.getByTestId("scene-pill").element().textContent).toContain(
        "Scene B",
      );
      expect(page.getByTestId("clip-pill").element().textContent).toContain(
        "Clip B",
      );
      expect(page.getByTestId("counter-text").element().textContent).toBe(
        "9:1:2",
      );
    });
  });
});
