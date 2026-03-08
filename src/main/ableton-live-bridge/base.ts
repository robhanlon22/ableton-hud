import type { ClipTimingMeta, HudMode, HudState } from "@shared/types";

import { EPSILON, hasValidLoopSpan } from "@main/counter";
import WebSocket from "ws";

import type {
  BridgeClipReference,
  BridgeDeps,
  LiveClient,
  LiveSong,
  LiveSongView,
  ObserverCleanup,
  PayloadNormalizers,
} from "./types";

import {
  defaultLiveFactory,
  defaultPayloadNormalizers,
  resolveLivePort,
} from "./normalizers";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_CLIP_META,
  DEFAULT_LIVE_HOST,
  LOOP_WRAP_TOLERANCE_BEATS,
  RECONNECT_BACKOFF_BASE,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from "./types";

/**
 * Shared connection and state-management behavior for the Ableton bridge.
 */
export abstract class AbletonLiveBridgeBase {
  protected activeClip: BridgeClipReference | undefined;
  protected activeScene: number | undefined;
  protected beatCounter = 0;
  protected beatFlashToken = 0;
  protected clipColor: number | undefined;
  protected clipMeta = cloneDefaultClipMeta();
  protected clipName: string | undefined;
  protected clipObserverCleanups: ObserverCleanup[] = [];
  protected connected = false;
  protected connectInFlight = false;
  protected connectionEpoch = 0;
  protected currentPosition: number | undefined;
  protected isPlaying = false;
  protected lastWholeBeat: number | undefined;
  protected launchPosition: number | undefined;
  protected readonly live: LiveClient;
  protected loopWrapCount = 0;
  protected mode: HudMode;
  protected readonly normalizers: PayloadNormalizers;
  protected onState: (state: HudState) => void;
  protected pendingSelectedTrack: number | undefined;
  protected previousPosition: number | undefined;
  protected reconnectAttempt = 0;
  protected reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  protected sceneColor: number | undefined;
  protected sceneName: string | undefined;
  protected sceneObserverCleanups: ObserverCleanup[] = [];
  protected selectedTrack: number | undefined;
  protected selectedTrackToken = 0;
  protected signatureDenominator = DEFAULT_BEATS_PER_BAR;
  protected signatureNumerator = DEFAULT_BEATS_PER_BAR;
  protected readonly song: LiveSong;
  protected songObserverCleanups: ObserverCleanup[] = [];
  protected readonly songView: LiveSongView;
  protected started = false;
  protected trackColor: number | undefined;
  protected trackLocked: boolean;
  protected trackName: string | undefined;
  protected trackObserverCleanups: ObserverCleanup[] = [];
  protected transitionInProgress = false;

  protected constructor(
    mode: HudMode,
    onState: (state: HudState) => void,
    trackLocked = false,
    deps: BridgeDeps = {},
  ) {
    const host =
      deps.hostOverride ?? process.env.AOSC_LIVE_HOST ?? DEFAULT_LIVE_HOST;
    const port = resolveLivePort(
      deps.portOverride ?? process.env.AOSC_LIVE_PORT,
    );
    const websocketCtor = deps.websocketCtor ?? WebSocket;
    if (!Object.hasOwn(globalThis, "WebSocket")) {
      Reflect.set(globalThis, "WebSocket", websocketCtor);
    }

    this.mode = mode;
    this.onState = onState;
    this.trackLocked = trackLocked;
    this.normalizers = {
      ...defaultPayloadNormalizers,
      ...deps.normalizers,
    };

    this.live = (deps.liveFactory ?? defaultLiveFactory).create({ host, port });
    this.song = this.live.song;
    this.songView = this.live.songView;

    this.live.on("connect", this.handleConnect);
    this.live.on("disconnect", this.handleDisconnect);
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.emit();
  }

  setTrackLocked(trackLocked: boolean): void {
    if (this.trackLocked === trackLocked) {
      return;
    }

    this.trackLocked = trackLocked;
    if (!trackLocked && this.pendingSelectedTrack !== undefined) {
      const pendingTrack = this.pendingSelectedTrack;
      this.pendingSelectedTrack = undefined;
      void this.applySelectedTrack(pendingTrack);
      return;
    }

    this.emit();
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    void this.connect();
  }

  stop(): void {
    this.started = false;
    this.connectionEpoch += 1;
    this.clearReconnectTimer();
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
    this.connectInFlight = false;
    this.connected = false;
    this.live.disconnect();
  }

  toggleTrackLock(): boolean {
    this.setTrackLocked(!this.trackLocked);
    return this.trackLocked;
  }

  protected abstract applySelectedTrack(trackIndex: number): Promise<void>;

  protected abstract bootstrap(epoch?: number): Promise<void>;

