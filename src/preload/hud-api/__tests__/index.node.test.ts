import type { HudState } from "@shared/types";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HudApi } from "../index";

type HudStateListener = (_event: unknown, state: unknown) => void;

const exposeInMainWorldMock = vi.fn<(key: string, value: unknown) => void>();
const invokeMock = vi.fn<
  (channel: string, ...arguments_: unknown[]) => Promise<unknown>
>(() => Promise.resolve());
const onMock = vi.fn<(channel: string, listener: HudStateListener) => void>();
const removeListenerMock =
  vi.fn<(channel: string, listener: HudStateListener) => void>();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock,
  },
  ipcRenderer: {
    invoke: invokeMock,
    on: onMock,
    removeListener: removeListenerMock,
  },
}));

/**
 * Creates a valid HUD state payload for preload tests.
 * @returns A valid HUD state fixture.
 */
function createStatePayload(): HudState {
  return {
    alwaysOnTop: true,
    beatFlashToken: 0,
    beatInBar: 1,
    clipColor: undefined,
    clipIndex: undefined,
    clipName: undefined,
    compactView: false,
    connected: false,
    counterParts: {
      bar: 0,
      beat: 0,
      sixteenth: 0,
    },
    counterText: "0:0:0",
    isDownbeat: true,
    isLastBar: false,
    isPlaying: false,
    lastBarSource: undefined,
    mode: "elapsed",
    sceneColor: undefined,
    sceneName: undefined,
    trackColor: undefined,
    trackIndex: undefined,
    trackLocked: false,
    trackName: undefined,
  };
}

/**
 * Returns the exposed HUD API object.
 * @returns The validated HUD API.
 */
function getHudApi(): HudApi {
  if (exposeInMainWorldMock.mock.calls.length === 0) {
    throw new TypeError("hudApi was not exposed.");
  }

  const firstExposeCall = exposeInMainWorldMock.mock.calls[0];
  const [, exposedValue] = firstExposeCall;
  if (!isHudApi(exposedValue)) {
    throw new TypeError("hudApi was not exposed in the expected shape.");
  }

  return exposedValue;
}

/**
 * Returns the last registered HUD state listener.
 * @returns The registered HUD state listener callback.
 */
function getHudStateListener(): HudStateListener {
  const listener = onMock.mock.calls.at(-1)?.[1];
  if (!isHudStateListener(listener)) {
    throw new TypeError("hud state listener was not registered.");
  }

  return listener;
}

/**
 * Checks whether a value matches the HUD preload API contract.
 * @param value - Candidate value to validate.
 * @returns Whether the value is a HUD API implementation.
 */
function isHudApi(value: unknown): value is HudApi {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "getInitialState" in value &&
    "onHudState" in value &&
    "setCompactView" in value &&
    "setMode" in value &&
    "toggleTopmost" in value &&
    "toggleTrackLock" in value
  );
}

/**
 * Checks whether a value is a HUD state listener.
 * @param value - Candidate value to validate.
 * @returns Whether the value is a HUD state listener callback.
 */
function isHudStateListener(value: unknown): value is HudStateListener {
  return typeof value === "function";
}

describe("preload hudApi exposure", () => {
  beforeEach(() => {
    vi.resetModules();
    exposeInMainWorldMock.mockReset();
    invokeMock.mockReset();
    onMock.mockReset();
    removeListenerMock.mockReset();
  });

  it("exposes hudApi and routes ipc calls", async () => {
    // arrange
    const statePayload = createStatePayload();
    invokeMock.mockImplementation((channel: string) => {
      if (channel === "hud:get-initial-state") {
        return Promise.resolve(statePayload);
      }
      return Promise.resolve();
    });

    // act
    const { exposeHudApi } = await import("../index");
    exposeHudApi();
    const api = getHudApi();

    // assert
    await api.getInitialState();
    await api.setMode("remaining");
    await api.setCompactView({
      enabled: true,
      height: 10,
      width: 20,
    });
    await api.toggleTopmost();
    await api.toggleTrackLock();

    const listener = vi.fn<(state: unknown) => void>();
    const unsubscribe = api.onHudState(listener);
    expect(onMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorldMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hud:set-mode", "remaining");
    expect(invokeMock).toHaveBeenCalledWith("hud:toggle-topmost");
    expect(invokeMock).toHaveBeenCalledWith("hud:toggle-track-lock");
  });
});

describe("preload hudApi listener validation", () => {
  beforeEach(() => {
    vi.resetModules();
    exposeInMainWorldMock.mockReset();
    invokeMock.mockReset();
    onMock.mockReset();
    removeListenerMock.mockReset();
  });

  it("forwards only valid hud state payloads from ipc listener", async () => {
    // arrange
    const callback = vi.fn();
    const statePayload = createStatePayload();

    // act
    const { exposeHudApi } = await import("../index");
    exposeHudApi();
    getHudApi().onHudState(callback);
    const listener = getHudStateListener();
    listener(
      {},
      {
        connected: true,
      },
    );
    listener({}, statePayload);

    // assert
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(statePayload);
  });
});
