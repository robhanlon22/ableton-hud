import type { HudMode, HudState } from "@shared/types";

import type {
  BridgeDeps,
  LiveClip,
  SongProperty,
} from "./ableton-live-bridge-types";

import { AbletonLiveBridgeBase } from "./ableton-live-bridge-base";
import { LiveBridgeAccess } from "./ableton-live-bridge-live-access";
import { buildHudState } from "./ableton-live-bridge-state";
import { LiveBridgeSubscriptionController } from "./ableton-live-bridge-subscription-controller";
import { observeSongMetric } from "./ableton-live-bridge-subscriptions";
import {
  DEFAULT_CLIP_META,
  INACTIVE_SLOT_INDEX,
} from "./ableton-live-bridge-types";

export {
  defaultLiveFactory,
  defaultPayloadNormalizers,
  parseTrackIndexFromPath,
  resolveLivePort,
  toBoolean,
  toColorValue,
  toNumber,
  toSceneColorValue,
  toStringValue,
} from "./ableton-live-bridge-normalizers";
export type {
  BridgeDeps,
  ClipProperty,
  LiveClient,
  LiveClip,
  LiveClipSlot,
  LiveFactory,
  LiveScene,
  LiveSong,
  LiveSongView,
  LiveTrack,
  PayloadNormalizers,
  SceneProperty,
  SongProperty,
  TrackProperty,
} from "./ableton-live-bridge-types";

export class AbletonLiveBridge extends AbletonLiveBridgeBase {
  private readonly access: LiveBridgeAccess;
  private readonly subscriptions: LiveBridgeSubscriptionController;

  constructor(
    mode: HudMode,
    onState: (state: HudState) => void,
    trackLocked = false,
    deps: BridgeDeps = {},
  ) {
    super(mode, onState, trackLocked, deps);
    this.access = new LiveBridgeAccess(
      this.song,
      this.songView,
      this.normalizers,
    );
    this.subscriptions = new LiveBridgeSubscriptionController({
      clipMeta: this.clipMeta,
      clipObserverCleanups: this.clipObserverCleanups,
      emit: () => {
        this.emit();
      },
      getActiveScene: () => this.activeScene,
      getSelectedTrack: () => this.selectedTrack,
      getSelectedTrackToken: () => this.selectedTrackToken,
      handlePlayingPosition: (position) => {
        this.handlePlayingPosition(position);
      },
      handlePlayingSlot: (slotIndex) => {
        return this.handlePlayingSlot(slotIndex);
      },
      isActiveClip: (track, clip) => this.isActiveClip(track, clip),
      normalizers: this.normalizers,
      registerCleanup: (cleanupGroup, stop) => {
        this.registerCleanup(cleanupGroup, stop);
      },
      safeClipGet: (clip, property) => this.access.safeClipGet(clip, property),
      safeClipObserve: (clip, property, listener) => {
        return this.access.safeClipObserve(clip, property, listener);
      },
      safeSceneGet: (scene, property) =>
        this.access.safeSceneGet(scene, property),
      safeSceneObserve: (scene, property, listener) => {
        return this.access.safeSceneObserve(scene, property, listener);
      },
      safeSongSceneChild: (sceneIndex) =>
        this.access.safeSongSceneChild(sceneIndex),
      safeTrackGet: (track, property) =>
        this.access.safeTrackGet(track, property),
      safeTrackObserve: (track, property, listener) => {
        return this.access.safeTrackObserve(track, property, listener);
      },
      sceneObserverCleanups: this.sceneObserverCleanups,
      setClipColor: (color) => {
        this.clipColor = color;
      },
      setClipName: (name) => {
        this.clipName = name;
      },
      setSceneColor: (color) => {
        this.sceneColor = color;
      },
      setSceneName: (name) => {
        this.sceneName = name;
      },
      setTrackColor: (color) => {
        this.trackColor = color;
      },
      setTrackName: (name) => {
        this.trackName = name;
      },
      trackObserverCleanups: this.trackObserverCleanups,
      unplayedSlotIndex: INACTIVE_SLOT_INDEX,
    });
  }

