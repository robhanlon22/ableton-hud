import type {
  AbletonLiveBridge,
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
import type { BridgeSession } from "@main/ableton-live-bridge/session";
import type { HudState } from "@shared/types";

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
 * Describes the fully wired bridge-session test context.
 */
export interface BridgeSessionTestContext {
  /** Active mocked Live harness. */
  harness: LiveHarness;
  /** HUD state observer spy. */
  onState: HudStateSpy;
  /** Internal bridge session runtime under test. */
  session: BridgeSession;
}

/**
 * Describes the fully wired public bridge-shell test context.
 */
export interface BridgeTestContext {
  /** Public bridge shell under test. */
  bridge: AbletonLiveBridge;
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
