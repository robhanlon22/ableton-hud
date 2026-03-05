import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  setMode: ReturnType<typeof vi.fn>;
  toggleTopmost: ReturnType<typeof vi.fn>;
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
    setMode: vi.fn(() => Promise.resolve()),
    toggleTopmost: vi.fn(() => Promise.resolve()),
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
    setMode,
    toggleTopmost,
  });

  return {
    emit: (state: HudState) => {
      activeListener(state);
    },
    listenerCount: () => subscriptions,
    setMode,
    toggleTopmost,
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
    render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("3:2:1");
    });
    fireEvent.click(screen.getByTestId("mode-toggle"));
    fireEvent.click(
      screen.getByRole("button", { name: "Set window floating" }),
    );

    // assert
    expect(screen.getByTestId("mode-toggle")).toHaveTextContent("Remaining");
    expect(hudApi.setMode).toHaveBeenCalledWith("elapsed");
    expect(hudApi.toggleTopmost).toHaveBeenCalledTimes(1);
  });

  it("toggles mode from elapsed to remaining", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState({ mode: "elapsed" }));

    // act
    render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("mode-toggle")).toHaveTextContent("Elapsed");
    });
    fireEvent.click(screen.getByTestId("mode-toggle"));

    // assert
    expect(hudApi.setMode).toHaveBeenCalledWith("remaining");
  });

  it("falls back to default hud state when initial load fails", async () => {
    // arrange
    installRejectedHudApiMock();

    // act
    render(<HudApp />);

    // assert
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("0:0:0");
    });
    expect(screen.getByTestId("mode-toggle")).toHaveTextContent("Elapsed");
  });

  it("holds null clip transitions until timeout elapses", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });
    act(() => {
      hudApi.emit(
        makeState({
          clipColor: null,
          clipIndex: null,
          clipName: null,
          counterText: "9:9:9",
          trackIndex: 1,
        }),
      );
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          resolve();
        }, 95);
      });
    });

    // assert
    expect(screen.getByTestId("counter-text")).toHaveTextContent("9:9:9");
  });

  it("cancels pending null clip hold when a concrete clip arrives", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });
    act(() => {
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
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          resolve();
        }, 95);
      });
    });

    // assert
    expect(screen.getByTestId("counter-text")).toHaveTextContent("5:5:5");
  });

  it("unsubscribes listeners on unmount", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState());

    // act
    const view = render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("hud-root")).toBeInTheDocument();
    });
    view.unmount();

    // assert
    expect(hudApi.listenerCount()).toBe(0);
  });

  it("ignores hud state callbacks after unmount", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ counterText: "1:1:1" }),
    );

    // act
    const view = render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });
    view.unmount();
    act(() => {
      hudApi.emit(makeState({ counterText: "7:7:7" }));
    });

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
      setMode: vi.fn(() => Promise.resolve()),
      toggleTopmost: vi.fn(() => Promise.resolve()),
    });

    // act
    const view = render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });
    view.unmount();
    act(() => {
      listenerRef.current(makeState({ counterText: "9:9:9" }));
    });

    // assert
    expect(screen.queryByTestId("counter-text")).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not apply resolved initial state after unmount", async () => {
    // arrange
    const deferred = createDeferred<HudState>();
    const unsubscribe = vi.fn();
    stubHudApi({
      getInitialState: vi.fn(() => deferred.promise),
      onHudState: vi.fn(() => unsubscribe),
      setMode: vi.fn(() => Promise.resolve()),
      toggleTopmost: vi.fn(() => Promise.resolve()),
    });

    // act
    const view = render(<HudApp />);
    view.unmount();
    deferred.resolve(makeState({ counterText: "8:8:8" }));
    await act(async () => {
      await Promise.resolve();
    });

    // assert
    expect(screen.queryByTestId("hud-root")).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not apply rejected initial state fallback after unmount", async () => {
    // arrange
    const deferred = createDeferred<HudState>();
    const unsubscribe = vi.fn();
    stubHudApi({
      getInitialState: vi.fn(() => deferred.promise),
      onHudState: vi.fn(() => unsubscribe),
      setMode: vi.fn(() => Promise.resolve()),
      toggleTopmost: vi.fn(() => Promise.resolve()),
    });

    // act
    const view = render(<HudApp />);
    view.unmount();
    deferred.reject(new Error("boom"));
    await act(async () => {
      await Promise.resolve();
    });

    // assert
    expect(screen.queryByTestId("hud-root")).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("reuses held clip color during temporary null color updates", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(
      makeState({ clipColor: 0x112233, counterText: "2:2:2" }),
    );

    // act
    render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("2:2:2");
    });
    act(() => {
      hudApi.emit(
        makeState({
          clipColor: null,
          clipIndex: 1,
          counterText: "2:2:3",
          trackIndex: 0,
        }),
      );
    });

    // assert
    await waitFor(() => {
      expect(screen.getByTestId("clip-pill")).toHaveStyle(
        "background-color: rgb(17, 34, 51)",
      );
    });
  });

  it("clears pending handoff timeout during unmount cleanup", async () => {
    // arrange
    const hudApi = installResolvedHudApiMock(makeState());
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    // act
    const view = render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });
    act(() => {
      hudApi.emit(
        makeState({
          clipColor: null,
          clipIndex: null,
          counterText: "9:9:9",
          trackIndex: 1,
        }),
      );
    });
    view.unmount();

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
    render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("4:1:1");
    });
    await waitFor(() => {
      expect(screen.getByTestId("counter-text").parentElement).toHaveClass(
        "border-[#4a5a45]",
      );
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          resolve();
        }, 170);
      });
    });
    act(() => {
      hudApi.emit(
        makeState({
          beatFlashToken: 5,
          counterText: "4:1:2",
          isDownbeat: false,
          isLastBar: false,
        }),
      );
    });

    // assert
    expect(screen.getByTestId("counter-text").parentElement).not.toHaveClass(
      "border-[#4a5a45]",
    );
    expect(screen.getByTestId("counter-text")).toHaveTextContent("4:1:2");
  });
});
