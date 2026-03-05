import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClipTimingMeta, HudMode, HudState } from "../shared/types";

interface BridgeOverrides {
  host?: string;
  port?: string;
  websocketUndefined?: boolean;
}
interface BridgeRuntime {
  activeClip: null | { clip: number; track: number };
  activeScene: null | number;
  applySelectedTrack: (trackIndex: number) => Promise<void>;
  beatCounter: number;
  beatFlashToken: number;
  bootstrap: () => Promise<void>;
  clearClipSubscription: (preserveDisplay?: boolean) => void;
  clearObserverGroup: (cleanups: (() => Promise<void> | void)[]) => void;
  clearSceneSubscription: (preserveDisplay?: boolean) => void;
  clipColor: null | number;
  clipMeta: ClipTimingMeta;
  clipName: null | string;
  clipObserverCleanups: Cleanup[];
  connected: boolean;
  currentPosition: null | number;
  emit: () => void;
  getTrack: (trackIndex: number) => Promise<null | RuntimeTrack>;
  handlePlayingPosition: (position: number) => void;
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  handleSelectedTrack: (trackIndex: number) => void;
  handleSelectedTrackPayload: (payload: unknown) => Promise<void>;
  handleSongTime: (songTime: number) => void;
  isNaturalLoopWrap: (
    previousPosition: number,
    currentPosition: number,
  ) => boolean;
  isPlaying: boolean;
  launchPosition: null | number;
  loopWrapCount: number;
  mode: HudMode;
  pendingSelectedTrack: null | number;
  previousPosition: null | number;
  registerCleanup: (cleanupGroup: Cleanup[], stop: Cleanup | null) => void;

  resetClipRunState: () => void;
  resolveTrackIndex: (selectedTrack: unknown) => Promise<number>;
  safeClipGet: (clip: RuntimeClip, property: ClipProperty) => Promise<unknown>;
  safeClipObserve: (
    clip: RuntimeClip,
    property: ClipProperty,
    listener: Observer,
  ) => Promise<Cleanup | null>;
  safeClipSlotClip: (clipSlot: RuntimeClipSlot) => Promise<null | RuntimeClip>;
  safeClipSlotGet: (
    clipSlot: RuntimeClipSlot,
    property: "has_clip",
  ) => Promise<unknown>;
  safeSceneGet: (
    scene: RuntimeScene,
    property: SceneProperty,
  ) => Promise<unknown>;
  safeSceneObserve: (
    scene: RuntimeScene,
    property: SceneProperty,
    listener: Observer,
  ) => Promise<Cleanup | null>;
  safeSongGet: (property: SongProperty) => Promise<unknown>;
  safeSongObserve: (
    property: SongProperty,
    listener: Observer,
  ) => Promise<Cleanup | null>;
  safeSongSceneChild: (sceneIndex: number) => Promise<null | RuntimeScene>;
  safeSongTracks: () => Promise<RuntimeTrack[]>;
  safeSongViewGet: (property: "selected_track") => Promise<unknown>;
  safeSongViewObserve: (
    property: "selected_track",
    listener: Observer,
  ) => Promise<Cleanup | null>;
  safeTrackChild: (
    track: RuntimeTrack,
    clipSlotIndex: number,
  ) => Promise<null | RuntimeClipSlot>;
  safeTrackGet: (
    track: RuntimeTrack,
    property: TrackProperty,
  ) => Promise<unknown>;
  safeTrackObserve: (
    track: RuntimeTrack,
    property: TrackProperty,
    listener: Observer,
  ) => Promise<Cleanup | null>;
  sceneColor: null | number;
  sceneName: null | string;
  sceneObserverCleanups: Cleanup[];
  selectedTrack: null | number;
  selectedTrackToken: number;
  setMode: (mode: HudMode) => void;
  setTrackLocked: (trackLocked: boolean) => void;
  signatureDenominator: number;
  signatureNumerator: number;
  song: RuntimeSong;
  songView: RuntimeSongView;
  start: () => void;
  stop: () => void;
  subscribeClip: (
    trackIndex: number,
    slotIndex: number,
    clip: RuntimeClip,
    token: number,
  ) => Promise<void>;
  subscribeScene: (sceneIndex: number, token: number) => Promise<void>;
  toggleTrackLock: () => boolean;
  trackColor: null | number;
  trackLocked: boolean;
  trackName: null | string;
  trackObserverCleanups: Cleanup[];
  transitionInProgress: boolean;
}

type Cleanup = () => void;
type ClipProperty =
  | "color"
  | "length"
  | "loop_end"
  | "loop_start"
  | "looping"
  | "name"
  | "playing_position";
interface LiveHarness {
  eventHandlers: Map<string, () => void>;
  instance: {
    connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
    disconnect: ReturnType<typeof vi.fn<() => void>>;
    on: ReturnType<typeof vi.fn<(event: string, cb: () => void) => void>>;
    song: RuntimeSong;
    songView: RuntimeSongView;
  };
  options: null | { host: string; port: number };
}
type Observer = (value: unknown) => void;

