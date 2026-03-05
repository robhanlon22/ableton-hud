import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HudState } from "../../../shared/types";

import { createDefaultHudState } from "../../../shared/ipc";
import { HudApp } from "./hud-app";

interface HudApiMock {
  api: Window["hudApi"];
  emit: (state: HudState) => void;
  listenerCount: () => number;
  setMode: ReturnType<typeof vi.fn>;
  toggleTopmost: ReturnType<typeof vi.fn>;
}

/**
 * Installs a controllable `window.hudApi` mock.
 * @param initialState - Initial state returned by `getInitialState`.
 * @param rejectInitialState - Whether initial-state lookup should reject.
 * @returns A controller for emitting state and asserting calls.
 */
function installHudApiMock(
  initialState: HudState,
  rejectInitialState = false,
): HudApiMock {
  const listeners = new Set<(state: HudState) => void>();
  const setMode = vi.fn((mode: HudState["mode"]) => {
    void mode;
    return Promise.resolve();
  });
  const toggleTopmost = vi.fn(() => Promise.resolve());

  const api: Window["hudApi"] = {
    getInitialState: rejectInitialState
      ? () => Promise.reject(new Error("boom"))
      : () => Promise.resolve(initialState),
    onHudState: (callback: (state: HudState) => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    setMode,
    toggleTopmost,
  };

  Object.defineProperty(window, "hudApi", {
    configurable: true,
    value: api,
    writable: true,
  });

  return {
    api,
    emit: (state: HudState) => {
      for (const listener of listeners) {
        listener(state);
      }
    },
    listenerCount: () => listeners.size,
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

describe("HudApp integration", () => {
  it("hydrates from hudApi and forwards toggle commands", async () => {
    const hudApi = installHudApiMock(
      makeState({
        alwaysOnTop: false,
        counterText: "3:2:1",
        mode: "remaining",
      }),
    );

    render(<HudApp />);

    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("3:2:1");
    });
    expect(screen.getByTestId("mode-toggle")).toHaveTextContent("Remaining");

    fireEvent.click(screen.getByTestId("mode-toggle"));
    expect(hudApi.setMode).toHaveBeenCalledWith("elapsed");

    fireEvent.click(
      screen.getByRole("button", { name: "Set window floating" }),
    );
    expect(hudApi.toggleTopmost).toHaveBeenCalledTimes(1);
  });

  it("toggles mode from elapsed to remaining", async () => {
    const hudApi = installHudApiMock(makeState({ mode: "elapsed" }));

    render(<HudApp />);

    await waitFor(() => {
      expect(screen.getByTestId("mode-toggle")).toHaveTextContent("Elapsed");
    });

    fireEvent.click(screen.getByTestId("mode-toggle"));
    expect(hudApi.setMode).toHaveBeenCalledWith("remaining");
  });

  it("falls back to default hud state when initial load fails", async () => {
    installHudApiMock(makeState({ counterText: "9:9:9" }), true);

    render(<HudApp />);

    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("0:0:0");
    });
    expect(screen.getByTestId("mode-toggle")).toHaveTextContent("Elapsed");
  });

  it("holds null clip transitions until timeout elapses", async () => {
    const hudApi = installHudApiMock(makeState({ counterText: "1:1:1" }));

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

    expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          resolve();
        }, 95);
      });
    });

    expect(screen.getByTestId("counter-text")).toHaveTextContent("9:9:9");
  });

  it("cancels pending null clip hold when a concrete clip arrives", async () => {
    const hudApi = installHudApiMock(makeState({ counterText: "1:1:1" }));

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

    expect(screen.getByTestId("counter-text")).toHaveTextContent("5:5:5");

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          resolve();
        }, 95);
      });
    });

    expect(screen.getByTestId("counter-text")).toHaveTextContent("5:5:5");
  });

  it("unsubscribes listeners on unmount", async () => {
    const hudApi = installHudApiMock(makeState());

    const view = render(<HudApp />);

    await waitFor(() => {
      expect(screen.getByTestId("hud-root")).toBeInTheDocument();
    });
    expect(hudApi.listenerCount()).toBe(1);

    view.unmount();

    expect(hudApi.listenerCount()).toBe(0);
  });

  it("ignores hud state callbacks after unmount", async () => {
    const hudApi = installHudApiMock(makeState({ counterText: "1:1:1" }));
    const view = render(<HudApp />);

    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });

    view.unmount();

    act(() => {
      hudApi.emit(makeState({ counterText: "7:7:7" }));
    });

    expect(hudApi.listenerCount()).toBe(0);
  });

  it("guards state updates when onHudState callback fires after unmount", async () => {
    let listener: ((state: HudState) => void) | null = null;

    Object.defineProperty(window, "hudApi", {
      configurable: true,
      value: {
        getInitialState: () =>
          Promise.resolve(makeState({ counterText: "1:1:1" })),
        onHudState: (callback: (state: HudState) => void) => {
          listener = callback;
          return () => {
            return;
          };
        },
        setMode: () => Promise.resolve(),
        toggleTopmost: () => Promise.resolve(),
      } satisfies Window["hudApi"],
      writable: true,
    });

    const view = render(<HudApp />);
    await waitFor(() => {
      expect(screen.getByTestId("counter-text")).toHaveTextContent("1:1:1");
    });

    view.unmount();

    act(() => {
      listener?.(makeState({ counterText: "9:9:9" }));
    });
  });

  it("does not apply resolved initial state after unmount", async () => {
    const resolveInitialRef: {
      current: ((value: HudState) => void) | null;
    } = { current: null };
    const initialPromise = new Promise<HudState>((resolve) => {
      resolveInitialRef.current = resolve;
    });

    Object.defineProperty(window, "hudApi", {
      configurable: true,
      value: {
        getInitialState: () => initialPromise,
        onHudState: () => () => {
          return;
        },
        setMode: () => Promise.resolve(),
        toggleTopmost: () => Promise.resolve(),
      } satisfies Window["hudApi"],
      writable: true,
    });

    const view = render(<HudApp />);
    view.unmount();

    if (!resolveInitialRef.current) {
      throw new Error("Expected resolveInitialRef to be initialized.");
    }
    resolveInitialRef.current(makeState({ counterText: "8:8:8" }));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("does not apply rejected initial state fallback after unmount", async () => {
    const rejectInitialRef: {
      current: ((reason?: unknown) => void) | null;
    } = { current: null };
    const initialPromise = new Promise<HudState>((_resolve, reject) => {
      rejectInitialRef.current = reject;
    });

    Object.defineProperty(window, "hudApi", {
      configurable: true,
      value: {
        getInitialState: () => initialPromise,
        onHudState: () => () => {
          return;
        },
        setMode: () => Promise.resolve(),
        toggleTopmost: () => Promise.resolve(),
      } satisfies Window["hudApi"],
      writable: true,
    });

    const view = render(<HudApp />);
    view.unmount();

    if (!rejectInitialRef.current) {
      throw new Error("Expected rejectInitialRef to be initialized.");
    }
    rejectInitialRef.current(new Error("boom"));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("reuses held clip color during temporary null color updates", async () => {
    const hudApi = installHudApiMock(
      makeState({ clipColor: 0x112233, counterText: "2:2:2" }),
    );

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

    await waitFor(() => {
      expect(screen.getByTestId("clip-pill")).toHaveStyle(
        "background-color: rgb(17, 34, 51)",
      );
    });
  });

  it("clears pending handoff timeout during unmount cleanup", async () => {
    const hudApi = installHudApiMock(makeState());
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
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

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("turns off flash state after the duration window", async () => {
    const hudApi = installHudApiMock(
      makeState({
        beatFlashToken: 5,
        counterText: "4:1:1",
        isDownbeat: false,
        isLastBar: false,
      }),
    );

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

    expect(screen.getByTestId("counter-text").parentElement).not.toHaveClass(
      "border-[#4a5a45]",
    );

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

    expect(screen.getByTestId("counter-text")).toHaveTextContent("4:1:2");
  });
});
