import type { ClipTimingMeta } from "@shared/types";

export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_BRIDGE_PORT = 9001;
export const DEFAULT_LIVE_HOST = "127.0.0.1";
export const INACTIVE_SLOT_INDEX = -1;
export const LOOP_WRAP_TOLERANCE_BEATS = 1;
export const MIN_PORT_NUMBER = 1;
export const MAX_PORT_NUMBER = 65_535;
export const MAX_RGB_COLOR = 0xff_ff_ff;
export const RECONNECT_BACKOFF_BASE = 2;
export const RECONNECT_BASE_DELAY_MS = 500;
export const RECONNECT_MAX_DELAY_MS = 5000;

export const DEFAULT_CLIP_META: ClipTimingMeta = {
  length: DEFAULT_BEATS_PER_BAR,
  loopEnd: DEFAULT_BEATS_PER_BAR,
  looping: false,
  loopStart: 0,
};

/**
 * Identifies an active clip by track and slot index.
 */
export interface BridgeClipReference {
  /**
   * Zero-based clip-slot index of the active clip.
   */
  clip: number;
  /**
   * Zero-based track index containing the active clip.
   */
  track: number;
}

/**
 * Optional dependency overrides for bridge construction and tests.
 */
export interface BridgeDeps {
  /**
   * Optional host override for the Ableton Live websocket endpoint.
   */
  hostOverride?: string;
  /**
   * Live client factory override used by tests and harnesses.
   */
  liveFactory?: LiveFactory;
  /**
   * Partial payload normalizer overrides layered over the defaults.
   */
  normalizers?: Partial<PayloadNormalizers>;
  /**
   * Optional port override for the Ableton Live websocket endpoint.
   */
  portOverride?: string;
  /**
   * WebSocket constructor override used when the runtime lacks one.
   */
  websocketCtor?: typeof globalThis.WebSocket;
}

/**
 * Clip properties read or observed from the Live API.
 */
export type ClipProperty =
  | "color"
  | "length"
  | "loop_end"
  | "loop_start"
  | "looping"
  | "name"
  | "playing_position";

/**
 * Minimal Ableton Live client surface consumed by the bridge.
 */
export interface LiveClient {
  /**
   * Opens the websocket connection to Ableton Live.
   * @returns A promise that settles after the transport connects.
   */
  connect: () => Promise<void>;
  /**
   * Closes the websocket connection to Ableton Live.
   */
  disconnect: () => void;
  /**
   * Registers a transport lifecycle listener.
   * @param event - Lifecycle event emitted by the Live client.
   * @param callback - Listener invoked when the event fires.
   */
  on: (event: "connect" | "disconnect", callback: () => void) => void;
  /**
   * Song-level Live API facade.
   */
  song: LiveSong;
  /**
   * Song-view Live API facade.
   */
  songView: LiveSongView;
}

/**
 * Minimal Live clip surface consumed by the bridge.
 */
