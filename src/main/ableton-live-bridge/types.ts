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

export interface BridgeClipReference {
  clip: number;
  track: number;
}

export interface BridgeDeps {
  hostOverride?: string;
  liveFactory?: LiveFactory;
  normalizers?: Partial<PayloadNormalizers>;
  portOverride?: string;
  websocketCtor?: typeof globalThis.WebSocket;
}

export type ClipProperty =
  | "color"
  | "length"
  | "loop_end"
  | "loop_start"
  | "looping"
  | "name"
  | "playing_position";

export interface LiveClient {
  connect: () => Promise<void>;
  disconnect: () => void;
  on: (event: "connect" | "disconnect", callback: () => void) => void;
  song: LiveSong;
  songView: LiveSongView;
}

export interface LiveClip {
  get: (property: ClipProperty) => Promise<unknown>;
  observe: (
    property: ClipProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

export interface LiveClipSlot {
  clip: () => Promise<unknown>;
  get: (property: "has_clip") => Promise<unknown>;
}

export interface LiveFactory {
  create: (options: { host: string; port: number }) => LiveClient;
}

export interface LiveScene {
  get: (property: SceneProperty) => Promise<unknown>;
  observe: (
    property: SceneProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

export interface LiveSong {
  child: (child: "scenes" | "tracks", index: number) => Promise<unknown>;
  children: (child: "tracks") => Promise<unknown>;
  get: (property: SongProperty) => Promise<unknown>;
  observe: (
    property: SongProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

export interface LiveSongView {
  get: (property: "selected_track") => Promise<unknown>;
  observe: (
    property: "selected_track",
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

export interface LiveTrack {
  child: (child: "clip_slots", index: number) => Promise<unknown>;
  get: (property: TrackProperty) => Promise<unknown>;
  id?: number;
  observe: (
    property: TrackProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
  path?: string;
  raw?: {
    id?: number | string;
    path?: string;
  };
}

export interface NormalizedSelectedTrackPayload {
  directId: number | undefined;
  path: string | undefined;
  rawPath: string | undefined;
}

export interface NormalizedTrackReference {
  id: number | undefined;
  path: string | undefined;
  rawId: number | undefined;
  rawPath: string | undefined;
}

export type ObserverCleanup = () => Promise<void> | void;

export interface PayloadNormalizers {
  normalizeCleanup: (cleanup: unknown) => ObserverCleanup | undefined;
  normalizeSelectedTrackPayload: (
    payload: unknown,
  ) => NormalizedSelectedTrackPayload;
  normalizeTrackRef: (track: unknown) => NormalizedTrackReference;
  parseTrackIndexFromPath: (path: string | undefined) => number;
  toBoolean: (value: unknown) => boolean;
  toColorValue: (value: unknown) => number | undefined;
  toNumber: (value: unknown, fallback?: number) => number;
  toSceneColorValue: (value: unknown) => number | undefined;
  toStringValue: (value: unknown) => string;
}

export type SceneProperty = "color" | "name";

export type SongProperty =
  | "current_song_time"
  | "is_playing"
  | "signature_denominator"
  | "signature_numerator";

export type TrackProperty = "color" | "name" | "playing_slot_index";
