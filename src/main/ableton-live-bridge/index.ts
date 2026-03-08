import type { HudMode, HudState } from "@shared/types";

import type { BridgeDeps, LiveClip, SongProperty } from "./types";

import { AbletonLiveBridgeBase } from "./base";
import { LiveBridgeAccess } from "./live-access";
import { buildHudState } from "./state";
import {
  LiveBridgeSubscriptionController,
  LiveBridgeSubscriptionState,
} from "./subscription-controller";
import { observeSongMetric } from "./subscriptions";
import { DEFAULT_CLIP_META, INACTIVE_SLOT_INDEX } from "./types";

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
} from "./normalizers";
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
} from "./types";

/**
 * Coordinates bridge connection state, song observation, and clip selection updates.
 */
export class AbletonLiveBridge extends AbletonLiveBridgeBase {
  private readonly access: LiveBridgeAccess;
  private readonly subscriptions: LiveBridgeSubscriptionController;

  /**
   * Builds the bridge runtime and wires the subscription controller dependencies.
   * @param mode - The initial counter mode.
   * @param onState - HUD state sink.
   * @param trackLocked - Whether track selection should stay pinned.
   * @param deps - Optional dependency overrides for tests.
   */
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
    const subscriptionState = new LiveBridgeSubscriptionState({
      access: this.access,
      bridge: this,
      clipMeta: this.clipMeta,
      clipObserverCleanups: this.clipObserverCleanups,
      emit: this.emit.bind(this),
      handlePlayingPosition: this.handlePlayingPosition.bind(this),
      isActiveClip: this.isActiveClip.bind(this),
      normalizers: this.normalizers,
      registerCleanup: this.registerCleanup.bind(this),
      sceneObserverCleanups: this.sceneObserverCleanups,
      trackObserverCleanups: this.trackObserverCleanups,
      unplayedSlotIndex: INACTIVE_SLOT_INDEX,
    });
    this.subscriptions = new LiveBridgeSubscriptionController(
      subscriptionState.createDeps(),
    );
  }

  /**
   * Returns the active scene index used by scene observers.
   * @returns The current active scene index.
   */
  public readonly getActiveScene = (): number | undefined => this.activeScene;

  /**
   * Returns the selected track index used by track observers.
   * @returns The current selected track index.
   */
  public readonly getSelectedTrack = (): number | undefined =>
    this.selectedTrack;

  /**
   * Returns the selected-track token used to guard async work.
   * @returns The current selected-track token.
   */
  public readonly getSelectedTrackToken = (): number => this.selectedTrackToken;

  /**
   * Reacts to Live's playing-slot updates for the selected track.
   * @param slotIndex - Zero-based playing clip-slot index, or a negative sentinel.
   * @returns A promise that settles after the slot transition is handled.
   */
  public async handlePlayingSlot(slotIndex: number): Promise<void> {
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

  /**
   * Stores the current clip color snapshot.
   * @param color - Normalized clip color, when available.
   */
  public readonly setClipColor = (color: number | undefined): void => {
    this.clipColor = color;
  };

  /**
   * Stores the current clip name snapshot.
   * @param name - Clip name emitted by Live.
   */
  public readonly setClipName = (name: string): void => {
    this.clipName = name;
  };

  /**
   * Stores the current scene color snapshot.
   * @param color - Normalized scene color, when available.
   */
  public readonly setSceneColor = (color: number | undefined): void => {
    this.sceneColor = color;
  };

  /**
   * Stores the current scene name snapshot.
   * @param name - Scene name emitted by Live.
   */
  public readonly setSceneName = (name: string): void => {
    this.sceneName = name;
  };

  /**
   * Stores the current selected-track color snapshot.
   * @param color - Normalized track color, when available.
   */
  public readonly setTrackColor = (color: number | undefined): void => {
    this.trackColor = color;
  };

  /**
   * Stores the current selected-track name snapshot.
   * @param name - Track name emitted by Live.
   */
  public readonly setTrackName = (name: string): void => {
    this.trackName = name;
  };

  /**
   * Applies a newly selected track and refreshes its observed state.
   * @param trackIndex - Zero-based selected track index.
   * @returns A promise that settles after track observers are in sync.
   */
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

  /**
   * Resets bridge observers and syncs the initial song snapshot.
   * @param epoch - Connection epoch tied to the current bridge session.
   * @returns A promise that settles after the song state is synchronized.
   */
  protected async bootstrap(epoch = this.connectionEpoch): Promise<void> {
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    this.resetSongSubscriptions();
    await this.observeSong();
    await this.syncSongState(epoch);
  }

  /**
   * Connects to Ableton Live, retrying later when the socket is unavailable.
   * @returns A promise that settles after the current connection attempt finishes.
   */
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

  /**
   * Emits the current normalized HUD snapshot unless a transition is still running.
   */
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

  /**
   * Activates a playing slot and resubscribes the bridge to the new clip.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based playing clip-slot index.
   * @returns A promise that settles after clip observers are updated.
   */
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

  /**
   * Starts a new selected-track transaction and clears stale track state.
   * @param trackIndex - Zero-based selected track index.
   * @returns The token assigned to the new track-selection transaction.
   */
  private beginTrackSelection(trackIndex: number): number {
    this.selectedTrackToken += 1;
    this.selectedTrack = trackIndex;
    this.trackName = undefined;
    this.trackColor = undefined;
    this.clearTrackSubscription();
    this.emit();
    return this.selectedTrackToken;
  }

  /**
   * Clears clip state when playback has moved off any active slot.
   */
  private handleInactiveSlot(): void {
    if (this.isPlaying) {
      return;
    }

    this.clearClipSubscription();
    this.emit();
  }

  /**
   * Tracks song playback position and detects loop wraps or fresh launches.
   * @param position - Current song position in beats.
   */
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

  /**
   * Loads the currently active clip for the selected slot when it still exists.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based clip-slot index.
   * @param token - Selection token guarding against stale async work.
   * @returns The resolved clip when it is still current.
   */
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

  /**
   * Observes selected-track changes from Live's song-view surface.
   * @returns A promise that settles after the observer is registered.
   */
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

  /**
   * Registers song-level observers used by the HUD bridge.
   * @returns A promise that settles after all song observers are attached.
   */
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

  /**
   * Observes a song property and applies its normalized value to bridge state.
   * @param property - The Live song property to observe.
   * @param applyValue - State updater for the observed value.
   * @returns A promise that settles after the observer is registered.
   */
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

  /**
   * Prepares bridge state for a newly activated playing slot.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based clip-slot index.
   */
  private preparePlayingSlot(trackIndex: number, slotIndex: number): void {
    this.clearClipSubscription(true);
    this.activeClip = { clip: slotIndex, track: trackIndex };
    this.activeScene = slotIndex;
    this.clipMeta = { ...DEFAULT_CLIP_META };
    this.resetClipRunState();
  }

  /**
   * Clears song-level observers before reconnecting or resynchronizing.
   */
  private resetSongSubscriptions(): void {
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
  }

  /**
   * Resolves a selected-track payload into a zero-based track index.
   * @param selectedTrack - Raw selected-track payload from Live.
   * @returns The resolved track index.
   */
  private async resolveTrackIndex(selectedTrack: unknown): Promise<number> {
    return this.access.resolveTrackIndex(selectedTrack);
  }

  /**
   * Delegates clip subscription wiring to the subscription controller.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based clip-slot index.
   * @param clip - Active clip to subscribe to.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after clip observers are registered.
   */
  private async subscribeClip(
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ): Promise<void> {
    await this.subscriptions.subscribeClip(trackIndex, slotIndex, clip, token);
  }

  /**
   * Delegates scene subscription wiring to the subscription controller.
   * @param sceneIndex - Zero-based scene index matching the active slot.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after scene observers are registered.
   */
  private async subscribeScene(
    sceneIndex: number,
    token: number,
  ): Promise<void> {
    await this.subscriptions.subscribeScene(sceneIndex, token);
  }

  /**
   * Syncs the initial song snapshot before normal observers take over.
   * @param epoch - Connection epoch tied to the current bridge session.
   * @returns A promise that settles after the initial song state is applied.
   */
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