export interface LiveClip {
  /**
   * Reads a clip property from Live.
   * @param property - Clip property to query.
   * @returns A promise resolving to the raw Live payload.
   */
  get: (property: ClipProperty) => Promise<unknown>;
  /**
   * Observes a clip property from Live.
   * @param property - Clip property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A promise resolving to the raw cleanup payload.
   */
  observe: (
    property: ClipProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

/**
 * Minimal Live clip-slot surface consumed by the bridge.
 */
export interface LiveClipSlot {
  /**
   * Resolves the clip contained by the slot.
   * @returns A promise resolving to the raw clip payload.
   */
  clip: () => Promise<unknown>;
  /**
   * Reads slot metadata from Live.
   * @param property - Clip-slot property to query.
   * @returns A promise resolving to the raw Live payload.
   */
  get: (property: "has_clip") => Promise<unknown>;
}

/**
 * Factory for constructing the minimal Live client surface.
 */
export interface LiveFactory {
  /**
   * Creates a Live client for the provided connection target.
   * @param options - Host and port for the websocket endpoint.
   * @returns The constructed Live client facade.
   */
  create: (options: LiveFactoryOptions) => LiveClient;
}

/**
 * Connection target used when constructing a minimal Live client surface.
 */
export interface LiveFactoryOptions {
  /** Hostname for the websocket endpoint. */
  host: string;
  /** Port for the websocket endpoint. */
  port: number;
}

/**
 * Minimal Live scene surface consumed by the bridge.
 */
export interface LiveScene {
  /**
   * Reads a scene property from Live.
   * @param property - Scene property to query.
   * @returns A promise resolving to the raw Live payload.
   */
  get: (property: SceneProperty) => Promise<unknown>;
  /**
   * Observes a scene property from Live.
   * @param property - Scene property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A promise resolving to the raw cleanup payload.
   */
  observe: (
    property: SceneProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

/**
 * Minimal Live song surface consumed by the bridge.
 */
export interface LiveSong {
  /**
   * Resolves a scene or track child object from the song.
   * @param child - Song child collection to access.
   * @param index - Zero-based child index within that collection.
   * @returns A promise resolving to the raw child payload.
   */
  child: (child: "scenes" | "tracks", index: number) => Promise<unknown>;
  /**
   * Resolves the track collection from the song.
   * @param child - Child collection to access.
   * @returns A promise resolving to the raw collection payload.
   */
  children: (child: "tracks") => Promise<unknown>;
  /**
   * Reads a song property from Live.
   * @param property - Song property to query.
   * @returns A promise resolving to the raw Live payload.
   */
  get: (property: SongProperty) => Promise<unknown>;
  /**
   * Observes a song property from Live.
   * @param property - Song property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A promise resolving to the raw cleanup payload.
   */
  observe: (
    property: SongProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

/**
 * Minimal Live song-view surface consumed by the bridge.
 */
export interface LiveSongView {
  /**
   * Reads a song-view property from Live.
   * @param property - Song-view property to query.
   * @returns A promise resolving to the raw Live payload.
   */
  get: (property: "selected_track") => Promise<unknown>;
  /**
   * Observes a song-view property from Live.
   * @param property - Song-view property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A promise resolving to the raw cleanup payload.
   */
  observe: (
    property: "selected_track",
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

/**
 * Minimal Live track surface consumed by the bridge.
 */
export interface LiveTrack {
  /**
   * Resolves a clip-slot child object from the track.
   * @param child - Track child collection to access.
   * @param index - Zero-based clip-slot index.
   * @returns A promise resolving to the raw child payload.
   */
  child: (child: "clip_slots", index: number) => Promise<unknown>;
  /**
   * Reads a track property from Live.
   * @param property - Track property to query.
   * @returns A promise resolving to the raw Live payload.
   */
  get: (property: TrackProperty) => Promise<unknown>;
  /**
   * Parsed numeric track id, when available.
   */
  id?: number;
  /**
   * Observes a track property from Live.
   * @param property - Track property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A promise resolving to the raw cleanup payload.
   */
  observe: (
    property: TrackProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
  /**
   * Parsed Live object path for the track, when available.
   */
  path?: string;
  /**
   * Unnormalized raw track payload preserved from the Live client.
   */
  raw?: {
    /**
     * Raw track id emitted by Live before normalization.
     */
    id?: number | string;
    /**
     * Raw track path emitted by Live before normalization.
     */
    path?: string;
  };
}

/**
 * Parsed representation of Live's selected-track payload.
 */
export interface NormalizedSelectedTrackPayload {
  /**
   * Direct numeric track id emitted by Live, when present.
   */
  directId: number | undefined;
  /**
   * Parsed direct path emitted by Live, when present.
   */
  path: string | undefined;
  /**
   * Raw nested path emitted by Live, when present.
   */
  rawPath: string | undefined;
}

/**
 * Parsed representation of a Live track reference payload.
 */
export interface NormalizedTrackReference {
  /**
   * Parsed direct numeric track id, when present.
   */
  id: number | undefined;
  /**
   * Parsed direct track path, when present.
   */
  path: string | undefined;
  /**
   * Parsed raw numeric track id from nested payloads, when present.
   */
  rawId: number | undefined;
  /**
   * Parsed raw track path from nested payloads, when present.
   */
  rawPath: string | undefined;
}

/**
 * Cleanup callback returned by a Live observe registration.
 */
export type ObserverCleanup = () => Promise<void> | void;

/**
 * Payload-normalization helpers used across bridge access and subscription code.
 */
export interface PayloadNormalizers {
  /**
   * Normalizes a raw observer cleanup payload into a callable cleanup.
   * @param cleanup - Raw cleanup payload from the Live client.
   * @returns The normalized cleanup callback, when available.
   */
  normalizeCleanup: (cleanup: unknown) => ObserverCleanup | undefined;
  /**
   * Parses the selected-track payload emitted by Live.
   * @param payload - Raw selected-track payload.
   * @returns The normalized selected-track representation.
   */
  normalizeSelectedTrackPayload: (
    payload: unknown,
  ) => NormalizedSelectedTrackPayload;
  /**
   * Parses a raw track reference payload emitted by Live.
   * @param track - Raw track payload.
   * @returns The normalized track reference.
   */
  normalizeTrackRef: (track: unknown) => NormalizedTrackReference;
  /**
   * Parses a zero-based track index from a Live path string.
   * @param path - Live object path for a track.
   * @returns The parsed track index, or `-1` when unavailable.
   */
  parseTrackIndexFromPath: (path: string | undefined) => number;
  /**
   * Normalizes unknown input into a boolean.
   * @param value - Raw value to normalize.
   * @returns The normalized boolean value.
   */
  toBoolean: (value: unknown) => boolean;
  /**
   * Normalizes unknown input into a 24-bit RGB color.
   * @param value - Raw color payload to normalize.
   * @returns The normalized color, or `undefined` when unavailable.
   */
  toColorValue: (value: unknown) => number | undefined;
  /**
   * Normalizes unknown input into a finite number.
   * @param value - Raw value to normalize.
   * @param fallback - Fallback value used when parsing fails.
   * @returns The normalized number.
   */
  toNumber: (value: unknown, fallback?: number) => number;
  /**
   * Normalizes scene colors while treating `0` as no color.
   * @param value - Raw scene-color payload to normalize.
   * @returns The normalized scene color, or `undefined` when unavailable.
   */
  toSceneColorValue: (value: unknown) => number | undefined;
  /**
   * Normalizes unknown input into a string.
   * @param value - Raw value to normalize.
   * @returns The normalized string value.
   */
  toStringValue: (value: unknown) => string;
}

/**
 * Scene properties read or observed from the Live API.
 */
export type SceneProperty = "color" | "name";

/**
 * Song properties read or observed from the Live API.
 */
export type SongProperty =
  | "current_song_time"
  | "is_playing"
  | "signature_denominator"
  | "signature_numerator";

/**
 * Track properties read or observed from the Live API.
 */
export type TrackProperty = "color" | "name" | "playing_slot_index";
