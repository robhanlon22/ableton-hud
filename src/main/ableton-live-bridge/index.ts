/* eslint-disable max-lines -- Keeping bridge orchestration in one place is simpler than splitting it into adapter files. */
import type { HudMode, HudState } from "@shared/types";

import type {
  BridgeDeps,
  LiveClip,
  LiveScene,
  LiveTrack,
  SongProperty,
} from "./types";

import { AbletonLiveBridgeBase } from "./base";
import { LiveBridgeAccess } from "./live-access";
import { buildHudState } from "./state";
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
 * Identifies the currently active clip by track and slot index.
 */
interface ActiveClipKey {
  /** Zero-based clip-slot index. */
  clip: number;
  /** Zero-based track index. */
  track: number;
}

/**
 * Owns the Ableton Live bridge lifecycle and HUD-facing runtime state.
 */
export class AbletonLiveBridge extends AbletonLiveBridgeBase {
  readonly access: LiveBridgeAccess;

  /**
   * Builds the bridge runtime around the guarded Live access layer.
   * @param mode - Initial counter mode.
   * @param onState - HUD state sink.
   * @param trackLocked - Whether track selection starts locked.
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
  }

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

    await this.syncSelectedTrackState(track);
    await this.observeTrack(track, trackIndex);

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
   * Resets song observers and synchronizes the initial song snapshot.
   * @param epoch - Connection epoch tied to the current bridge session.
   * @returns A promise that settles after song state is synchronized.
   */
  protected async bootstrap(epoch = this.connectionEpoch): Promise<void> {
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    this.resetSongSubscriptions();
    await this.observeSelectedTrack();
    await this.observeSongProperty("signature_numerator", (value) => {
      this.signatureNumerator = Math.max(
        1,
        Math.round(this.normalizers.toNumber(value)),
      );
    });
    await this.observeSongProperty("signature_denominator", (value) => {
      this.signatureDenominator = Math.max(
        1,
        Math.round(this.normalizers.toNumber(value)),
      );
    });
    await this.observeSongProperty("is_playing", (value) => {
      this.isPlaying = this.normalizers.toBoolean(value);
    });
    await this.observeSongProperty("current_song_time", (value) => {
      return this.handleSongTime(this.normalizers.toNumber(value));
    });
    await this.syncSongState(epoch);
  }

  /** @returns A promise that settles after connecting or scheduling a retry. */
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

  /** Emits the current normalized HUD snapshot unless a transition is running. */
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
   * Starts a track-selection transaction and clears stale track display state.
   * @param trackIndex - Zero-based selected track index.
   * @returns The token assigned to the selection transaction.
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

  /** Clears clip state when playback has stopped on the selected track. */
  private handleInactiveSlot(): void {
    if (this.isPlaying) {
      return;
    }

    this.clearClipSubscription();
    this.emit();
  }

  /**
   * Tracks clip playback position and detects loop wraps or relaunches.
   * @param position - Current clip position in beats.
   */
  private handlePlayingPosition(position: number): void {
    if (this.currentPosition === undefined) {
      this.currentPosition = position;
      this.launchPosition = position;
      this.loopWrapCount = 0;
      this.previousPosition = position;
      return;
    }

    if (position < this.currentPosition) {
      if (this.isNaturalLoopWrap(this.currentPosition, position)) {
        this.loopWrapCount += 1;
      } else {
        this.launchPosition = position;
        this.loopWrapCount = 0;
      }
    }

    this.previousPosition = this.currentPosition;
    this.currentPosition = position;
    this.launchPosition ??= position;
  }