  protected clearClipSubscription(preserveDisplay = false): void {
    this.clearObserverGroup(this.clipObserverCleanups);
    this.clearSceneSubscription(preserveDisplay);
    this.activeClip = undefined;

    if (!preserveDisplay) {
      this.clipName = undefined;
      this.clipColor = undefined;
    }

    this.clipMeta = cloneDefaultClipMeta();
    this.resetClipRunState();
  }

  protected clearObserverGroup(cleanups: ObserverCleanup[]): void {
    for (const cleanup of cleanups.splice(0)) {
      void Promise.resolve(cleanup()).catch(ignoreObserverCleanupError);
    }
  }

  protected clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  protected clearSceneSubscription(preserveDisplay = false): void {
    this.clearObserverGroup(this.sceneObserverCleanups);
    this.activeScene = undefined;

    if (!preserveDisplay) {
      this.sceneColor = undefined;
      this.sceneName = undefined;
    }
  }

  protected clearTrackSubscription(): void {
    this.clearObserverGroup(this.trackObserverCleanups);
    this.clearClipSubscription();
  }

  protected abstract connect(): Promise<void>;

  protected abstract emit(): void;

  protected handleSelectedTrack(trackIndex: number): void {
    if (trackIndex < 0) {
      return;
    }

    if (
      this.trackLocked &&
      this.selectedTrack !== undefined &&
      this.selectedTrack !== trackIndex
    ) {
      this.pendingSelectedTrack = trackIndex;
      return;
    }

    this.pendingSelectedTrack = undefined;
    void this.applySelectedTrack(trackIndex);
  }

  protected handleSongTime(songTime: number): void {
    const wholeBeat = Math.max(0, Math.floor(songTime + EPSILON));

    if (this.lastWholeBeat === undefined) {
      this.lastWholeBeat = wholeBeat;
      this.beatCounter = wholeBeat;
      this.emit();
      return;
    }

    if (wholeBeat !== this.lastWholeBeat) {
      this.lastWholeBeat = wholeBeat;
      this.beatCounter = wholeBeat;
      this.beatFlashToken += 1;
      this.emit();
    }
  }

  protected isActiveClip(track: number, clip: number): boolean {
    return this.activeClip?.track === track && this.activeClip.clip === clip;
  }

  protected isCurrentEpoch(epoch: number): boolean {
    return this.started && epoch === this.connectionEpoch;
  }

  protected isNaturalLoopWrap(
    previousPosition: number,
    currentPosition: number,
  ): boolean {
    if (!hasValidLoopSpan(this.clipMeta)) {
      return false;
    }

    const loopSpan = this.clipMeta.loopEnd - this.clipMeta.loopStart;
    const wrappedDelta = currentPosition + loopSpan - previousPosition;

    return (
      previousPosition >= this.clipMeta.loopStart - EPSILON &&
      previousPosition <= this.clipMeta.loopEnd + EPSILON &&
      currentPosition >= this.clipMeta.loopStart - EPSILON &&
      currentPosition <= this.clipMeta.loopEnd + EPSILON &&
      wrappedDelta >= -EPSILON &&
      wrappedDelta <= loopSpan + LOOP_WRAP_TOLERANCE_BEATS
    );
  }

  protected nextReconnectDelayMs(): number {
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * RECONNECT_BACKOFF_BASE ** this.reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    return delay;
  }

  protected registerCleanup(
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ): void {
    if (typeof stop === "function") {
      cleanupGroup.push(stop);
    }
  }

  protected resetClipRunState(): void {
    this.launchPosition = undefined;
    this.currentPosition = undefined;
    this.previousPosition = undefined;
    this.loopWrapCount = 0;
  }

  protected scheduleReconnect(): void {
    if (!this.started || this.connected || this.connectInFlight) {
      return;
    }

    this.clearReconnectTimer();
    const delay = this.nextReconnectDelayMs();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  private readonly handleConnect = (): void => {
    if (!this.started) {
      return;
    }

    this.connected = true;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    const epoch = ++this.connectionEpoch;
    void this.bootstrap(epoch);
    this.emit();
  };

  private readonly handleDisconnect = (): void => {
    if (!this.started) {
      return;
    }

    this.connected = false;
    this.connectionEpoch += 1;
    this.pendingSelectedTrack = undefined;
    this.selectedTrack = undefined;
    this.trackColor = undefined;
    this.trackName = undefined;
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
    this.emit();
    this.scheduleReconnect();
  };
}

/**
 * Clones the default clip metadata snapshot.
 * @returns A fresh clip metadata object.
 */
function cloneDefaultClipMeta(): ClipTimingMeta {
  return { ...DEFAULT_CLIP_META };
}

/**
 * Swallows observer cleanup failures during teardown.
 * @returns `undefined`.
 */
function ignoreObserverCleanupError(): void {
  return undefined;
}