  protected async applySelectedTrack(trackIndex: number): Promise<void> {
    if (this.selectedTrack === trackIndex) {
      return;
    }

    const token = this.beginTrackSelection(trackIndex);
    const track = await this.access.getTrack(trackIndex);
    if (track === undefined || token !== this.selectedTrackToken) {
      return;
    }

    await this.subscriptions.syncTrackState(track);
    await this.subscriptions.observeTrack(track, trackIndex);

    const playingSlot = await this.access.safeTrackGet(
      track,
      "playing_slot_index",
    );
    if (token !== this.selectedTrackToken) {
      return;
    }

    await this.handlePlayingSlot(
      this.normalizers.toNumber(playingSlot, INACTIVE_SLOT_INDEX),
    );
    this.emit();
  }

  protected async bootstrap(epoch = this.connectionEpoch): Promise<void> {
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    this.resetSongSubscriptions();
    await this.observeSong();
    await this.syncSongState(epoch);
  }

  protected async connect(): Promise<void> {
    if (!this.started || this.connected || this.connectInFlight) {
      return;
    }

    this.connectInFlight = true;
    let shouldRetry = false;
    try {
      await this.live.connect();
    } catch {
      this.connected = false;
      this.emit();
      shouldRetry = true;
    } finally {
      this.connectInFlight = false;
    }

    if (shouldRetry) {
      this.scheduleReconnect();
    }
  }

  protected emit(): void {
    if (this.transitionInProgress) {
      return;
    }

    this.onState(
      buildHudState({
        activeClip: this.activeClip,
        beatCounter: this.beatCounter,
        beatFlashToken: this.beatFlashToken,
        clipColor: this.clipColor,
        clipMeta: this.clipMeta,
        clipName: this.clipName,
        connected: this.connected,
        currentPosition: this.currentPosition,
        isPlaying: this.isPlaying,
        launchPosition: this.launchPosition,
        loopWrapCount: this.loopWrapCount,
        mode: this.mode,
        sceneColor: this.sceneColor,
        sceneName: this.sceneName,
        selectedTrack: this.selectedTrack,
        signatureDenominator: this.signatureDenominator,
        signatureNumerator: this.signatureNumerator,
        trackColor: this.trackColor,
        trackLocked: this.trackLocked,
        trackName: this.trackName,
      }),
    );
  }

  private async activatePlayingSlot(
    trackIndex: number,
    slotIndex: number,
  ): Promise<void> {
    this.transitionInProgress = true;
    try {
      this.preparePlayingSlot(trackIndex, slotIndex);
      const token = this.selectedTrackToken;
      const clip = await this.loadActiveClip(trackIndex, slotIndex, token);
      if (clip !== undefined) {
        await this.subscribeClip(trackIndex, slotIndex, clip, token);
      }
    } finally {
      this.transitionInProgress = false;
      this.emit();
    }
  }

  private beginTrackSelection(trackIndex: number): number {
    this.selectedTrackToken += 1;
    this.selectedTrack = trackIndex;
    this.trackName = undefined;
    this.trackColor = undefined;
    this.clearTrackSubscription();
    this.emit();
    return this.selectedTrackToken;
  }

  private handleInactiveSlot(): void {
    if (this.isPlaying) {
      return;
    }

    this.clearClipSubscription();
    this.emit();
  }