interface RuntimeClip {
  get: (property: ClipProperty) => Promise<unknown>;
  observe: (property: ClipProperty, listener: Observer) => Promise<unknown>;
}

interface RuntimeClipSlot {
  clip: () => Promise<unknown>;
  get: (property: "has_clip") => Promise<unknown>;
}

interface RuntimeScene {
  get: (property: SceneProperty) => Promise<unknown>;
  observe: (property: SceneProperty, listener: Observer) => Promise<unknown>;
}

interface RuntimeSong {
  child: (child: "scenes" | "tracks", index: number) => Promise<unknown>;
  children: (child: "tracks") => Promise<unknown>;
  get: (property: SongProperty) => Promise<unknown>;
  observe: (property: SongProperty, listener: Observer) => Promise<unknown>;
}

interface RuntimeSongView {
  get: (property: "selected_track") => Promise<unknown>;
  observe: (property: "selected_track", listener: Observer) => Promise<unknown>;
}

interface RuntimeTrack {
  child: (child: "clip_slots", index: number) => Promise<unknown>;
  get: (property: TrackProperty) => Promise<unknown>;
  id?: number;
  observe: (property: TrackProperty, listener: Observer) => Promise<unknown>;
  path?: null | string;
  raw?: {
    id?: number | string;
    path?: null | string;
  };
}

type SceneProperty = "color" | "name";

type SongProperty =
  | "current_song_time"
  | "is_playing"
  | "signature_denominator"
  | "signature_numerator";

type TrackProperty = "color" | "name" | "playing_slot_index";

const wsCtorMock = vi.fn();
let activeHarness: LiveHarness | null = null;
const abletonLiveCtorMock = vi.fn((options: { host: string; port: number }) => {
  if (!activeHarness) {
    throw new Error("missing harness");
  }
  activeHarness.options = options;
  return activeHarness.instance;
});
const abletonLiveMock = vi.fn(function ctor(
  this: unknown,
  options: { host: string; port: number },
) {
  return abletonLiveCtorMock(options);
});

vi.mock("ws", () => ({ default: wsCtorMock }));
vi.mock("ableton-live", () => ({ AbletonLive: abletonLiveMock }));

/**
 * Creates a bridge instance with optional environment overrides.
 * @param overrides - Optional host/port and websocket setup overrides.
 * @returns A typed bridge test harness bundle.
 */
async function createBridge(overrides?: BridgeOverrides): Promise<{
  bridge: BridgeRuntime;
  harness: LiveHarness;
  onState: ReturnType<typeof vi.fn<(state: HudState) => void>>;
}> {
  vi.resetModules();

  if (overrides?.host === undefined) {
    delete process.env.AOSC_LIVE_HOST;
  } else {
    process.env.AOSC_LIVE_HOST = overrides.host;
  }

  if (overrides?.port === undefined) {
    delete process.env.AOSC_LIVE_PORT;
  } else {
    process.env.AOSC_LIVE_PORT = overrides.port;
  }

  if (overrides?.websocketUndefined) {
    vi.stubGlobal("WebSocket", undefined);
  }

  activeHarness = createHarness();
  const module = await import("./ableton-live-bridge");
  const onState = vi.fn<(state: HudState) => void>();
  const bridge = new module.AbletonLiveBridge("elapsed", onState, false);

  return {
    bridge: bridge as unknown as BridgeRuntime,
    harness: activeHarness,
    onState,
  };
}

/**
 * Creates a default mocked Live harness.
 * @returns A harness object with tracked event handlers and mocked endpoints.
 */
function createHarness(): LiveHarness {
  const eventHandlers = new Map<string, () => void>();
  const song: RuntimeSong = {
    child: vi.fn(() => resolved(null)),
    children: vi.fn(() => resolved([])),
    get: vi.fn(() => resolved(0)),
    observe: vi.fn(() => resolved(null)),
  };
  const songView: RuntimeSongView = {
    get: vi.fn(() => resolved(null)),
    observe: vi.fn(() => resolved(null)),
  };

  return {
    eventHandlers,
    instance: {
      connect: vi.fn(() => resolved(undefined)),
      disconnect: vi.fn(() => undefined),
      on: vi.fn((event: string, cb: () => void) => {
        eventHandlers.set(event, cb);
      }),
      song,
      songView,
    },
    options: null,
  };
}

/**
 * Creates a minimal runtime track object for tests.
 * @param overrides - Optional track fields to override.
 * @returns A runtime track with default no-op methods.
 */
function createRuntimeTrack(overrides?: Partial<RuntimeTrack>): RuntimeTrack {
  return {
    child: () => resolved(null),
    get: () => resolved(null),
    observe: () => resolved(null),
    ...overrides,
  };
}

/**
 * Waits for queued microtasks to settle.
 * @returns A promise that resolves after two microtask ticks.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Creates a rejected promise with the provided error.
 * @param error - The error to reject with.
 * @returns A rejected promise.
 */
function rejected(error: Error): Promise<never> {
  return Promise.reject(error);
}

