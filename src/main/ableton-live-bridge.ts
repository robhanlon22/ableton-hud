import { AbletonLive } from "ableton-live";
import WebSocket from "ws";

import type {
  ClipTimingMeta,
  CounterParts,
  HudMode,
  HudState,
  LastBarSource,
} from "../shared/types";

import {
  computeBeatInBar,
  computeIsLastBar,
  createTimingGrid,
  EPSILON,
  formatCounterParts,
  hasValidLoopSpan,
  toElapsedCounterParts,
  toRemainingCounterParts,
} from "./counter";

interface BridgeClip {
  get: (property: ClipProperty) => Promise<unknown>;
  observe: (
    property: ClipProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

interface BridgeClipSlot {
  clip: () => Promise<unknown>;
  get: (property: "has_clip") => Promise<unknown>;
}
interface BridgeScene {
  get: (property: SceneProperty) => Promise<unknown>;
  observe: (
    property: SceneProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}
interface BridgeSong {
  child: (child: "scenes" | "tracks", index: number) => Promise<unknown>;
  children: (child: "tracks") => Promise<unknown>;
  get: (property: SongProperty) => Promise<unknown>;
  observe: (
    property: SongProperty,
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

interface BridgeSongView {
  get: (property: "selected_track") => Promise<unknown>;
  observe: (
    property: "selected_track",
    listener: (value: unknown) => void,
  ) => Promise<unknown>;
}

interface BridgeTrack {
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

type ClipProperty =
  | "color"
  | "length"
  | "loop_end"
  | "loop_start"
  | "looping"
  | "name"
  | "playing_position";

type ObserverCleanup = () => Promise<void> | void;

type SceneProperty = "color" | "name";

type SongProperty =
  | "current_song_time"
  | "is_playing"
  | "signature_denominator"
  | "signature_numerator";

type TrackProperty = "color" | "name" | "playing_slot_index";

const LIVE_HOST = process.env.AOSC_LIVE_HOST ?? "127.0.0.1";
const LIVE_PORT = resolveLivePort(process.env.AOSC_LIVE_PORT);

if (typeof globalThis.WebSocket === "undefined") {
  Reflect.set(globalThis, "WebSocket", WebSocket);
}

export class AbletonLiveBridge {
  private activeClip: null | { clip: number; track: number } = null;
  private activeScene: null | number = null;
  private beatCounter = 0;
  private beatFlashToken = 0;
  private clipColor: null | number = null;
  private clipMeta: ClipTimingMeta = {
    length: 4,
    loopEnd: 4,
    looping: false,
    loopStart: 0,
  };
  private clipName: null | string = null;
  private clipObserverCleanups: ObserverCleanup[] = [];
  private connected = false;
  private currentPosition: null | number = null;
  private isPlaying = false;
  private lastWholeBeat: null | number = null;
  private launchPosition: null | number = null;
  private readonly live: AbletonLive;
  private loopWrapCount = 0;
  private mode: HudMode;
  private onState: (state: HudState) => void;
  private pendingSelectedTrack: null | number = null;
  private previousPosition: null | number = null;
  private sceneColor: null | number = null;
  private sceneName: null | string = null;
  private sceneObserverCleanups: ObserverCleanup[] = [];
  private selectedTrack: null | number = null;
  private selectedTrackToken = 0;
  private signatureDenominator = 4;
  private signatureNumerator = 4;
  private readonly song: BridgeSong;
  private songObserverCleanups: ObserverCleanup[] = [];
  private readonly songView: BridgeSongView;
  private started = false;
  private trackColor: null | number = null;
  private trackLocked: boolean;
  private trackName: null | string = null;
  private trackObserverCleanups: ObserverCleanup[] = [];
  private transitionInProgress = false;

  constructor(
    mode: HudMode,
    onState: (state: HudState) => void,
    trackLocked = false,
  ) {
    this.mode = mode;
    this.onState = onState;
    this.trackLocked = trackLocked;

    this.live = new AbletonLive({
      host: LIVE_HOST,
      port: LIVE_PORT,
    });
    this.song = this.live.song as BridgeSong;
    this.songView = this.live.songView as BridgeSongView;

    this.live.on("connect", () => {
      this.connected = true;
      void this.bootstrap();
      this.emit();
    });

    this.live.on("disconnect", () => {
      this.connected = false;
      this.clearObserverGroup(this.songObserverCleanups);
      this.clearTrackSubscription();
      this.emit();
    });
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
    if (!trackLocked && this.pendingSelectedTrack !== null) {
      const pendingTrack = this.pendingSelectedTrack;
      this.pendingSelectedTrack = null;
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
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
    this.connected = false;
    this.live.disconnect();
  }

  toggleTrackLock(): boolean {
    this.setTrackLocked(!this.trackLocked);
    return this.trackLocked;
  }

  private async applySelectedTrack(trackIndex: number): Promise<void> {
    if (this.selectedTrack === trackIndex) {
      return;
    }

    this.selectedTrackToken += 1;
    const token = this.selectedTrackToken;

    this.selectedTrack = trackIndex;
    this.trackName = null;
    this.trackColor = null;
    this.clearTrackSubscription();
    this.emit();

    const track = await this.getTrack(trackIndex);
    if (!track || token !== this.selectedTrackToken) {
      return;
    }

    this.trackName = toStringValue(await this.safeTrackGet(track, "name"));
    this.trackColor = toColorValue(await this.safeTrackGet(track, "color"));

    const stopPlayingSlot = await this.safeTrackObserve(
      track,
      "playing_slot_index",
      (slotIndex) => {
        if (this.selectedTrack !== trackIndex) {
          return;
        }

        void this.handlePlayingSlot(toNumber(slotIndex, -1));
      },
    );
    this.registerCleanup(this.trackObserverCleanups, stopPlayingSlot);

    const stopTrackName = await this.safeTrackObserve(track, "name", (name) => {
      if (this.selectedTrack !== trackIndex) {
        return;
      }

      this.trackName = toStringValue(name);
      this.emit();
    });
    this.registerCleanup(this.trackObserverCleanups, stopTrackName);

    const stopTrackColor = await this.safeTrackObserve(
      track,
      "color",
      (color) => {
        if (this.selectedTrack !== trackIndex) {
          return;
        }

        this.trackColor = toColorValue(color);
        this.emit();
      },
    );
    this.registerCleanup(this.trackObserverCleanups, stopTrackColor);

    const playingSlot = await this.safeTrackGet(track, "playing_slot_index");
    if (token !== this.selectedTrackToken) {
      return;
    }

    await this.handlePlayingSlot(toNumber(playingSlot, -1));
    this.emit();
  }

  private async bootstrap(): Promise<void> {
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();

    const stopSelectedTrack = await this.safeSongViewObserve(
      "selected_track",
      (trackData) => {
        void this.handleSelectedTrackPayload(trackData);
      },
    );
    this.registerCleanup(this.songObserverCleanups, stopSelectedTrack);

    const stopSignatureNumerator = await this.safeSongObserve(
      "signature_numerator",
      (value) => {
        this.signatureNumerator = Math.max(1, Math.round(toNumber(value, 4)));
        this.emit();
      },
    );
    this.registerCleanup(this.songObserverCleanups, stopSignatureNumerator);

    const stopSignatureDenominator = await this.safeSongObserve(
      "signature_denominator",
      (value) => {
        this.signatureDenominator = Math.max(1, Math.round(toNumber(value, 4)));
        this.emit();
      },
    );
    this.registerCleanup(this.songObserverCleanups, stopSignatureDenominator);

    const stopIsPlaying = await this.safeSongObserve("is_playing", (value) => {
      this.isPlaying = toBoolean(value);
      this.emit();
    });
    this.registerCleanup(this.songObserverCleanups, stopIsPlaying);

    const stopSongTime = await this.safeSongObserve(
      "current_song_time",
      (value) => {
        this.handleSongTime(toNumber(value, 0));
      },
    );
    this.registerCleanup(this.songObserverCleanups, stopSongTime);

    const [signatureNumerator, signatureDenominator, isPlaying, songTime] =
      await Promise.all([
        this.safeSongGet("signature_numerator"),
        this.safeSongGet("signature_denominator"),
        this.safeSongGet("is_playing"),
        this.safeSongGet("current_song_time"),
      ]);

    this.signatureNumerator = Math.max(
      1,
      Math.round(toNumber(signatureNumerator, 4)),
    );
    this.signatureDenominator = Math.max(
      1,
      Math.round(toNumber(signatureDenominator, 4)),
    );
    this.isPlaying = toBoolean(isPlaying);
    this.handleSongTime(toNumber(songTime, 0));

    const selectedTrack = await this.safeSongViewGet("selected_track");
    await this.handleSelectedTrackPayload(selectedTrack);

    this.emit();
  }

  private clearClipSubscription(preserveDisplay = false): void {
    this.clearObserverGroup(this.clipObserverCleanups);
    this.clearSceneSubscription(preserveDisplay);

    this.activeClip = null;
    if (!preserveDisplay) {
      this.clipName = null;
      this.clipColor = null;
    }
    this.clipMeta = {
      length: 4,
      loopEnd: 4,
      looping: false,
      loopStart: 0,
    };
    this.resetClipRunState();
  }

  private clearObserverGroup(cleanups: ObserverCleanup[]): void {
    for (const cleanup of cleanups.splice(0)) {
      void Promise.resolve(cleanup()).catch(() => undefined);
    }
  }

  private clearSceneSubscription(preserveDisplay = false): void {
    this.clearObserverGroup(this.sceneObserverCleanups);

    this.activeScene = null;
    if (!preserveDisplay) {
      this.sceneColor = null;
      this.sceneName = null;
    }
  }

  private clearTrackSubscription(): void {
    this.clearObserverGroup(this.trackObserverCleanups);
    this.clearClipSubscription();
  }

  private async connect(): Promise<void> {
    try {
      await this.live.connect();
    } catch {
      this.connected = false;
      this.emit();
    }
  }

  private emit(): void {
    if (this.transitionInProgress) {
      return;
    }

    const sceneColor = this.sceneColor === 0 ? null : this.sceneColor;

    const timingGrid = createTimingGrid(
      this.signatureNumerator,
      this.signatureDenominator,
    );
    const beatInBar = computeBeatInBar(
      this.beatCounter,
      timingGrid.beatsPerBar,
    );
    const isDownbeat = beatInBar === 1;

    let counterParts = defaultCounterParts();
    let isLastBar = false;
    let lastBarSource: LastBarSource = null;

    if (this.activeClip && this.currentPosition !== null) {
      const currentPosition = this.currentPosition;
      const launchPosition = this.launchPosition ?? currentPosition;
      const loopSpanValid = hasValidLoopSpan(this.clipMeta);

      if (loopSpanValid) {
        const hasLoopIntro = launchPosition < this.clipMeta.loopStart - EPSILON;
        const inLoopSection =
          this.loopWrapCount > 0 ||
          currentPosition >= this.clipMeta.loopStart - EPSILON;
        const isIntroPhase = hasLoopIntro && !inLoopSection;

        const remainingToLoopEnd = Math.max(
          this.clipMeta.loopEnd - currentPosition,
          0,
        );
        isLastBar = computeIsLastBar(
          remainingToLoopEnd,
          timingGrid.beatsPerBar,
        );
        lastBarSource = "loop_end";

        if (this.mode === "elapsed") {
          const elapsedBeats = isIntroPhase
            ? Math.max(currentPosition - launchPosition, 0)
            : Math.max(currentPosition - this.clipMeta.loopStart, 0);
          counterParts = toElapsedCounterParts(elapsedBeats, timingGrid);
        } else {
          counterParts = toRemainingCounterParts(
            remainingToLoopEnd,
            timingGrid,
          );
        }
      } else {
        const remainingToClipEnd = Math.max(
          this.clipMeta.length - currentPosition,
          0,
        );
        isLastBar = computeIsLastBar(
          remainingToClipEnd,
          timingGrid.beatsPerBar,
        );
        lastBarSource = "clip_end";

        if (this.mode === "elapsed") {
          const elapsedBeats = Math.max(currentPosition - launchPosition, 0);
          counterParts = toElapsedCounterParts(elapsedBeats, timingGrid);
        } else {
          counterParts = toRemainingCounterParts(
            remainingToClipEnd,
            timingGrid,
          );
        }
      }
    }

    this.onState({
      alwaysOnTop: false,
      beatFlashToken: this.beatFlashToken,
      beatInBar,
      clipColor: this.clipColor,
      clipIndex: this.activeClip?.clip ?? null,
      clipName: this.clipName,
      compactView: false,
      connected: this.connected,
      counterParts,
      counterText: formatCounterParts(counterParts),
      isDownbeat,
      isLastBar,
      isPlaying: this.isPlaying,
      lastBarSource,
      mode: this.mode,
      sceneColor,
      sceneName: this.sceneName,
      trackColor: this.trackColor,
      trackIndex: this.activeClip?.track ?? this.selectedTrack,
      trackLocked: this.trackLocked,
      trackName: this.trackName,
    });
  }

  private async getTrack(trackIndex: number): Promise<BridgeTrack | null> {
    try {
      const track = await this.song.child("tracks", trackIndex);
      return (track as BridgeTrack | null) ?? null;
    } catch {
      return null;
    }
  }

  private handlePlayingPosition(position: number): void {
    if (this.currentPosition === null) {
      this.launchPosition = position;
      this.currentPosition = position;
      this.previousPosition = position;
      this.loopWrapCount = 0;
      return;
    }

    const previous = this.currentPosition;
    if (position < previous - EPSILON) {
      if (this.isNaturalLoopWrap(previous, position)) {
        this.loopWrapCount += 1;
      } else {
        this.launchPosition = position;
        this.loopWrapCount = 0;
      }
    }

    this.previousPosition = previous;
    this.currentPosition = position;
    this.launchPosition ??= position;
  }

  private async handlePlayingSlot(slotIndex: number): Promise<void> {
    if (this.selectedTrack === null) {
      return;
    }

    if (slotIndex < 0) {
      if (this.isPlaying) {
        return;
      }
      this.clearClipSubscription();
      this.emit();
      return;
    }

    if (
      this.activeClip?.track === this.selectedTrack &&
      this.activeClip.clip === slotIndex
    ) {
      return;
    }

    this.transitionInProgress = true;
    try {
      this.clearClipSubscription(true);

      const trackIndex = this.selectedTrack;
      this.activeClip = { clip: slotIndex, track: trackIndex };
      this.activeScene = slotIndex;
      this.clipMeta = {
        length: 4,
        loopEnd: 4,
        looping: false,
        loopStart: 0,
      };
      this.resetClipRunState();

      const token = this.selectedTrackToken;
      await this.subscribeScene(slotIndex, token);

      const track = await this.getTrack(trackIndex);
      if (!track || token !== this.selectedTrackToken) {
        return;
      }

      const clipSlot = await this.safeTrackChild(track, slotIndex);
      if (!clipSlot || token !== this.selectedTrackToken) {
        return;
      }

      const hasClip = toBoolean(
        await this.safeClipSlotGet(clipSlot, "has_clip"),
      );
      if (!hasClip || token !== this.selectedTrackToken) {
        return;
      }

      const clip = await this.safeClipSlotClip(clipSlot);
      if (!clip || token !== this.selectedTrackToken) {
        return;
      }

      await this.subscribeClip(trackIndex, slotIndex, clip, token);
    } finally {
      this.transitionInProgress = false;
      this.emit();
    }
  }

  private handleSelectedTrack(trackIndex: number): void {
    if (trackIndex < 0) {
      return;
    }

    if (
      this.trackLocked &&
      this.selectedTrack !== null &&
      this.selectedTrack !== trackIndex
    ) {
      this.pendingSelectedTrack = trackIndex;
      return;
    }

    this.pendingSelectedTrack = null;
    void this.applySelectedTrack(trackIndex);
  }

  private async handleSelectedTrackPayload(payload: unknown): Promise<void> {
    const resolvedTrackIndex = await this.resolveTrackIndex(payload);
    this.handleSelectedTrack(resolvedTrackIndex);
  }

  private handleSongTime(songTime: number): void {
    const wholeBeat = Math.max(0, Math.floor(songTime + EPSILON));

    if (this.lastWholeBeat === null) {
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

  private isActiveClip(track: number, clip: number): boolean {
    return this.activeClip?.track === track && this.activeClip.clip === clip;
  }

  private isNaturalLoopWrap(
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
      wrappedDelta <= loopSpan + 1
    );
  }

  private registerCleanup(
    cleanupGroup: ObserverCleanup[],
    stop: null | ObserverCleanup,
  ): void {
    if (typeof stop === "function") {
      cleanupGroup.push(stop);
    }
  }

  private resetClipRunState(): void {
    this.launchPosition = null;
    this.currentPosition = null;
    this.previousPosition = null;
    this.loopWrapCount = 0;
  }

  private async resolveTrackIndex(selectedTrack: unknown): Promise<number> {
    if (typeof selectedTrack === "number" && Number.isInteger(selectedTrack)) {
      const tracks = await this.safeSongTracks();
      const matchedTrack = tracks.find((track) => {
        const directId = typeof track.id === "number" ? track.id : null;
        const rawId = toNumber(track.raw?.id ?? null, Number.NaN);
        return (
          directId === selectedTrack ||
          (Number.isFinite(rawId) && rawId === selectedTrack)
        );
      });

      if (matchedTrack) {
        const parsedIndex = parseTrackIndexFromPath(
          matchedTrack.path ?? matchedTrack.raw?.path ?? null,
        );
        if (parsedIndex >= 0) {
          return parsedIndex;
        }
      }

      return selectedTrack;
    }

    const record = toRecord(selectedTrack);
    const directPath = readString(record.path);
    const nestedRawPath = readString(toRecord(record.raw).path);
    const parsedIndex = parseTrackIndexFromPath(directPath ?? nestedRawPath);
    return parsedIndex >= 0 ? parsedIndex : -1;
  }

  private async safeClipGet(
    clip: BridgeClip,
    property: ClipProperty,
  ): Promise<unknown> {
    try {
      return await clip.get(property);
    } catch {
      return null;
    }
  }

  private async safeClipObserve(
    clip: BridgeClip,
    property: ClipProperty,
    listener: (value: unknown) => void,
  ): Promise<null | ObserverCleanup> {
    try {
      const stop = await clip.observe(property, listener);
      return typeof stop === "function" ? (stop as ObserverCleanup) : null;
    } catch {
      return null;
    }
  }

  private async safeClipSlotClip(
    clipSlot: BridgeClipSlot,
  ): Promise<BridgeClip | null> {
    try {
      const clip = await clipSlot.clip();
      return (clip as BridgeClip | null) ?? null;
    } catch {
      return null;
    }
  }

  private async safeClipSlotGet(
    clipSlot: BridgeClipSlot,
    property: "has_clip",
  ): Promise<unknown> {
    try {
      return await clipSlot.get(property);
    } catch {
      return null;
    }
  }

  private async safeSceneGet(
    scene: BridgeScene,
    property: SceneProperty,
  ): Promise<unknown> {
    try {
      return await scene.get(property);
    } catch {
      return null;
    }
  }

  private async safeSceneObserve(
    scene: BridgeScene,
    property: SceneProperty,
    listener: (value: unknown) => void,
  ): Promise<null | ObserverCleanup> {
    try {
      const stop = await scene.observe(property, listener);
      return typeof stop === "function" ? (stop as ObserverCleanup) : null;
    } catch {
      return null;
    }
  }

  private async safeSongGet(property: SongProperty): Promise<unknown> {
    try {
      return await this.song.get(property);
    } catch {
      return null;
    }
  }

  private async safeSongObserve(
    property: SongProperty,
    listener: (value: unknown) => void,
  ): Promise<null | ObserverCleanup> {
    try {
      const stop = await this.song.observe(property, listener);
      return typeof stop === "function" ? (stop as ObserverCleanup) : null;
    } catch {
      return null;
    }
  }

  private async safeSongSceneChild(
    sceneIndex: number,
  ): Promise<BridgeScene | null> {
    try {
      const scene = await this.song.child("scenes", sceneIndex);
      return (scene as BridgeScene | null) ?? null;
    } catch {
      return null;
    }
  }

  private async safeSongTracks(): Promise<BridgeTrack[]> {
    try {
      const tracks = await this.song.children("tracks");
      return Array.isArray(tracks) ? (tracks as BridgeTrack[]) : [];
    } catch {
      return [];
    }
  }

  private async safeSongViewGet(property: "selected_track"): Promise<unknown> {
    try {
      return await this.songView.get(property);
    } catch {
      return null;
    }
  }

  private async safeSongViewObserve(
    property: "selected_track",
    listener: (value: unknown) => void,
  ): Promise<null | ObserverCleanup> {
    try {
      const stop = await this.songView.observe(property, listener);
      return typeof stop === "function" ? (stop as ObserverCleanup) : null;
    } catch {
      return null;
    }
  }

  private async safeTrackChild(
    track: BridgeTrack,
    clipSlotIndex: number,
  ): Promise<BridgeClipSlot | null> {
    try {
      const clipSlot = await track.child("clip_slots", clipSlotIndex);
      return (clipSlot as BridgeClipSlot | null) ?? null;
    } catch {
      return null;
    }
  }

  private async safeTrackGet(
    track: BridgeTrack,
    property: TrackProperty,
  ): Promise<unknown> {
    try {
      return await track.get(property);
    } catch {
      return null;
    }
  }

  private async safeTrackObserve(
    track: BridgeTrack,
    property: TrackProperty,
    listener: (value: unknown) => void,
  ): Promise<null | ObserverCleanup> {
    try {
      const stop = await track.observe(property, listener);
      return typeof stop === "function" ? (stop as ObserverCleanup) : null;
    } catch {
      return null;
    }
  }

  private async subscribeClip(
    trackIndex: number,
    slotIndex: number,
    clip: BridgeClip,
    token: number,
  ): Promise<void> {
    const stopPlayingPosition = await this.safeClipObserve(
      clip,
      "playing_position",
      (value) => {
        if (!this.isActiveClip(trackIndex, slotIndex)) {
          return;
        }

        this.handlePlayingPosition(toNumber(value, 0));
        this.emit();
      },
    );
    this.registerCleanup(this.clipObserverCleanups, stopPlayingPosition);

    const stopClipName = await this.safeClipObserve(clip, "name", (value) => {
      if (!this.isActiveClip(trackIndex, slotIndex)) {
        return;
      }

      this.clipName = toStringValue(value);
      this.emit();
    });
    this.registerCleanup(this.clipObserverCleanups, stopClipName);

    const stopClipColor = await this.safeClipObserve(clip, "color", (value) => {
      if (!this.isActiveClip(trackIndex, slotIndex)) {
        return;
      }

      this.clipColor = toColorValue(value);
      this.emit();
    });
    this.registerCleanup(this.clipObserverCleanups, stopClipColor);

    const stopClipLength = await this.safeClipObserve(
      clip,
      "length",
      (value) => {
        if (!this.isActiveClip(trackIndex, slotIndex)) {
          return;
        }

        this.clipMeta.length = toNumber(value, this.clipMeta.length);
        this.emit();
      },
    );
    this.registerCleanup(this.clipObserverCleanups, stopClipLength);

    const stopLoopStart = await this.safeClipObserve(
      clip,
      "loop_start",
      (value) => {
        if (!this.isActiveClip(trackIndex, slotIndex)) {
          return;
        }

        this.clipMeta.loopStart = toNumber(value, this.clipMeta.loopStart);
        this.emit();
      },
    );
    this.registerCleanup(this.clipObserverCleanups, stopLoopStart);

    const stopLoopEnd = await this.safeClipObserve(
      clip,
      "loop_end",
      (value) => {
        if (!this.isActiveClip(trackIndex, slotIndex)) {
          return;
        }

        this.clipMeta.loopEnd = toNumber(value, this.clipMeta.loopEnd);
        this.emit();
      },
    );
    this.registerCleanup(this.clipObserverCleanups, stopLoopEnd);

    const stopLooping = await this.safeClipObserve(clip, "looping", (value) => {
      if (!this.isActiveClip(trackIndex, slotIndex)) {
        return;
      }

      this.clipMeta.looping = toBoolean(value);
      this.emit();
    });
    this.registerCleanup(this.clipObserverCleanups, stopLooping);

    const [
      playingPosition,
      clipColor,
      clipName,
      clipLength,
      loopStart,
      loopEnd,
      looping,
    ] = await Promise.all([
      this.safeClipGet(clip, "playing_position"),
      this.safeClipGet(clip, "color"),
      this.safeClipGet(clip, "name"),
      this.safeClipGet(clip, "length"),
      this.safeClipGet(clip, "loop_start"),
      this.safeClipGet(clip, "loop_end"),
      this.safeClipGet(clip, "looping"),
    ]);

    if (
      token !== this.selectedTrackToken ||
      !this.isActiveClip(trackIndex, slotIndex)
    ) {
      return;
    }

    this.handlePlayingPosition(toNumber(playingPosition, 0));
    this.clipColor = toColorValue(clipColor);
    this.clipName = toStringValue(clipName);
    this.clipMeta.length = toNumber(clipLength, this.clipMeta.length);
    this.clipMeta.loopStart = toNumber(loopStart, this.clipMeta.loopStart);
    this.clipMeta.loopEnd = toNumber(loopEnd, this.clipMeta.loopEnd);
    this.clipMeta.looping = toBoolean(looping);
  }

  private async subscribeScene(
    sceneIndex: number,
    token: number,
  ): Promise<void> {
    const scene = await this.safeSongSceneChild(sceneIndex);
    if (
      !scene ||
      token !== this.selectedTrackToken ||
      this.activeScene !== sceneIndex
    ) {
      return;
    }

    const stopSceneName = await this.safeSceneObserve(
      scene,
      "name",
      (value) => {
        if (this.activeScene !== sceneIndex) {
          return;
        }

        this.sceneName = toStringValue(value);
        this.emit();
      },
    );
    this.registerCleanup(this.sceneObserverCleanups, stopSceneName);

    const stopSceneColor = await this.safeSceneObserve(
      scene,
      "color",
      (value) => {
        if (this.activeScene !== sceneIndex) {
          return;
        }

        this.sceneColor = toSceneColorValue(value);
        this.emit();
      },
    );
    this.registerCleanup(this.sceneObserverCleanups, stopSceneColor);

    const [sceneColor, sceneName] = await Promise.all([
      this.safeSceneGet(scene, "color"),
      this.safeSceneGet(scene, "name"),
    ]);

    if (token !== this.selectedTrackToken || this.activeScene !== sceneIndex) {
      return;
    }

    this.sceneColor = toSceneColorValue(sceneColor);
    this.sceneName = toStringValue(sceneName);
  }
}

/**
 * Creates zeroed counter parts for initial HUD state.
 * @returns A counter parts object with all fields set to `0`.
 */
function defaultCounterParts(): CounterParts {
  return {
    bar: 0,
    beat: 0,
    sixteenth: 0,
  };
}

/**
 * Parses a zero-based track index from a Live track path string.
 * @param path - Track path value such as `live_set tracks 2`.
 * @returns The track index, or `-1` when unavailable.
 */
function parseTrackIndexFromPath(path: null | string): number {
  if (!path) {
    return -1;
  }

  const match = /tracks\s+(\d+)/u.exec(path);
  if (!match) {
    return -1;
  }

  return Number.parseInt(match[1], 10);
}

/**
 * Reads a string value when present.
 * @param value - The value to inspect.
 * @returns The string, or `null` when the value is not a string.
 */
function readString(value: unknown): null | string {
  return typeof value === "string" ? value : null;
}

/**
 * Resolves the Ableton Live bridge port from environment input.
 * @param value - Optional environment override.
 * @returns A valid TCP port, defaulting to `9001`.
 */
function resolveLivePort(value: string | undefined): number {
  if (!value) {
    return 9001;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 9001;
  }

  return parsed;
}

/**
 * Converts an unknown input into a boolean value.
 * @param value - The value to normalize.
 * @returns The normalized boolean representation.
 */
function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    return lowered === "true" || lowered === "1";
  }

  return false;
}

/**
 * Converts a color value to a normalized 24-bit RGB integer.
 * @param value - The color value to parse.
 * @returns The normalized RGB integer, or `null` when parsing fails.
 */
function toColorValue(value: unknown): null | number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return (Math.round(parsed) >>> 0) & 0xffffff;
}

/**
 * Converts an unknown input to a finite number.
 * @param value - The value to parse.
 * @param fallback - The value to use when parsing fails.
 * @returns The parsed number or fallback.
 */
function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Casts an unknown value to an object record when possible.
 * @param value - The value to inspect.
 * @returns The object record or an empty object.
 */
function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Converts scene color values, treating `0` as "no color".
 * @param value - Raw scene color value from Live.
 * @returns Normalized RGB color or `null` when scene has no color.
 */
function toSceneColorValue(value: unknown): null | number {
  const color = toColorValue(value);
  return color === 0 ? null : color;
}

/**
 * Converts an unknown input to a string where possible.
 * @param value - The value to parse.
 * @returns The string representation, or an empty string for unsupported values.
 */
function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  return "";
}
