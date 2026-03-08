import type { HudApi } from "@renderer/app/hud-api";
import type { HudState } from "@shared/types";

import { createDefaultHudState } from "@shared/ipc";
import { vi } from "vitest";

export interface HudApiController {
  emit: (state: HudState) => void;
  listenerCount: () => number;
  setCompactView: SetCompactViewSpy;
  setMode: SetModeSpy;
  toggleTopmost: ToggleTopmostSpy;
  toggleTrackLock: ToggleTrackLockSpy;
}
interface Deferred<TValue> {
  promise: Promise<TValue>;
  reject: (reason?: unknown) => void;
  resolve: (value: TValue) => void;
}
type SetCompactViewSpy = ReturnType<typeof vi.fn<HudApi["setCompactView"]>>;
type SetModeSpy = ReturnType<typeof vi.fn<HudApi["setMode"]>>;

type ToggleTopmostSpy = ReturnType<typeof vi.fn<HudApi["toggleTopmost"]>>;

type ToggleTrackLockSpy = ReturnType<typeof vi.fn<HudApi["toggleTrackLock"]>>;

const ignoreValue = (value: unknown): void => {
  Reflect.has({ value }, "value");
};

const ignoreHudState = (state: HudState): void => {
  ignoreValue(state);
};

const createSetCompactViewSpy = (): SetCompactViewSpy => {
  return vi.fn<HudApi["setCompactView"]>((request) => {
    ignoreValue(request);
    return Promise.resolve();
  });
};

const createSetModeSpy = (): SetModeSpy => {
  return vi.fn<HudApi["setMode"]>((mode) => {
    ignoreValue(mode);
    return Promise.resolve();
  });
};

const createToggleTopmostSpy = (): ToggleTopmostSpy => {
  return vi.fn<HudApi["toggleTopmost"]>(() => Promise.resolve());
};

const createToggleTrackLockSpy = (): ToggleTrackLockSpy => {
  return vi.fn<HudApi["toggleTrackLock"]>(() => Promise.resolve());
};

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

export const makeHudState = (overrides: Partial<HudState> = {}): HudState => ({
  ...createDefaultHudState(),
  clipColor: 0x11_22_33,
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
});

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

export const stubHudApi = (hudApi: HudApi): void => {
  vi.stubGlobal("hudApi", hudApi);
};

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

export const installResolvedHudApiMock = (
  initialState: HudState,
): HudApiController => {
  let activeListener = ignoreHudState;
  let subscriptions = 0;
  const setCompactView = createSetCompactViewSpy();
  const setMode = createSetModeSpy();
  const toggleTopmost = createToggleTopmostSpy();
  const toggleTrackLock = createToggleTrackLockSpy();

  stubHudApi({
    getInitialState: () => Promise.resolve(initialState),
    onHudState: (callback: (state: HudState) => void) => {
      activeListener = callback;
      subscriptions = 1;
      return () => {
        activeListener = ignoreHudState;
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
};
