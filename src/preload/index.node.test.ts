import { beforeEach, describe, expect, it, vi } from "vitest";

const exposeInMainWorldMock = vi.fn();
const invokeMock = vi.fn(
  (channel: string, ...args: unknown[]): Promise<unknown> => {
    void channel;
    void args;
    return Promise.resolve(undefined);
  },
);
const onMock = vi.fn();
const removeListenerMock = vi.fn();

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

describe("preload hudApi", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exposes hudApi and routes ipc calls", async () => {
    // arrange
    const statePayload = {
      alwaysOnTop: true,
      beatFlashToken: 0,
      beatInBar: 1,
      clipColor: null,
      clipIndex: null,
      clipName: null,
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
      lastBarSource: null,
      mode: "elapsed",
      sceneColor: null,
      sceneName: null,
      trackColor: null,
      trackIndex: null,
      trackLocked: false,
      trackName: null,
    };

    invokeMock.mockImplementation((channel: string) => {
      if (channel === "hud:get-initial-state") {
        return Promise.resolve(statePayload);
      }
      return Promise.resolve(undefined);
    });

    // act
    await import("./index");

    // assert
    expect(exposeInMainWorldMock).toHaveBeenCalledTimes(1);
    const api = exposeInMainWorldMock.mock.calls[0][1] as {
      getInitialState: () => Promise<unknown>;
      onHudState: (callback: (state: unknown) => void) => () => void;
      setCompactView: (request: {
        enabled: boolean;
        height?: number;
        width?: number;
      }) => Promise<void>;
      setMode: (mode: "elapsed" | "remaining") => Promise<void>;
      toggleTopmost: () => Promise<void>;
      toggleTrackLock: () => Promise<void>;
    };

    await api.getInitialState();
    await api.setMode("remaining");
    await api.setCompactView({
      enabled: true,
      height: 10,
      width: 20,
    });
    await api.toggleTopmost();
    await api.toggleTrackLock();

    const unsub = api.onHudState(() => undefined);
    expect(onMock).toHaveBeenCalledTimes(1);
    unsub();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hud:set-mode", "remaining");
    expect(invokeMock).toHaveBeenCalledWith("hud:toggle-topmost");
    expect(invokeMock).toHaveBeenCalledWith("hud:toggle-track-lock");
  });

  it("forwards only valid hud state payloads from ipc listener", async () => {
    // arrange
    const callback = vi.fn();
    const statePayload = {
      alwaysOnTop: true,
      beatFlashToken: 0,
      beatInBar: 1,
      clipColor: null,
      clipIndex: null,
      clipName: null,
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
      lastBarSource: null,
      mode: "elapsed",
      sceneColor: null,
      sceneName: null,
      trackColor: null,
      trackIndex: null,
      trackLocked: false,
      trackName: null,
    };

    await import("./index");
    const api = exposeInMainWorldMock.mock.calls[0][1] as {
      onHudState: (listener: (state: unknown) => void) => () => void;
    };
    api.onHudState(callback);
    const listener = onMock.mock.calls.at(-1)?.[1] as (
      event: unknown,
      state: unknown,
    ) => void;

    listener(
      {},
      {
        connected: true,
      },
    );
    // act
    listener({}, statePayload);

    // assert
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(statePayload);
  });
});
