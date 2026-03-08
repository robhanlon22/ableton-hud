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

export interface BridgeAccessRuntime {
  getTrack: (trackIndex: number) => Promise<LiveTrack | undefined>;
  resolveTrackIndex: (selectedTrack: unknown) => Promise<number>;
  safeClipGet: (clip: LiveClip, property: ClipProperty) => Promise<unknown>;
  safeClipObserve: (
    clip: LiveClip,
    property: ClipProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  safeClipSlotClip: (clipSlot: LiveClipSlot) => Promise<LiveClip | undefined>;
  safeClipSlotGet: (
    clipSlot: LiveClipSlot,
    property: "has_clip",
  ) => Promise<unknown>;
  safeSceneGet: (scene: LiveScene, property: SceneProperty) => Promise<unknown>;
  safeSceneObserve: (
    scene: LiveScene,
    property: SceneProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  safeSongGet: (property: SongProperty) => Promise<unknown>;
  safeSongObserve: (
    property: SongProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  safeSongSceneChild: (sceneIndex: number) => Promise<LiveScene | undefined>;
  safeSongTracks: () => Promise<LiveTrack[]>;
  safeSongViewGet: (property: "selected_track") => Promise<unknown>;
  safeSongViewObserve: (
    property: "selected_track",
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
  safeTrackChild: (
    track: LiveTrack,
    clipSlotIndex: number,
  ) => Promise<LiveClipSlot | undefined>;
  safeTrackGet: (track: LiveTrack, property: TrackProperty) => Promise<unknown>;
  safeTrackObserve: (
    track: LiveTrack,
    property: TrackProperty,
    listener: Observer,
  ) => Promise<Cleanup | undefined>;
}

export interface BridgeOverrides {
  host?: string;
  port?: string;
  websocketUndefined?: boolean;
}
export interface BridgeRuntime {
  access: BridgeAccessRuntime;
  activeClip: undefined | { clip: number; track: number };
  activeScene: number | undefined;
  applySelectedTrack: (trackIndex: number) => Promise<void>;
  beatCounter: number;
  beatFlashToken: number;
  bootstrap: (epoch?: number) => Promise<void>;
  clearClipSubscription: (preserveDisplay?: boolean) => void;
  clearObserverGroup: (cleanups: Cleanup[]) => void;
  clearSceneSubscription: (preserveDisplay?: boolean) => void;
  clipColor: number | undefined;
  clipMeta: ClipTimingMeta;
  clipName: string | undefined;
  clipObserverCleanups: Cleanup[];
  connect: () => Promise<void>;
  connected: boolean;
  connectInFlight: boolean;
  connectionEpoch: number;
  currentPosition: number | undefined;
  emit: () => void;
  handlePlayingPosition: (position: number) => void;
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  handleSelectedTrack: (trackIndex: number) => void;
  handleSongTime: (songTime: number) => void;
  isNaturalLoopWrap: (
    previousPosition: number,
    currentPosition: number,
  ) => boolean;
  isPlaying: boolean;
  launchPosition: number | undefined;
  loopWrapCount: number;
  mode: HudMode;
  pendingSelectedTrack: number | undefined;
  previousPosition: number | undefined;
  reconnectAttempt: number;
  registerCleanup: (cleanupGroup: Cleanup[], stop: Cleanup | undefined) => void;
  resetClipRunState: () => void;
  resolveTrackIndex: (selectedTrack: unknown) => Promise<number>;
  sceneColor: number | undefined;
  sceneName: string | undefined;
  sceneObserverCleanups: Cleanup[];
  scheduleReconnect: () => void;
  selectedTrack: number | undefined;
  selectedTrackToken: number;
  setMode: (mode: HudMode) => void;
  setTrackLocked: (trackLocked: boolean) => void;
  signatureDenominator: number;
  signatureNumerator: number;
  start: () => void;
  started: boolean;
  stop: () => void;
  subscribeClip: (
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ) => Promise<void>;
  subscribeScene: (sceneIndex: number, token: number) => Promise<void>;
  subscriptions: BridgeSubscriptionRuntime;
  toggleTrackLock: () => boolean;
  trackColor: number | undefined;
  trackLocked: boolean;
  trackName: string | undefined;
  trackObserverCleanups: Cleanup[];
  transitionInProgress: boolean;
}

export interface BridgeSubscriptionRuntime {
  observeTrack: (track: LiveTrack, trackIndex: number) => Promise<void>;
  subscribeClip: (
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ) => Promise<void>;
  subscribeScene: (sceneIndex: number, token: number) => Promise<void>;
  syncTrackState: (track: LiveTrack) => Promise<void>;
}

export interface BridgeTestContext {
  bridge: BridgeRuntime;
  harness: LiveHarness;
  onState: HudStateSpy;
}

export type Cleanup = () => Promise<void> | void;

export type HudStateSpy = ReturnType<typeof vi.fn<(state: HudState) => void>>;

export interface LiveHarness {
  eventHandlers: Map<string, () => void>;
  instance: {
    connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
    disconnect: ReturnType<typeof vi.fn<() => void>>;
    on: ReturnType<typeof vi.fn<(event: string, callback: () => void) => void>>;
    song: LiveSong;
    songView: LiveSongView;
  };
  options: undefined | { host: string; port: number };
}

export type Observer = (value: unknown) => void;