/**
 * Wraps a value in a resolved promise.
 * @param value - The value to resolve.
 * @returns A resolved promise containing the value.
 */
function resolved<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

describe("AbletonLiveBridge", () => {
  beforeEach(() => {
    delete process.env.AOSC_LIVE_HOST;
    delete process.env.AOSC_LIVE_PORT;
    activeHarness = null;
  });

  it("resolves host/port config and installs ws fallback", async () => {
    const { harness } = await createBridge({
      host: "10.0.0.25",
      port: "9999",
      websocketUndefined: true,
    });

    expect(harness.options).toEqual({ host: "10.0.0.25", port: 9999 });
    expect(globalThis.WebSocket).toBe(wsCtorMock);
  });

  it("falls back to default port for invalid env input", async () => {
    const { harness } = await createBridge({ port: "70000" });

    expect(harness.options).toEqual({ host: "127.0.0.1", port: 9001 });
  });

  it("registers connect and disconnect handlers and controls start/stop", async () => {
    const { bridge, harness, onState } = await createBridge();

    bridge.start();
    bridge.start();
    await flushMicrotasks();

    expect(harness.instance.connect).toHaveBeenCalledTimes(1);

    const connectHandler = harness.eventHandlers.get("connect");
    const disconnectHandler = harness.eventHandlers.get("disconnect");
    expect(connectHandler).toBeTypeOf("function");
    expect(disconnectHandler).toBeTypeOf("function");

    connectHandler?.();
    await flushMicrotasks();
    disconnectHandler?.();

    bridge.stop();

    expect(harness.instance.disconnect).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalled();
  });

  it("handles connect failure by emitting disconnected state", async () => {
    const { bridge, harness, onState } = await createBridge();
    harness.instance.connect.mockRejectedValueOnce(new Error("boom"));

    bridge.start();
    await flushMicrotasks();

    expect(onState).toHaveBeenCalled();
    expect(onState.mock.lastCall?.[0].connected).toBe(false);
  });

  it("updates mode and toggles track lock", async () => {
    const { bridge, onState } = await createBridge();
    const emitSpy = vi.spyOn(bridge, "emit");

    bridge.setTrackLocked(false);
    bridge.setMode("remaining");

    const toggled = bridge.toggleTrackLock();
    const toggledBack = bridge.toggleTrackLock();

    expect(toggled).toBe(true);
    expect(toggledBack).toBe(false);
    expect(emitSpy).toHaveBeenCalled();
    expect(onState).toHaveBeenCalled();
  });

  it("applies pending selected track when unlocking", async () => {
    const { bridge } = await createBridge();
    bridge.trackLocked = true;
    bridge.pendingSelectedTrack = 8;
    const applySpy = vi
      .spyOn(bridge, "applySelectedTrack")
      .mockImplementation(() => resolved(undefined));

    bridge.setTrackLocked(false);

    expect(applySpy).toHaveBeenCalledWith(8);
    expect(bridge.pendingSelectedTrack).toBeNull();
  });

  it("resolves track indexes from ids and path payloads", async () => {
    const { bridge } = await createBridge();
    bridge.safeSongTracks = vi.fn(() =>
      resolved([
        createRuntimeTrack({ id: 42, path: "live_set tracks 3" }),
        createRuntimeTrack({ raw: { id: "77", path: "live_set tracks 11" } }),
      ]),
    );

    expect(await bridge.resolveTrackIndex(42)).toBe(3);
    expect(await bridge.resolveTrackIndex(77)).toBe(11);
    expect(await bridge.resolveTrackIndex(19)).toBe(19);
    expect(await bridge.resolveTrackIndex({ path: "live_set tracks 5" })).toBe(
      5,
    );
    expect(
      await bridge.resolveTrackIndex({ raw: { path: "live_set tracks 6" } }),
    ).toBe(6);
    expect(await bridge.resolveTrackIndex({ path: "x y z" })).toBe(-1);
  });

  it("handles selected-track guard paths and payload resolution", async () => {
    const { bridge } = await createBridge();
    const applySpy = vi
      .spyOn(bridge, "applySelectedTrack")
      .mockImplementation(() => resolved(undefined));
    bridge.selectedTrack = 2;
    bridge.trackLocked = true;

    bridge.handleSelectedTrack(-1);
    bridge.handleSelectedTrack(2);
    bridge.handleSelectedTrack(4);

    expect(bridge.pendingSelectedTrack).toBe(4);
    expect(applySpy).toHaveBeenCalledWith(2);

    bridge.trackLocked = false;
    bridge.resolveTrackIndex = vi.fn(() => resolved(7));
    await bridge.handleSelectedTrackPayload({ path: "live_set tracks 7" });

    expect(applySpy).toHaveBeenCalledWith(7);
  });

  it("applies selected track and wires observer updates", async () => {
    const { bridge } = await createBridge();
    const listeners = new Map<string, Observer>();
    const cleanup = vi.fn(() => undefined);

    const track: RuntimeTrack = {
      child: vi.fn(() => resolved(null)),
      get: vi.fn((prop: TrackProperty) => {
        if (prop === "name") {
          return resolved("Bass");
        }
        if (prop === "color") {
          return resolved(255);
        }
        return resolved(3);
      }),
      observe: vi.fn((prop: TrackProperty, listener: Observer) => {
        listeners.set(prop, listener);
        return resolved(cleanup);
      }),
    };

    bridge.getTrack = vi.fn(() => resolved(track));
    const slotSpy = vi
      .spyOn(bridge, "handlePlayingSlot")
      .mockImplementation(() => resolved(undefined));

    await bridge.applySelectedTrack(1);
    listeners.get("name")?.("Lead");
    listeners.get("color")?.(16777215);
    listeners.get("playing_slot_index")?.(5);

    expect(bridge.selectedTrack).toBe(1);
    expect(bridge.trackName).toBe("Lead");
    expect(bridge.trackColor).toBe(16777215);
    expect(slotSpy).toHaveBeenCalledWith(3);
    expect(slotSpy).toHaveBeenCalledWith(5);
    expect(bridge.trackObserverCleanups).toHaveLength(3);
  });

  it("covers selected-track early returns and token changes", async () => {
    const { bridge } = await createBridge();
    const safeTrackGetSpy = vi.spyOn(bridge, "safeTrackGet");

    bridge.selectedTrack = 12;
    await bridge.applySelectedTrack(12);
    expect(safeTrackGetSpy).not.toHaveBeenCalled();

    bridge.getTrack = vi.fn(() => {
      bridge.selectedTrackToken += 1;
      return resolved({
        child: vi.fn(() => resolved(null)),
        get: vi.fn(() => resolved("x")),
        observe: vi.fn(() => resolved(vi.fn(() => undefined))),
      });
    });
    await bridge.applySelectedTrack(2);
    expect(safeTrackGetSpy).not.toHaveBeenCalled();

    bridge.getTrack = vi.fn(() => resolved(null));
    await bridge.applySelectedTrack(4);
    expect(bridge.selectedTrack).toBe(4);

    const track: RuntimeTrack = {
      child: vi.fn(() => resolved(null)),
      get: vi.fn((property: TrackProperty) => {
        if (property === "playing_slot_index") {
          bridge.selectedTrackToken += 1;
          return resolved(6);
        }
        return resolved(1);
      }),
      observe: vi.fn(() => resolved(vi.fn(() => undefined))),
    };
    bridge.getTrack = vi.fn(() => resolved(track));
    const slotSpy = vi
      .spyOn(bridge, "handlePlayingSlot")
      .mockImplementation(() => resolved(undefined));
    await bridge.applySelectedTrack(6);
    expect(slotSpy).not.toHaveBeenCalled();
  });

  it("covers applySelectedTrack observer guard no-op branches", async () => {
    const { bridge } = await createBridge();
    const listeners = new Map<string, Observer>();
    const track: RuntimeTrack = {
      child: vi.fn(() => resolved(null)),
      get: vi.fn(() => resolved(1)),
      observe: vi.fn((prop: TrackProperty, listener: Observer) => {
        listeners.set(prop, listener);
        return resolved(vi.fn(() => undefined));
      }),
    };

    bridge.getTrack = vi.fn(() => resolved(track));
    const slotSpy = vi
      .spyOn(bridge, "handlePlayingSlot")
      .mockImplementation(() => resolved(undefined));

    await bridge.applySelectedTrack(0);
    bridge.selectedTrack = 7;

    listeners.get("playing_slot_index")?.(8);
    listeners.get("name")?.(9876);
    listeners.get("color")?.("not-a-number");

    expect(slotSpy).toHaveBeenCalledTimes(1);
    expect(bridge.trackName).toBe("1");
    expect(bridge.trackColor).toBe(1);
  });

  it("covers handlePlayingSlot guards and token mismatch returns", async () => {
    const { bridge } = await createBridge();
    const clearSpy = vi.spyOn(bridge, "clearClipSubscription");
    const emitSpy = vi.spyOn(bridge, "emit");

    await bridge.handlePlayingSlot(1);
    expect(clearSpy).not.toHaveBeenCalled();

    bridge.selectedTrack = 3;
    bridge.isPlaying = true;
    await bridge.handlePlayingSlot(-1);
    expect(clearSpy).not.toHaveBeenCalled();

    bridge.isPlaying = false;
    await bridge.handlePlayingSlot(-1);
    expect(clearSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();

    bridge.activeClip = { clip: 2, track: 3 };
    await bridge.handlePlayingSlot(2);

    bridge.activeClip = null;
    bridge.selectedTrackToken = 10;
    bridge.subscribeScene = vi.fn(() => resolved(undefined));
    bridge.getTrack = vi.fn(() => resolved({} as RuntimeTrack));
    bridge.safeTrackChild = vi.fn(() => resolved({} as RuntimeClipSlot));
    bridge.safeClipSlotGet = vi.fn(() => resolved(true));
    bridge.safeClipSlotClip = vi.fn(() => resolved({} as RuntimeClip));
    const subscribeClipSpy = vi
      .spyOn(bridge, "subscribeClip")
      .mockImplementation(() => resolved(undefined));

    await bridge.handlePlayingSlot(4);
    expect(subscribeClipSpy).toHaveBeenCalledWith(3, 4, {}, 10);

    bridge.safeClipSlotGet = vi.fn(() => resolved(false));
    await bridge.handlePlayingSlot(6);
    expect(subscribeClipSpy).toHaveBeenCalledTimes(1);

    bridge.selectedTrack = 2;
    bridge.selectedTrackToken = 50;
    bridge.subscribeScene = vi.fn(() => resolved(undefined));
    bridge.safeTrackChild = vi.fn(() => resolved({} as RuntimeClipSlot));
    bridge.safeClipSlotGet = vi.fn(() => resolved(true));
    bridge.safeClipSlotClip = vi.fn(() => resolved({} as RuntimeClip));

    bridge.getTrack = vi.fn(() => {
      bridge.selectedTrackToken += 1;
      return resolved({} as RuntimeTrack);
    });
    await bridge.handlePlayingSlot(1);

    bridge.selectedTrackToken = 60;
    bridge.getTrack = vi.fn(() => resolved({} as RuntimeTrack));
    bridge.safeTrackChild = vi.fn(() => {
      bridge.selectedTrackToken += 1;
      return resolved({} as RuntimeClipSlot);
    });
    await bridge.handlePlayingSlot(2);

    bridge.selectedTrackToken = 70;
    bridge.safeTrackChild = vi.fn(() => resolved({} as RuntimeClipSlot));
    bridge.safeClipSlotGet = vi.fn(() => {
      bridge.selectedTrackToken += 1;
      return resolved(true);
    });
    await bridge.handlePlayingSlot(3);

    bridge.selectedTrackToken = 80;
    bridge.safeClipSlotGet = vi.fn(() => resolved(true));
    bridge.safeClipSlotClip = vi.fn(() => {
      bridge.selectedTrackToken += 1;
      return resolved({} as RuntimeClip);
    });
    await bridge.handlePlayingSlot(4);
  });

  it("tracks song time and clip position with natural and non-natural wraps", async () => {
    const { bridge, onState } = await createBridge();

    bridge.handleSongTime(0.2);
    bridge.handleSongTime(0.4);
    bridge.handleSongTime(1.05);

    expect(bridge.beatCounter).toBe(1);
    expect(bridge.beatFlashToken).toBe(1);
    expect(onState).toHaveBeenCalledTimes(2);

    bridge.clipMeta = { length: 8, loopEnd: 4, looping: true, loopStart: 1 };
    bridge.handlePlayingPosition(3);
    bridge.handlePlayingPosition(1.2);
    expect(bridge.loopWrapCount).toBe(1);

    bridge.handlePlayingPosition(0.1);
    expect(bridge.loopWrapCount).toBe(0);

    bridge.clipMeta = { length: 8, loopEnd: 1, looping: false, loopStart: 1 };
    expect(bridge.isNaturalLoopWrap(3, 1)).toBe(false);
  });

  it("emits loop-end and clip-end states including transition return", async () => {
    const { bridge, onState } = await createBridge();

    const before = onState.mock.calls.length;
    bridge.transitionInProgress = true;
    bridge.emit();
    expect(onState.mock.calls.length).toBe(before);

    bridge.transitionInProgress = false;
    bridge.connected = true;
    bridge.isPlaying = true;
    bridge.sceneColor = 0;
    bridge.sceneName = "Scene";
    bridge.trackName = "Track";
    bridge.trackColor = 123;
    bridge.activeClip = { clip: 1, track: 2 };
    bridge.clipName = "Clip";
    bridge.clipColor = 456;
    bridge.currentPosition = 3.5;
    bridge.launchPosition = 0;
    bridge.mode = "elapsed";
    bridge.clipMeta = { length: 16, loopEnd: 4, looping: true, loopStart: 2 };
    bridge.emit();

    expect(onState.mock.lastCall?.[0].lastBarSource).toBe("loop_end");
    expect(onState.mock.lastCall?.[0].sceneColor).toBeNull();

    bridge.mode = "remaining";
    bridge.clipMeta = { length: 16, loopEnd: 8, looping: true, loopStart: 2 };
    bridge.currentPosition = 1.5;
    bridge.launchPosition = null;
    bridge.emit();
    expect(onState.mock.lastCall?.[0].lastBarSource).toBe("loop_end");

    bridge.clipMeta = { length: 4, loopEnd: 2, looping: true, loopStart: 2 };
    bridge.currentPosition = 3.25;
    bridge.emit();
    expect(onState.mock.lastCall?.[0].lastBarSource).toBe("clip_end");
    expect(onState.mock.lastCall?.[0].trackIndex).toBe(2);
  });

  it("bootstraps observers and applies callback updates", async () => {
    const { bridge } = await createBridge();
    const songListeners = new Map<string, Observer>();
    const selectedTrackRef: { current: null | Observer } = {
      current: null,
    };

    bridge.safeSongViewObserve = vi.fn((_, listener: Observer) => {
      selectedTrackRef.current = listener;
      return resolved(vi.fn(() => undefined));
    });
    bridge.safeSongObserve = vi.fn(
      (property: SongProperty, listener: Observer) => {
        songListeners.set(property, listener);
        return resolved(vi.fn(() => undefined));
      },
    );
    bridge.safeSongGet = vi.fn((property: SongProperty) => {
      if (property === "signature_numerator") {
        return resolved(7);
      }
      if (property === "signature_denominator") {
        return resolved(8);
      }
      if (property === "is_playing") {
        return resolved("true");
      }
      return resolved(12.2);
    });
    bridge.safeSongViewGet = vi.fn(() =>
      resolved({ path: "live_set tracks 2" }),
    );
    bridge.resolveTrackIndex = vi.fn(() => resolved(2));
    const selectedSpy = vi.spyOn(bridge, "handleSelectedTrack");

    await bridge.bootstrap();

    selectedTrackRef.current?.({ path: "live_set tracks 5" });
    songListeners.get("signature_numerator")?.(9);
    songListeners.get("signature_denominator")?.(16);
    songListeners.get("is_playing")?.("1");
    songListeners.get("current_song_time")?.(14.2);

    expect(selectedSpy).toHaveBeenCalledWith(2);
    expect(bridge.signatureNumerator).toBe(9);
    expect(bridge.signatureDenominator).toBe(16);
    expect(bridge.isPlaying).toBe(true);
  });

  it("subscribes scene and covers scene guard branches", async () => {
    const { bridge } = await createBridge();
    const sceneListeners = new Map<string, Observer>();
    const cleanup = vi.fn(() => undefined);
    const scene: RuntimeScene = {
      get: vi.fn((prop: SceneProperty) =>
        resolved(prop === "name" ? "Verse" : 0),
      ),
      observe: vi.fn((prop: SceneProperty, listener: Observer) => {
        sceneListeners.set(prop, listener);
        return resolved(cleanup);
      }),
    };

    bridge.selectedTrackToken = 2;
    bridge.activeScene = 5;
    bridge.safeSongSceneChild = vi.fn(() => resolved(scene));

    await bridge.subscribeScene(5, 2);
    sceneListeners.get("name")?.("Chorus");
    sceneListeners.get("color")?.(16711680);

    expect(bridge.sceneName).toBe("Chorus");
    expect(bridge.sceneColor).toBe(16711680);

    await bridge.subscribeScene(5, 3);

    bridge.activeScene = 99;
    sceneListeners.get("name")?.({ bad: true });
    sceneListeners.get("color")?.(3);

    bridge.activeScene = 4;
    bridge.selectedTrackToken = 6;
    bridge.safeSceneGet = vi.fn((_, prop: SceneProperty) => {
      if (prop === "color") {
        bridge.selectedTrackToken += 1;
      }
      return resolved(prop === "name" ? "Refrain" : 4);
    });
    bridge.safeSongSceneChild = vi.fn(() => resolved(scene));
    await bridge.subscribeScene(4, 6);
  });

  it("subscribes clip and covers clip guard branches", async () => {
    const { bridge } = await createBridge();
    const clipListeners = new Map<string, Observer>();
    const cleanup = vi.fn(() => undefined);
    const clip: RuntimeClip = {
      get: vi.fn((prop: ClipProperty) => {
        if (prop === "playing_position") {
          return resolved(1.25);
        }
        if (prop === "color") {
          return resolved(1);
        }
        if (prop === "name") {
          return resolved("Clip A");
        }
        if (prop === "length") {
          return resolved(8);
        }
        if (prop === "loop_start") {
          return resolved(1);
        }
        if (prop === "loop_end") {
          return resolved(7);
        }
        return resolved(true);
      }),
      observe: vi.fn((prop: ClipProperty, listener: Observer) => {
        clipListeners.set(prop, listener);
        return resolved(cleanup);
      }),
    };

    bridge.activeClip = { clip: 1, track: 0 };
    bridge.selectedTrackToken = 9;

    await bridge.subscribeClip(0, 1, clip, 9);
    clipListeners.get("name")?.("Clip B");
    clipListeners.get("color")?.(2);
    clipListeners.get("length")?.(16);
    clipListeners.get("loop_start")?.(2);
    clipListeners.get("loop_end")?.(14);
    clipListeners.get("looping")?.(0);
    clipListeners.get("playing_position")?.(3);

    bridge.activeClip = { clip: 99, track: 0 };
    clipListeners.get("name")?.("ignored");
    clipListeners.get("playing_position")?.(99);
    clipListeners.get("color")?.("hello");
    clipListeners.get("length")?.(999);
    clipListeners.get("loop_start")?.(999);
    clipListeners.get("loop_end")?.(999);
    clipListeners.get("looping")?.("true");

    bridge.activeClip = { clip: 1, track: 0 };
    bridge.selectedTrackToken = 31;
    bridge.safeClipGet = vi.fn((_, prop: ClipProperty) => {
      if (prop === "playing_position") {
        bridge.selectedTrackToken += 1;
      }
      if (prop === "name") {
        return resolved({ bad: true });
      }
      return resolved(1);
    });
    await bridge.subscribeClip(0, 1, clip, 31);

    expect(bridge.clipName).toBe("Clip B");
  });

  it("covers wrappers, reset helpers, and conversion branches", async () => {
    const { bridge } = await createBridge();

    const cleanupOk = vi.fn(() => undefined);
    const cleanupFail = vi.fn(() => rejected(new Error("fail")));
    bridge.clearObserverGroup([cleanupOk, cleanupFail]);
    await flushMicrotasks();

    bridge.sceneName = "Scene";
    bridge.sceneColor = 1;
    bridge.clipName = "Clip";
    bridge.clipColor = 2;
    bridge.activeClip = { clip: 1, track: 1 };
    bridge.activeScene = 1;
    bridge.clearClipSubscription(true);
    bridge.clearSceneSubscription();

    expect(
      await bridge.safeClipGet(
        { get: vi.fn(() => resolved(2)), observe: vi.fn() },
        "color",
      ),
    ).toBe(2);
    expect(
      await bridge.safeClipGet(
        { get: vi.fn(() => rejected(new Error("x"))), observe: vi.fn() },
        "color",
      ),
    ).toBeNull();
    expect(
      await bridge.safeClipObserve(
        {
          get: vi.fn(),
          observe: vi.fn(() => resolved(vi.fn(() => undefined))),
        },
        "name",
        vi.fn(),
      ),
    ).toBeTypeOf("function");
    expect(
      await bridge.safeClipObserve(
        { get: vi.fn(), observe: vi.fn(() => resolved("noop")) },
        "name",
        vi.fn(),
      ),
    ).toBeNull();

    expect(
      await bridge.safeClipSlotClip({
        clip: vi.fn(() => resolved(undefined)),
        get: vi.fn(),
      }),
    ).toBeNull();
    expect(
      await bridge.safeSceneObserve(
        { get: vi.fn(), observe: vi.fn(() => resolved("noop")) },
        "name",
        vi.fn(),
      ),
    ).toBeNull();

    bridge.song = {
      child: vi.fn(() => resolved(undefined)),
      children: vi.fn(() => resolved("not-array")),
      get: vi.fn(() => resolved(0)),
      observe: vi.fn(() => resolved(vi.fn(() => undefined))),
    };
    expect(await bridge.safeSongSceneChild(4)).toBeNull();
    expect(await bridge.safeSongTracks()).toEqual([]);

    const track: RuntimeTrack = {
      child: vi.fn(() => resolved(undefined)),
      get: vi.fn(() => resolved("x")),
      observe: vi.fn(() => resolved("noop")),
    };
    expect(await bridge.safeTrackChild(track, 1)).toBeNull();
    expect(await bridge.safeTrackObserve(track, "name", vi.fn())).toBeNull();

    bridge.safeSongTracks = vi.fn(() =>
      resolved([
        createRuntimeTrack({
          id: 500,
          path: null,
          raw: { path: null },
        }),
      ]),
    );
    expect(await bridge.resolveTrackIndex(500)).toBe(500);

    bridge.selectedTrack = null;
    bridge.getTrack = vi.fn(() =>
      resolved({
        child: vi.fn(() => resolved(null)),
        get: vi.fn((property: TrackProperty) => {
          if (property === "name") {
            return resolved(7);
          }
          if (property === "color") {
            return resolved("not-a-color");
          }
          return resolved("NaN");
        }),
        observe: vi.fn((_: TrackProperty, listener: Observer) => {
          listener(Symbol.for("sym-name"));
          return resolved(vi.fn(() => undefined));
        }),
      }),
    );
    await bridge.applySelectedTrack(1);

    const clipListeners = new Map<string, Observer>();
    const conversionClip: RuntimeClip = {
      get: vi.fn((property: ClipProperty) => {
        if (property === "name") {
          return resolved(123n);
        }
        if (property === "color") {
          return resolved("x");
        }
        if (property === "looping") {
          return resolved("false");
        }
        return resolved(0);
      }),
      observe: vi.fn((property: ClipProperty, listener: Observer) => {
        clipListeners.set(property, listener);
        return resolved(vi.fn(() => undefined));
      }),
    };
    bridge.activeClip = { clip: 0, track: 1 };
    bridge.selectedTrackToken = 90;
    await bridge.subscribeClip(1, 0, conversionClip, 90);
    clipListeners.get("name")?.({ invalid: true });
    clipListeners.get("looping")?.("1");
    clipListeners.get("looping")?.({ invalid: true });

    const cleanupGroup: Cleanup[] = [];
    bridge.registerCleanup(cleanupGroup, null);
    bridge.registerCleanup(
      cleanupGroup,
      vi.fn(() => undefined),
    );

    bridge.launchPosition = 9;
    bridge.currentPosition = 9;
    bridge.previousPosition = 9;
    bridge.loopWrapCount = 3;
    bridge.resetClipRunState();

    expect(bridge.trackName).toBe("Symbol(sym-name)");
    expect(bridge.clipName).toBe("");
    expect(bridge.clipMeta.looping).toBe(false);
    expect(cleanupGroup).toHaveLength(1);
  });

  it("covers remaining safe-wrapper catch and non-function branches", async () => {
    const { bridge } = await createBridge();

    bridge.song = {
      child: vi.fn(() => resolved({})),
      children: vi.fn(() =>
        resolved([
          {
            child: vi.fn(() => resolved(null)),
            get: vi.fn(() => resolved(null)),
            observe: vi.fn(() => resolved(null)),
          } as RuntimeTrack,
        ]),
      ),
      get: vi.fn(() => resolved(1)),
      observe: vi.fn(() => resolved(vi.fn(() => undefined))),
    };
    bridge.songView = {
      get: vi.fn(() => resolved({})),
      observe: vi.fn(() => resolved(vi.fn(() => undefined))),
    };
    expect(await bridge.safeSongObserve("is_playing", vi.fn())).toBeTypeOf(
      "function",
    );
    expect(await bridge.safeSongTracks()).toHaveLength(1);
    expect(
      await bridge.safeSongViewObserve("selected_track", vi.fn()),
    ).toBeTypeOf("function");

    bridge.song = {
      child: vi.fn(() => rejected(new Error("song-child"))),
      children: vi.fn(() => resolved("not-array")),
      get: vi.fn(() => rejected(new Error("song-get"))),
      observe: vi.fn(() => resolved("noop")),
    };
    bridge.songView = {
      get: vi.fn(() => rejected(new Error("song-view-get"))),
      observe: vi.fn(() => resolved("noop")),
    };

    expect(await bridge.getTrack(0)).toBeNull();
    expect(await bridge.safeSongGet("is_playing")).toBeNull();
    expect(await bridge.safeSongObserve("is_playing", vi.fn())).toBeNull();
    expect(await bridge.safeSongSceneChild(0)).toBeNull();
    expect(await bridge.safeSongTracks()).toEqual([]);
    expect(await bridge.safeSongViewGet("selected_track")).toBeNull();
    expect(
      await bridge.safeSongViewObserve("selected_track", vi.fn()),
    ).toBeNull();

    bridge.song = {
      child: vi.fn(() => rejected(new Error("song-child-2"))),
      children: vi.fn(() => rejected(new Error("song-children-2"))),
      get: vi.fn(() => rejected(new Error("song-get-2"))),
      observe: vi.fn(() => rejected(new Error("song-observe-2"))),
    };
    bridge.songView = {
      get: vi.fn(() => rejected(new Error("song-view-get-2"))),
      observe: vi.fn(() => rejected(new Error("song-view-observe-2"))),
    };
    expect(await bridge.safeSongObserve("is_playing", vi.fn())).toBeNull();
    expect(await bridge.safeSongTracks()).toEqual([]);
    expect(
      await bridge.safeSongViewObserve("selected_track", vi.fn()),
    ).toBeNull();

    expect(
      await bridge.safeClipObserve(
        {
          get: vi.fn(() => resolved(null)),
          observe: vi.fn(() => rejected(new Error("clip-observe"))),
        },
        "name",
        vi.fn(),
      ),
    ).toBeNull();
    expect(
      await bridge.safeClipSlotClip({
        clip: vi.fn(() => rejected(new Error("clip-slot"))),
        get: vi.fn(() => resolved(null)),
      }),
    ).toBeNull();
    expect(
      await bridge.safeClipSlotGet(
        {
          clip: vi.fn(() => resolved(null)),
          get: vi.fn(() => resolved(true)),
        },
        "has_clip",
      ),
    ).toBe(true);
    expect(
      await bridge.safeClipSlotGet(
        {
          clip: vi.fn(() => resolved(null)),
          get: vi.fn(() => rejected(new Error("clip-slot-get"))),
        },
        "has_clip",
      ),
    ).toBeNull();

    expect(
      await bridge.safeSceneGet(
        {
          get: vi.fn(() => rejected(new Error("scene-get"))),
          observe: vi.fn(() => resolved(null)),
        },
        "name",
      ),
    ).toBeNull();
    expect(
      await bridge.safeSceneObserve(
        {
          get: vi.fn(() => resolved(null)),
          observe: vi.fn(() => rejected(new Error("scene-observe"))),
        },
        "name",
        vi.fn(),
      ),
    ).toBeNull();

    const failingTrack: RuntimeTrack = {
      child: vi.fn(() => rejected(new Error("track-child"))),
      get: vi.fn(() => rejected(new Error("track-get"))),
      observe: vi.fn(() => resolved("noop")),
    };
    expect(await bridge.safeTrackChild(failingTrack, 1)).toBeNull();
    expect(await bridge.safeTrackGet(failingTrack, "name")).toBeNull();
  });
});