  private handlePlayingPosition(position: number): void {
    if (this.currentPosition === undefined) {
      this.launchPosition = position;
      this.currentPosition = position;
      this.previousPosition = position;
      this.loopWrapCount = 0;
      return;
    }

    const previous = this.currentPosition;
    if (position < previous) {
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
    if (this.selectedTrack === undefined) {
      return;
    }

    if (slotIndex < 0) {
      this.handleInactiveSlot();
      return;
    }

    if (this.isActiveClip(this.selectedTrack, slotIndex)) {
      return;
    }

    await this.activatePlayingSlot(this.selectedTrack, slotIndex);
  }

  private async loadActiveClip(
    trackIndex: number,
    slotIndex: number,
    token: number,
  ): Promise<LiveClip | undefined> {
    await this.subscribeScene(slotIndex, token);
    const track = await this.access.getTrack(trackIndex);
    if (track === undefined || token !== this.selectedTrackToken) {
      return undefined;
    }

    const clipSlot = await this.access.safeTrackChild(track, slotIndex);
    if (clipSlot === undefined || token !== this.selectedTrackToken) {
      return undefined;
    }

    const hasClip = this.normalizers.toBoolean(
      await this.access.safeClipSlotGet(clipSlot, "has_clip"),
    );
    if (!hasClip || token !== this.selectedTrackToken) {
      return undefined;
    }

    const clip = await this.access.safeClipSlotClip(clipSlot);
    return token === this.selectedTrackToken ? clip : undefined;
  }

  private async observeSelectedTrack(): Promise<void> {
    const stop = await this.access.safeSongViewObserve(
      "selected_track",
      (trackData) => {
        void this.resolveTrackIndex(trackData).then((trackIndex) => {
          this.handleSelectedTrack(trackIndex);
        });
      },
    );
    this.registerCleanup(this.songObserverCleanups, stop);
  }

  private async observeSong(): Promise<void> {
    await this.observeSelectedTrack();
    await this.observeSongMetricValue("signature_numerator", (value) => {
      this.signatureNumerator = Math.max(
        1,
        Math.round(this.normalizers.toNumber(value)),
      );
    });
    await this.observeSongMetricValue("signature_denominator", (value) => {
      this.signatureDenominator = Math.max(
        1,
        Math.round(this.normalizers.toNumber(value)),
      );
    });
    await this.observeSongMetricValue("is_playing", (value) => {
      this.isPlaying = this.normalizers.toBoolean(value);
    });
    await this.observeSongMetricValue("current_song_time", (value) => {
      this.handleSongTime(this.normalizers.toNumber(value));
    });
  }

  private async observeSongMetricValue(
    property: SongProperty,
    applyValue: (value: unknown) => void,
  ): Promise<void> {
    await observeSongMetric({
      applyValue,
      emit: this.emit.bind(this),
      property,
      registerCleanup: this.registerCleanup.bind(this),
      safeSongObserve: this.access.safeSongObserve.bind(this.access),
      songObserverCleanups: this.songObserverCleanups,
    });
  }

  private preparePlayingSlot(trackIndex: number, slotIndex: number): void {
    this.clearClipSubscription(true);
    this.activeClip = { clip: slotIndex, track: trackIndex };
    this.activeScene = slotIndex;
    this.clipMeta = { ...DEFAULT_CLIP_META };
    this.resetClipRunState();
  }

  private resetSongSubscriptions(): void {
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
  }

  private async resolveTrackIndex(selectedTrack: unknown): Promise<number> {
    return this.access.resolveTrackIndex(selectedTrack);
  }

  private async subscribeClip(
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ): Promise<void> {
    await this.subscriptions.subscribeClip(trackIndex, slotIndex, clip, token);
  }

  private async subscribeScene(
    sceneIndex: number,
    token: number,
  ): Promise<void> {
    await this.subscriptions.subscribeScene(sceneIndex, token);
  }

  private async syncSongState(epoch: number): Promise<void> {
    const [signatureNumerator, signatureDenominator, isPlaying, songTime] =
      await Promise.all([
        this.access.safeSongGet("signature_numerator"),
        this.access.safeSongGet("signature_denominator"),
        this.access.safeSongGet("is_playing"),
        this.access.safeSongGet("current_song_time"),
      ]);
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    this.signatureNumerator = Math.max(
      1,
      Math.round(this.normalizers.toNumber(signatureNumerator)),
    );
    this.signatureDenominator = Math.max(
      1,
      Math.round(this.normalizers.toNumber(signatureDenominator)),
    );
    this.isPlaying = this.normalizers.toBoolean(isPlaying);
    this.handleSongTime(this.normalizers.toNumber(songTime));

    const selectedTrack = await this.access.safeSongViewGet("selected_track");
    this.handleSelectedTrack(await this.resolveTrackIndex(selectedTrack));
    this.emit();
  }
}
