import type {
  ClipProperty,
  LiveClip,
  LiveClipSlot,
  LiveScene,
  LiveSong,
  LiveSongView,
  LiveTrack,
  SceneProperty,
  SongProperty,
  TrackProperty,
} from "@main/ableton-live-bridge";
import type { ClipTimingMeta, HudMode, HudState } from "@shared/types";

import { vi } from "vitest";

/**
 * Describes the guarded access helpers exposed for bridge tests.
 */
export interface BridgeAccessRuntime {
  /** Resolves a Live track by index. */
  getTrack: (trackIndex: number) => Promise<LiveTrack | undefined>;
  /** Resolves an arbitrary selected-track payload to a track index. */
  resolveTrackIndex: (selectedTrack: unknown) => Promise<number>;
  /** Reads a guarded clip property. */
  safeClipGet: (clip: LiveClip, property: ClipProperty) => Promise<unknown>;
  /** Observes a guarded clip property. */
  safeClipObserve: (
    clip: LiveClip,
    property: ClipProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  /** Resolves the clip contained in a guarded clip slot. */
  safeClipSlotClip: (clipSlot: LiveClipSlot) => Promise<LiveClip | undefined>;
  /** Reads a guarded clip-slot property. */
  safeClipSlotGet: (
    clipSlot: LiveClipSlot,
    property: "has_clip",
  ) => Promise<unknown>;
  /** Reads a guarded scene property. */
  safeSceneGet: (scene: LiveScene, property: SceneProperty) => Promise<unknown>;
  /** Observes a guarded scene property. */
  safeSceneObserve: (
    scene: LiveScene,
    property: SceneProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  /** Reads a guarded song property. */
  safeSongGet: (property: SongProperty) => Promise<unknown>;
  /** Observes a guarded song property. */
  safeSongObserve: (
    property: SongProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  /** Resolves a guarded scene child from the song. */
  safeSongSceneChild: (sceneIndex: number) => Promise<LiveScene | undefined>;
  /** Resolves all guarded song tracks. */
  safeSongTracks: () => Promise<LiveTrack[]>;
  /** Reads the guarded selected-track song-view payload. */
  safeSongViewGet: (property: "selected_track") => Promise<unknown>;
  /** Observes the guarded selected-track song-view payload. */
  safeSongViewObserve: (
    property: "selected_track",
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  /** Resolves a guarded clip slot from a track. */
  safeTrackChild: (
    track: LiveTrack,
    clipSlotIndex: number,
  ) => Promise<LiveClipSlot | undefined>;
  /** Reads a guarded track property. */
  safeTrackGet: (track: LiveTrack, property: TrackProperty) => Promise<unknown>;
  /** Observes a guarded track property. */
  safeTrackObserve: (
    track: LiveTrack,
    property: TrackProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
}

/**
 * Describes the active clip reference stored by the bridge runtime.
 */
export interface BridgeClipReference {
  /** Zero-based active clip index. */
  clip: number;
  /** Zero-based active track index. */
  track: number;
}

/**
 * Describes environment overrides applied while constructing bridge tests.
 */
export interface BridgeOverrides {
  /** Optional host override for the Live client. */
  host?: string;
  /** Optional port override for the Live client. */
  port?: string;
  /** Whether to clear the runtime `WebSocket` shim before construction. */
  websocketUndefined?: boolean;
}

/**
 * Describes the internal bridge runtime surface exercised by tests.
 */
export interface BridgeRuntime {
  /** Guarded Live access helpers. */
  access: BridgeAccessRuntime;
  /** Active clip reference, when one is selected. */
  activeClip: BridgeClipReference | undefined;
  /** Active scene index, when known. */
  activeScene: number | undefined;
  /** Applies a selected track to bridge state. */
  applySelectedTrack: (trackIndex: number) => Promise<void>;
  /** Current beat counter. */
  beatCounter: number;
  /** Beat-flash state token. */
  beatFlashToken: number;
  /** Bootstraps bridge observers for the active connection. */
  bootstrap: (epoch?: number) => Promise<void>;
  /** Clears clip subscriptions. */
  clearClipSubscription: (preserveDisplay?: boolean) => void;
  /** Clears a group of observer cleanups. */
  clearObserverGroup: (cleanups: Cleanup[]) => void;
  /** Clears scene subscriptions. */
  clearSceneSubscription: (preserveDisplay?: boolean) => void;
  /** Current clip color snapshot. */
  clipColor: number | undefined;
  /** Current clip timing metadata snapshot. */
  clipMeta: ClipTimingMeta;
  /** Current clip name snapshot. */
  clipName: string | undefined;
  /** Registered clip observer cleanups. */
  clipObserverCleanups: Cleanup[];
  /** Starts a Live connection attempt. */
  connect: () => Promise<void>;
  /** Whether the bridge is connected. */
  connected: boolean;
  /** Whether a connect attempt is in flight. */
  connectInFlight: boolean;
  /** Monotonic connection epoch counter. */
  connectionEpoch: number;
  /** Current song position, when available. */
  currentPosition: number | undefined;
  /** Emits the latest HUD state snapshot. */
  emit: () => void;
  /** Handles playing-position updates. */
  handlePlayingPosition: (position: number) => void;
  /** Handles playing-slot updates. */
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  /** Handles selected-track updates. */
  handleSelectedTrack: (trackIndex: number) => void;
  /** Handles song-time updates. */
  handleSongTime: (songTime: number) => void;
  /** Checks whether a loop wrap is natural. */
  isNaturalLoopWrap: (
    previousPosition: number,
    currentPosition: number,
  ) => boolean;
  /** Whether the transport is currently playing. */
  isPlaying: boolean;
  /** Last launch position, when known. */
  launchPosition: number | undefined;
  /** Number of loop wraps observed for the active clip. */
  loopWrapCount: number;
  /** Active HUD mode. */
  mode: HudMode;
  /** Deferred selected track while the lock is enabled. */
  pendingSelectedTrack: number | undefined;
  /** Previous transport position, when known. */
  previousPosition: number | undefined;
  /** Current reconnect attempt count. */
  reconnectAttempt: number;
  /** Registers an observer cleanup into a cleanup group. */
  registerCleanup: (cleanupGroup: Cleanup[], stop: Cleanup | undefined) => void;
  /** Resets clip run-state bookkeeping. */
  resetClipRunState: () => void;
  /** Resolves a selected-track payload to a track index. */
  resolveTrackIndex: (selectedTrack: unknown) => Promise<number>;
  /** Current scene color snapshot. */
  sceneColor: number | undefined;
  /** Current scene name snapshot. */
  sceneName: string | undefined;
  /** Registered scene observer cleanups. */
  sceneObserverCleanups: Cleanup[];
  /** Schedules a reconnect attempt. */
  scheduleReconnect: () => void;
  /** Currently selected track index. */
  selectedTrack: number | undefined;
  /** Token guarding selected-track async work. */
  selectedTrackToken: number;
  /** Sets the active HUD mode. */
  setMode: (mode: HudMode) => void;
  /** Sets the track-lock state. */
  setTrackLocked: (trackLocked: boolean) => void;
  /** Current time-signature denominator. */
  signatureDenominator: number;
  /** Current time-signature numerator. */
  signatureNumerator: number;
  /** Starts the bridge lifecycle. */
  start: () => void;
  /** Whether the bridge has been started. */
  started: boolean;
  /** Stops the bridge lifecycle. */
  stop: () => void;
  /** Subscribes to a resolved clip. */
  subscribeClip: (
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ) => Promise<void>;
  /** Subscribes to a resolved scene. */
  subscribeScene: (sceneIndex: number, token: number) => Promise<void>;
  /** Subscription helpers for track, clip, and scene state. */
  subscriptions: BridgeSubscriptionRuntime;
  /** Toggles the track-lock state. */
  toggleTrackLock: () => boolean;
  /** Current track color snapshot. */
  trackColor: number | undefined;
  /** Whether track lock is enabled. */
  trackLocked: boolean;
  /** Current track name snapshot. */
  trackName: string | undefined;
  /** Registered track observer cleanups. */
  trackObserverCleanups: Cleanup[];
  /** Whether a clip transition is in progress. */
  transitionInProgress: boolean;
}

/**
 * Describes the subscription helpers exposed by the bridge runtime.
 */
export interface BridgeSubscriptionRuntime {
  /** Observes the currently selected track. */
  observeTrack: (track: LiveTrack, trackIndex: number) => Promise<void>;
  /** Subscribes to the active clip on the selected track. */
  subscribeClip: (
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ) => Promise<void>;
  /** Subscribes to the active scene. */
  subscribeScene: (sceneIndex: number, token: number) => Promise<void>;
  /** Synchronizes the selected-track state snapshot. */
  syncTrackState: (track: LiveTrack) => Promise<void>;
}

/**
 * Describes the fully wired bridge test context.
 */
export interface BridgeTestContext {
  /** Internal bridge runtime under test. */
  bridge: BridgeRuntime;
  /** Active mocked Live harness. */
  harness: LiveHarness;
  /** HUD state observer spy. */
  onState: HudStateSpy;
}

/**
 * Describes a cleanup callback returned from an observer registration.
 */
export type Cleanup = () => Promise<void> | void;

/**
 * Describes the HUD state spy captured by bridge tests.
 */
export type HudStateSpy = ReturnType<typeof vi.fn<(state: HudState) => void>>;

/**
 * Describes the mocked Live harness tracked by bridge tests.
 */
export interface LiveHarness {
  /** Registered event handlers keyed by Live event name. */
  eventHandlers: Map<string, () => void>;
  /** Mocked Live client instance. */
  instance: LiveHarnessInstance;
  /** Captured construction options, when the client was created. */
  options: LiveHarnessOptions | undefined;
}

/**
 * Describes the mocked Live client instance used by the harness.
 */
export interface LiveHarnessInstance {
  /** Starts the mocked Live client connection. */
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  /** Stops the mocked Live client connection. */
  disconnect: ReturnType<typeof vi.fn<() => void>>;
  /** Registers mocked Live client event handlers. */
  on: ReturnType<typeof vi.fn<(event: string, callback: () => void) => void>>;
  /** Mocked Live song surface. */
  song: LiveSong;
  /** Mocked Live song-view surface. */
  songView: LiveSongView;
}

/**
 * Describes the host and port captured by the mocked Live harness.
 */
export interface LiveHarnessOptions {
  /** Live websocket host used for construction. */
  host: string;
  /** Live websocket port used for construction. */
  port: number;
}

/**
 * Describes an observer callback used by guarded access helpers.
 */
export type Observer = (value: unknown) => void;