  /**
   * Reacts to Live's playing-slot updates for the selected track.
   * @param slotIndex - Zero-based playing clip-slot index, or a negative sentinel.
   * @returns A promise that settles after the slot transition is handled.
   */
  private async handlePlayingSlot(slotIndex: number): Promise<void> {
    const selectedTrack = this.selectedTrack;
    if (selectedTrack === undefined) {
      return;
    }

    if (slotIndex < 0) {
      this.handleInactiveSlot();
      return;
    }

    if (this.isActiveClip(selectedTrack, slotIndex)) {
      return;
    }

    this.transitionInProgress = true;
    try {
      const token = this.selectedTrackToken;
      this.preparePlayingSlot(selectedTrack, slotIndex);
      await this.subscribeScene(slotIndex, token);
      const clip = await this.loadActiveClip(selectedTrack, slotIndex, token);
      if (clip !== undefined) {
        await this.subscribeClip(selectedTrack, slotIndex, clip, token);
      }
    } finally {
      this.transitionInProgress = false;
      this.emit();
    }
  }

  /**
   * Loads the active clip for the selected slot when it still exists.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based clip-slot index.
   * @param token - Selection token guarding against stale async work.
   * @returns The active clip when it is still current.
   */
  private async loadActiveClip(
    trackIndex: number,
    slotIndex: number,
    token: number,
  ): Promise<LiveClip | undefined> {
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
   * Registers clip observers for the currently active clip.
   * @param clip - Active clip to observe.
   * @param activeClip - Active clip identity to guard observer callbacks.
   * @returns A promise that settles after all clip observers are attached.
   */
  private async observeClip(
    clip: LiveClip,
    activeClip: ActiveClipKey,
  ): Promise<void> {
    await this.observeClipProperty(
      clip,
      activeClip,
      "playing_position",
      (value) => {
        this.handlePlayingPosition(this.normalizers.toNumber(value));
      },
    );
    await this.observeClipProperty(clip, activeClip, "name", (value) => {
      this.clipName = this.normalizers.toStringValue(value);
    });
    await this.observeClipProperty(clip, activeClip, "color", (value) => {
      this.clipColor = this.normalizers.toColorValue(value);
    });
    await this.observeClipProperty(clip, activeClip, "length", (value) => {
      this.clipMeta.length = this.normalizers.toNumber(
        value,
        this.clipMeta.length,
      );
    });
    await this.observeClipProperty(clip, activeClip, "loop_start", (value) => {
      this.clipMeta.loopStart = this.normalizers.toNumber(
        value,
        this.clipMeta.loopStart,
      );
    });
    await this.observeClipProperty(clip, activeClip, "loop_end", (value) => {
      this.clipMeta.loopEnd = this.normalizers.toNumber(
        value,
        this.clipMeta.loopEnd,
      );
    });
    await this.observeClipProperty(clip, activeClip, "looping", (value) => {
      this.clipMeta.looping = this.normalizers.toBoolean(value);
    });
  }

  /**
   * Observes a clip property while the given clip remains active.
   * @param clip - Active clip to observe.
   * @param activeClip - Active clip identity to guard observer callbacks.
   * @param property - Clip property to observe.
   * @param applyValue - State update to apply for observed values.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeClipProperty(
    clip: LiveClip,
    activeClip: ActiveClipKey,
    property:
      | "color"
      | "length"
      | "loop_end"
      | "loop_start"
      | "looping"
      | "name"
      | "playing_position",
    applyValue: (value: unknown) => void,
  ): Promise<void> {
    const stop = await this.access.safeClipObserve(clip, property, (value) => {
      if (!this.isActiveClip(activeClip.track, activeClip.clip)) {
        return;
      }

      applyValue(value);
      this.emit();
    });
    this.registerCleanup(this.clipObserverCleanups, stop);
  }

  /**
   * Observes a scene property while the given scene remains active.
   * @param scene - Active scene to observe.
   * @param sceneIndex - Zero-based active scene index.
   * @param property - Scene property to observe.
   * @param applyValue - State update to apply for observed values.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeSceneProperty(
    scene: LiveScene,
    sceneIndex: number,
    property: "color" | "name",
    applyValue: (value: unknown) => void,
  ): Promise<void> {
    const stop = await this.access.safeSceneObserve(
      scene,
      property,
      (value) => {
        if (this.activeScene !== sceneIndex) {
          return;
        }

        applyValue(value);
        this.emit();
      },
    );
    this.registerCleanup(this.sceneObserverCleanups, stop);
  }

  /** @returns A promise that settles after the selected-track observer is registered. */
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
   * Observes song-level state needed by the HUD.
   * @param property - Song property to observe.
   * @param applyValue - State update to apply for observed values.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeSongProperty(
    property: SongProperty,
    applyValue: (value: unknown) => unknown,
  ): Promise<void> {
    const stop = await this.access.safeSongObserve(property, (value) => {
      if (applyValue(value) !== false) {
        this.emit();
      }
    });
    this.registerCleanup(this.songObserverCleanups, stop);
  }

  /**
   * Observes selected-track metadata and playing-slot changes.
   * @param track - Selected Live track.
   * @param trackIndex - Zero-based selected track index.
   * @returns A promise that settles after track observers are attached.
   */
  private async observeTrack(
    track: LiveTrack,
    trackIndex: number,
  ): Promise<void> {
    const stopPlayingSlot = await this.access.safeTrackObserve(
      track,
      "playing_slot_index",
      (slotIndex) => {
        if (this.selectedTrack !== trackIndex) {
          return;
        }

        void this.handlePlayingSlot(
          this.normalizers.toNumber(slotIndex, INACTIVE_SLOT_INDEX),
        );
      },
    );
    const stopTrackName = await this.access.safeTrackObserve(
      track,
      "name",
      (name) => {
        if (this.selectedTrack !== trackIndex) {
          return;
        }

        this.trackName = this.normalizers.toStringValue(name);
        this.emit();
      },
    );
    const stopTrackColor = await this.access.safeTrackObserve(
      track,
      "color",
      (color) => {
        if (this.selectedTrack !== trackIndex) {
          return;
        }

        this.trackColor = this.normalizers.toColorValue(color);
        this.emit();
      },
    );

    this.registerCleanup(this.trackObserverCleanups, stopPlayingSlot);
    this.registerCleanup(this.trackObserverCleanups, stopTrackName);
    this.registerCleanup(this.trackObserverCleanups, stopTrackColor);
  }

  /**
   * Prepares bridge state for a newly activated playing slot.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based active clip-slot index.
   */
  private preparePlayingSlot(trackIndex: number, slotIndex: number): void {
    this.clearClipSubscription(true);
    this.activeClip = { clip: slotIndex, track: trackIndex };
    this.activeScene = slotIndex;
    this.clipMeta = { ...DEFAULT_CLIP_META };
    this.resetClipRunState();
  }

  /** Clears song-level observers before reconnecting or resynchronizing. */
  private resetSongSubscriptions(): void {
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
  }

  /**
   * Resolves a selected-track payload into a zero-based track index.
   * @param selectedTrack - Raw selected-track payload from Live.
   * @returns The resolved track index.
   */
  private resolveTrackIndex(selectedTrack: unknown): Promise<number> {
    return this.access.resolveTrackIndex(selectedTrack);
  }

  /**
   * Observes the active clip and syncs its initial snapshot.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based active clip-slot index.
   * @param clip - Active clip to observe.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after clip observers and snapshot sync complete.
   */
  private async subscribeClip(
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ): Promise<void> {
    const activeClip = this.activeClip;
    if (activeClip?.track !== trackIndex || activeClip.clip !== slotIndex) {
      return;
    }

    await this.observeClip(clip, activeClip);
    await this.syncClipSnapshot(clip, activeClip, token);
  }

  /**
   * Observes the active scene and syncs its initial snapshot.
   * @param sceneIndex - Zero-based active scene index.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after scene observers and snapshot sync complete.
   */
  private async subscribeScene(
    sceneIndex: number,
    token: number,
  ): Promise<void> {
    const scene = await this.access.safeSongSceneChild(sceneIndex);
    if (
      scene === undefined ||
      token !== this.selectedTrackToken ||
      this.activeScene !== sceneIndex
    ) {
      return;
    }

    await this.observeSceneProperty(scene, sceneIndex, "name", (value) => {
      this.sceneName = this.normalizers.toStringValue(value);
    });
    await this.observeSceneProperty(scene, sceneIndex, "color", (value) => {
      this.sceneColor = this.normalizers.toSceneColorValue(value);
    });

    const [sceneColor, sceneName] = await Promise.all([
      this.access.safeSceneGet(scene, "color"),
      this.access.safeSceneGet(scene, "name"),
    ]);
    if (token === this.selectedTrackToken && this.activeScene === sceneIndex) {
      this.sceneColor = this.normalizers.toSceneColorValue(sceneColor);
      this.sceneName = this.normalizers.toStringValue(sceneName);
    }
  }

  /**
   * Reads the initial clip snapshot after clip observers are attached.
   * @param clip - Active clip to read.
   * @param activeClip - Active clip identity to guard against stale async work.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after the snapshot is applied.
   */
  private async syncClipSnapshot(
    clip: LiveClip,
    activeClip: ActiveClipKey,
    token: number,
  ): Promise<void> {
    const [
      playingPosition,
      clipColor,
      clipName,
      clipLength,
      loopStart,
      loopEnd,
      looping,
    ] = await Promise.all([
      this.access.safeClipGet(clip, "playing_position"),
      this.access.safeClipGet(clip, "color"),
      this.access.safeClipGet(clip, "name"),
      this.access.safeClipGet(clip, "length"),
      this.access.safeClipGet(clip, "loop_start"),
      this.access.safeClipGet(clip, "loop_end"),
      this.access.safeClipGet(clip, "looping"),
    ]);

    if (
      token !== this.selectedTrackToken ||
      !this.isActiveClip(activeClip.track, activeClip.clip)
    ) {
      return;
    }

    this.handlePlayingPosition(this.normalizers.toNumber(playingPosition));
    this.clipColor = this.normalizers.toColorValue(clipColor);
    this.clipName = this.normalizers.toStringValue(clipName);
    this.clipMeta.length = this.normalizers.toNumber(
      clipLength,
      this.clipMeta.length,
    );
    this.clipMeta.loopStart = this.normalizers.toNumber(
      loopStart,
      this.clipMeta.loopStart,
    );
    this.clipMeta.loopEnd = this.normalizers.toNumber(
      loopEnd,
      this.clipMeta.loopEnd,
    );
    this.clipMeta.looping = this.normalizers.toBoolean(looping);
  }

  /**
   * Syncs the selected-track snapshot before observers stream updates.
   * @param track - Selected Live track.
   * @returns A promise that settles after the snapshot is applied.
   */
  private async syncSelectedTrackState(track: LiveTrack): Promise<void> {
    const [trackName, trackColor] = await Promise.all([
      this.access.safeTrackGet(track, "name"),
      this.access.safeTrackGet(track, "color"),
    ]);
    this.trackName = this.normalizers.toStringValue(trackName);
    this.trackColor = this.normalizers.toColorValue(trackColor);
  }

  /**
   * Syncs the initial song snapshot before observers take over.
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

    this.isPlaying = this.normalizers.toBoolean(isPlaying);
    this.signatureDenominator = Math.max(
      1,
      Math.round(this.normalizers.toNumber(signatureDenominator)),
    );
    this.signatureNumerator = Math.max(
      1,
      Math.round(this.normalizers.toNumber(signatureNumerator)),
    );
    this.handleSongTime(this.normalizers.toNumber(songTime));

    const selectedTrack = await this.access.safeSongViewGet("selected_track");
    this.handleSelectedTrack(await this.resolveTrackIndex(selectedTrack));
    this.emit();
  }
}
