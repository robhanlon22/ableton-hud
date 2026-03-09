import type { HudApi } from "@renderer/app/hud/api";
import type { HudState } from "@shared/types";

import { createDefaultHudState } from "@shared/ipc";
import { vi } from "vitest";

/**
 *
 */
export interface HudApiController {
  /**
   *
   */
  emit: (state: HudState) => void;
  /**
   *
   */
  listenerCount: () => number;
  /**
   *
   */
  setCompactView: SetCompactViewSpy;
  /**
   *
   */
  setMode: SetModeSpy;
  /**
   *
   */
  toggleTopmost: ToggleTopmostSpy;
  /**
   *
   */
  toggleTrackLock: ToggleTrackLockSpy;
}
/**
 *
 */
interface Deferred<TValue> {
  /**
   *
   */
  promise: Promise<TValue>;
  /**
   *
   */
  reject: (reason?: unknown) => void;
  /**
   *
   */
  resolve: (value: TValue) => void;
}
/**
 *
 */
type SetCompactViewSpy = ReturnType<typeof vi.fn<HudApi["setCompactView"]>>;
/**
 *
 */
type SetModeSpy = ReturnType<typeof vi.fn<HudApi["setMode"]>>;

/**
 *
 */
type ToggleTopmostSpy = ReturnType<typeof vi.fn<HudApi["toggleTopmost"]>>;

/**
 *
 */
type ToggleTrackLockSpy = ReturnType<typeof vi.fn<HudApi["toggleTrackLock"]>>;

/**
 * Ignores a value while still exercising it for linted test helpers.
 * @param value - The value to acknowledge.
 */
const ignoreValue = (value: unknown): void => {
  if (value) {
    return;
  }
};

/**
 * Ignores a HUD state payload in listeners that should be inert.
 * @param state - The state payload to ignore.
 */
const ignoreHudState = (state: HudState): void => {
  ignoreValue(state);
};

/**
 * Creates a spy for compact-view IPC requests.
 * @returns The compact-view spy.
 */
const createSetCompactViewSpy = (): SetCompactViewSpy => {
  return vi.fn<HudApi["setCompactView"]>((request) => {
    ignoreValue(request);
    return Promise.resolve();
  });
};

/**
 * Creates a spy for counter-mode IPC requests.
 * @returns The counter-mode spy.
 */
const createSetModeSpy = (): SetModeSpy => {
  return vi.fn<HudApi["setMode"]>((mode) => {
    ignoreValue(mode);
    return Promise.resolve();
  });
};

/**
 * Creates a spy for topmost toggle IPC requests.
 * @returns The topmost toggle spy.
 */
const createToggleTopmostSpy = (): ToggleTopmostSpy => {
  return vi.fn<HudApi["toggleTopmost"]>(() => Promise.resolve());
};

/**
 * Creates a spy for track-lock IPC requests.
 * @returns The track-lock toggle spy.
 */
const createToggleTrackLockSpy = (): ToggleTrackLockSpy => {
  return vi.fn<HudApi["toggleTrackLock"]>(() => Promise.resolve());
};

/**
 * Creates a deferred promise for async test control over a generic value.
 * @returns Deferred resolve and reject handles.
 */
export const createDeferred = <TValue>(): Deferred<TValue> => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: TValue) => void;

  const promise = new Promise<TValue>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
};

/**
 * Builds a connected HUD state fixture with named metadata.
 * @param overrides - Partial state overrides to merge into the fixture.
 * @returns The HUD state fixture.
 */
export const makeHudState = (overrides: Partial<HudState> = {}): HudState => ({
  ...createDefaultHudState(),
  clipColor: 0x11_22_33,
  clipIndex: 1,
  clipName: "Clip A",
  connected: true,
  counterText: "1:1:1",
  isDownbeat: false,
  isPlaying: true,
  mode: "elapsed",
  sceneName: "Scene A",
  trackIndex: 0,
  trackName: "Track A",
  ...overrides,
});

/**
 * Builds a HUD state fixture with metadata placeholders.
 * @param overrides - Partial state overrides to merge into the fixture.
 * @returns The HUD state fixture.
 */
export const makeMetadataPlaceholderHudState = (
  overrides: Partial<HudState> = {},
): HudState => ({
  ...createDefaultHudState(),
  connected: true,
  counterText: "0:0:0",
  isPlaying: false,
  mode: "elapsed",
  ...overrides,
});

/**
 * Stubs the global HUD API for browser tests.
 * @param hudApi - The mock HUD API implementation.
 */
export const stubHudApi = (hudApi: HudApi): void => {
  vi.stubGlobal("hudApi", hudApi);
};

/**
 * Installs a HUD API mock whose initial-state request rejects.
 */
export const installRejectedHudApiMock = (): void => {
  stubHudApi({
    getInitialState: vi.fn(() => Promise.reject(new Error("boom"))),
    onHudState: vi.fn(() => vi.fn()),
    setCompactView: createSetCompactViewSpy(),
    setMode: createSetModeSpy(),
    toggleTopmost: createToggleTopmostSpy(),
    toggleTrackLock: createToggleTrackLockSpy(),
  });
};

/**
 * Installs a HUD API mock whose initial-state request resolves successfully.
 * @param initialState - The initial HUD state returned by the mock.
 * @returns A controller for driving and inspecting the mock.
 */
export const installResolvedHudApiMock = (
  initialState: HudState,
): HudApiController => {
  let activeListener = ignoreHudState;
  let subscriptions = 0;
  const setCompactView = createSetCompactViewSpy();
  const setMode = createSetModeSpy();
  const toggleTopmost = createToggleTopmostSpy();
  const toggleTrackLock = createToggleTrackLockSpy();

  /**
   * Resolves the mocked initial HUD state.
   * @returns The mocked initial state.
   */
  const getInitialState = (): Promise<HudState> =>
    Promise.resolve(initialState);

  /**
   * Clears the active HUD state listener subscription.
   */
  const removeListener = (): void => {
    activeListener = ignoreHudState;
    subscriptions = 0;
  };

  /**
   * Registers a HUD state listener on the mock API.
   * @param callback - The listener to register.
   * @returns An unsubscribe callback for the listener.
   */
  const onHudState = (callback: (state: HudState) => void): (() => void) => {
    activeListener = callback;
    subscriptions = 1;
    return removeListener;
  };

  stubHudApi({
    getInitialState,
    onHudState,
    setCompactView,
    setMode,
    toggleTopmost,
    toggleTrackLock,
  });

  /**
   * Emits a HUD state update through the active mock listener.
   * @param state - The state payload to emit.
   */
  const emit = (state: HudState): void => {
    activeListener(state);
  };

  /**
   * Reports the number of active HUD state subscriptions.
   * @returns The active subscription count.
   */
  const listenerCount = (): number => subscriptions;

  return {
    emit,
    listenerCount,
    setCompactView,
    setMode,
    toggleTopmost,
    toggleTrackLock,
  };
};
