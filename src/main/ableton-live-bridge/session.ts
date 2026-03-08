/* eslint-disable max-lines -- The internal session keeps the bridge state machine in one direct class. */
import type { ClipTimingMeta, HudMode, HudState } from "@shared/types";

import { EPSILON, hasValidLoopSpan } from "@main/counter";

import type { LiveBridgeAccess } from "./live-access";
import type {
  BridgeClipReference,
  ClipProperty,
  LiveClient,
  LiveClip,
  LiveScene,
  LiveTrack,
  ObserverCleanup,
  PayloadNormalizers,
  SceneProperty,
  SongProperty,
  TrackProperty,
} from "./types";

import { buildHudState } from "./state";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_CLIP_META,
  INACTIVE_SLOT_INDEX,
  LOOP_WRAP_TOLERANCE_BEATS,
  RECONNECT_BACKOFF_BASE,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from "./types";

const SONG_PROPERTIES = [
  "signature_numerator",
  "signature_denominator",
  "is_playing",
  "current_song_time",
] as const satisfies readonly SongProperty[];

const TRACK_OBSERVER_PROPERTIES = [
  "playing_slot_index",
  "name",
  "color",
] as const satisfies readonly TrackProperty[];

const TRACK_SNAPSHOT_PROPERTIES = [
  "name",
  "color",
] as const satisfies readonly Exclude<TrackProperty, "playing_slot_index">[];

const SCENE_PROPERTIES = [
  "name",
  "color",
] as const satisfies readonly SceneProperty[];

const CLIP_PROPERTIES = [
  "playing_position",
  "name",
  "color",
  "length",
  "loop_start",
  "loop_end",
  "looping",
] as const satisfies readonly ClipProperty[];

/**
 * Dependencies required to run one bridge session.
 */
export interface BridgeSessionDeps {
  /**
   * Guarded Live API access helpers for the current client.
   */
  access: LiveBridgeAccess;
  /**
   * Live client facade for connection lifecycle control.
   */
  live: LiveClient;
  /**
   * Initial HUD mode.
   */
  mode: HudMode;
  /**
   * Payload normalization helpers.
   */
  normalizers: PayloadNormalizers;
  /**
   * HUD state sink.
   */
  onState: (state: HudState) => void;
  /**
   * Initial track-lock state.
   */
  trackLocked: boolean;
}

/**
 * Owns the mutable Ableton Live bridge runtime for one Live client session.
 */
export class BridgeSession {
  readonly access: LiveBridgeAccess;

  activeClip: BridgeClipReference | undefined;
  activeScene: number | undefined;
  beatCounter = 0;
  beatFlashToken = 0;
  clipColor: number | undefined;
  clipMeta = cloneDefaultClipMeta();
  clipName: string | undefined;
  clipObserverCleanups: ObserverCleanup[] = [];
  connected = false;
  connectInFlight = false;
  connectionEpoch = 0;
  currentPosition: number | undefined;
  isPlaying = false;
  lastWholeBeat: number | undefined;
  launchPosition: number | undefined;
  loopWrapCount = 0;
  mode: HudMode;
  pendingSelectedTrack: number | undefined;
  previousPosition: number | undefined;
  reconnectAttempt = 0;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  sceneColor: number | undefined;
  sceneName: string | undefined;
  sceneObserverCleanups: ObserverCleanup[] = [];
  selectedTrack: number | undefined;
  selectedTrackToken = 0;
  signatureDenominator = DEFAULT_BEATS_PER_BAR;
  signatureNumerator = DEFAULT_BEATS_PER_BAR;
  songObserverCleanups: ObserverCleanup[] = [];
  started = false;
  trackColor: number | undefined;
  trackLocked: boolean;
  trackName: string | undefined;
  trackObserverCleanups: ObserverCleanup[] = [];
  transitionInProgress = false;

  private readonly live: LiveClient;
  private readonly normalizers: PayloadNormalizers;
  private readonly onState: (state: HudState) => void;

  /**
   * Creates the mutable runtime around a concrete Live client and access layer.
   * @param deps - Session dependencies and initial state.
   */
  constructor(deps: BridgeSessionDeps) {
    this.access = deps.access;
    this.live = deps.live;
    this.mode = deps.mode;
    this.normalizers = deps.normalizers;
    this.onState = deps.onState;
    this.trackLocked = deps.trackLocked;
  }

  /**
   * Applies a newly selected track and refreshes its observed state.
   * @param trackIndex - Zero-based selected track index.
   * @returns A promise that settles after track observers are in sync.
   */
  async applySelectedTrack(trackIndex: number): Promise<void> {
    if (this.selectedTrack === trackIndex) {
      return;
    }

    const token = this.beginTrackSelection(trackIndex);
    const track = await this.access.getTrack(trackIndex);
    if (
      track === undefined ||
      !this.isCurrentTrackSelection(trackIndex, token)
    ) {
      return;
    }

    await this.syncSelectedTrackState(track, trackIndex, token);
    if (!this.isCurrentTrackSelection(trackIndex, token)) {
      return;
    }

    await this.observeTrack(track, trackIndex);
    if (!this.isCurrentTrackSelection(trackIndex, token)) {
      return;
    }

    const playingSlot = await this.access.safeTrackGet(
      track,
      "playing_slot_index",
    );
    if (!this.isCurrentTrackSelection(trackIndex, token)) {
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
  async bootstrap(epoch = this.connectionEpoch): Promise<void> {
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    this.resetSongSubscriptions();
    await this.observeSelectedTrack();
    await this.observeSongProperties();
    await this.syncSongState(epoch);
  }

  /**
   * Clears clip observers and optionally preserves displayed clip metadata.
   * @param preserveDisplay - Whether to retain current clip display fields.
   */
  clearClipSubscription(preserveDisplay = false): void {
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

  /**
   * Runs and removes a group of observer cleanup callbacks.
   * @param cleanups - Cleanup callbacks to invoke and clear.
   */
  clearObserverGroup(cleanups: ObserverCleanup[]): void {
    for (const cleanup of cleanups.splice(0)) {
      void Promise.resolve(cleanup()).catch(ignoreObserverCleanupError);
    }
  }

  /**
   * Clears scene observers and optionally preserves displayed scene metadata.
   * @param preserveDisplay - Whether to retain current scene display fields.
   */
  clearSceneSubscription(preserveDisplay = false): void {
    this.clearObserverGroup(this.sceneObserverCleanups);
    this.activeScene = undefined;

    if (!preserveDisplay) {
      this.sceneColor = undefined;
      this.sceneName = undefined;
    }
  }

  /** @returns A promise that settles after connecting or scheduling a retry. */
  async connect(): Promise<void> {
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
  emit(): void {
    if (this.transitionInProgress) {
      return;
    }

    this.onState(buildHudState(this.snapshot()));
  }

  /**
   * Handles a successful Live connection.
   */
  readonly handleConnect = (): void => {
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

  /**
   * Handles a Live disconnect and schedules reconnection.
   */
  readonly handleDisconnect = (): void => {
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

  /**
   * Tracks clip playback position and detects loop wraps or relaunches.
   * @param position - Current clip position in beats.
   */
  handlePlayingPosition(position: number): void {
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
  async handlePlayingSlot(slotIndex: number): Promise<void> {
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

      const track = await this.access.getTrack(selectedTrack);
      if (
        track === undefined ||
        !this.isCurrentSlotSelection(selectedTrack, slotIndex, token)
      ) {
        return;
      }

      await this.subscribeScene(slotIndex, token);
      if (!this.isCurrentSlotSelection(selectedTrack, slotIndex, token)) {
        return;
      }

      const clip = await this.resolveSlotClip(
        track,
        selectedTrack,
        slotIndex,
        token,
      );
      if (clip === undefined) {
        return;
      }

      await this.subscribeClip(selectedTrack, slotIndex, clip, token);
    } finally {
      this.transitionInProgress = false;
      this.emit();
    }
  }

  /**
   * Applies a selected track immediately or defers it while locked.
   * @param trackIndex - The selected Live track index.
   */
  handleSelectedTrack(trackIndex: number): void {
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

  /**
   * Updates beat counters from the current Live song time.
   * @param songTime - The current song time in beats.
   * @returns Whether the beat-derived HUD state changed.
   */
  handleSongTime(songTime: number): boolean {
    const wholeBeat = Math.max(0, Math.floor(songTime + EPSILON));

    if (this.lastWholeBeat === undefined) {
      this.lastWholeBeat = wholeBeat;
      if (wholeBeat === this.beatCounter) {
        return false;
      }

      this.beatCounter = wholeBeat;
      return true;
    }

    if (wholeBeat === this.lastWholeBeat) {
      return false;
    }

    this.lastWholeBeat = wholeBeat;
    this.beatCounter = wholeBeat;
    this.beatFlashToken += 1;
    return true;
  }

  /**
   * Checks whether a position jump is a natural loop wrap.
   * @param previousPosition - Previous clip position in beats.
   * @param currentPosition - Current clip position in beats.
   * @returns Whether the jump stays within the configured loop span.
   */
  isNaturalLoopWrap(
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

  /**
   * Registers an observer cleanup into a cleanup group.
   * @param cleanupGroup - Cleanup collection to append to.
   * @param stop - Cleanup callback to register.
   */
  registerCleanup(
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ): void {
    if (typeof stop === "function") {
      cleanupGroup.push(stop);
    }
  }

  /**
   * Resets clip playback state used for elapsed and remaining counters.
   */
  resetClipRunState(): void {
    this.launchPosition = undefined;
    this.currentPosition = undefined;
    this.previousPosition = undefined;
    this.loopWrapCount = 0;
  }

  /**
   * Resolves a selected-track payload into a zero-based track index.
   * @param selectedTrack - Raw selected-track payload from Live.
   * @returns The resolved track index.
   */
  resolveTrackIndex(selectedTrack: unknown): Promise<number> {
    return this.access.resolveTrackIndex(selectedTrack);
  }

  /**
   * Schedules a reconnect attempt when the bridge should reconnect.
   */
  scheduleReconnect(): void {
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

  /**
   * Updates the HUD mode and emits the next state snapshot.
   * @param mode - The next HUD mode.
   */
  setMode(mode: HudMode): void {
    this.mode = mode;
    this.emit();
  }

  /**
   * Updates track-lock state and applies any deferred track selection.
   * @param trackLocked - Whether track selection should stay locked.
   */
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

  /**
   * Starts the bridge connection lifecycle.
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    void this.connect();
  }

  /**
   * Stops the bridge and tears down active subscriptions.
   */
  stop(): void {
    this.started = false;
    this.connectionEpoch += 1;
    this.clearReconnectTimer();
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
    this.connectInFlight = false;
    this.connected = false;
    disconnectLiveClient(this.live);
  }

  /**
   * Observes the active clip and syncs its initial snapshot.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based active clip-slot index.
   * @param clip - Active clip to observe.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after clip observers and snapshot sync complete.
   */
  async subscribeClip(
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ): Promise<void> {
    if (!this.isCurrentClipSubscription(trackIndex, slotIndex, token)) {
      return;
    }

    const activeClip: BridgeClipReference = {
      clip: slotIndex,
      track: trackIndex,
    };
    await this.observeClip(clip, activeClip);

    const clipValues = await Promise.all(
      CLIP_PROPERTIES.map((property) =>
        this.access.safeClipGet(clip, property),
      ),
    );
    if (!this.isCurrentClipSubscription(trackIndex, slotIndex, token)) {
      return;
    }

    for (const [index, property] of CLIP_PROPERTIES.entries()) {
      this.applyClipProperty(property, clipValues[index]);
    }
  }

  /**
   * Observes the active scene and syncs its initial snapshot.
   * @param sceneIndex - Zero-based active scene index.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after scene observers and snapshot sync complete.
   */
  async subscribeScene(sceneIndex: number, token: number): Promise<void> {
    if (!this.isCurrentSceneSelection(sceneIndex, token)) {
      return;
    }

    const scene = await this.access.safeSongSceneChild(sceneIndex);
    if (
      scene === undefined ||
      !this.isCurrentSceneSelection(sceneIndex, token)
    ) {
      return;
    }

    for (const property of SCENE_PROPERTIES) {
      await this.observeSceneProperty(scene, sceneIndex, property);
    }

    const sceneValues = await Promise.all(
      SCENE_PROPERTIES.map((property) =>
        this.access.safeSceneGet(scene, property),
      ),
    );
    if (!this.isCurrentSceneSelection(sceneIndex, token)) {
      return;
    }

    for (const [index, property] of SCENE_PROPERTIES.entries()) {
      this.applySceneProperty(property, sceneValues[index]);
    }
  }

  /**
   * Toggles track lock and returns the new state.
   * @returns Whether track lock is enabled after toggling.
   */
  toggleTrackLock(): boolean {
    this.setTrackLocked(!this.trackLocked);
    return this.trackLocked;
  }

  /**
   * Applies a raw clip property update to bridge state.
   * @param property - Clip property being updated.
   * @param value - Raw Live payload for the property.
   */
  private applyClipProperty(property: ClipProperty, value: unknown): void {
    switch (property) {
      case "color": {
        this.clipColor = this.normalizers.toColorValue(value);
        return;
      }

      case "length": {
        this.clipMeta.length = this.normalizers.toNumber(
          value,
          this.clipMeta.length,
        );
        return;
      }

      case "loop_end": {
        this.clipMeta.loopEnd = this.normalizers.toNumber(
          value,
          this.clipMeta.loopEnd,
        );
        return;
      }

      case "loop_start": {
        this.clipMeta.loopStart = this.normalizers.toNumber(
          value,
          this.clipMeta.loopStart,
        );
        return;
      }

      case "name": {
        this.clipName = this.normalizers.toStringValue(value);
        return;
      }

      case "playing_position": {
        this.handlePlayingPosition(this.normalizers.toNumber(value));
        return;
      }

      case "looping": {
        this.clipMeta.looping = this.normalizers.toBoolean(value);
      }
    }
  }

  /**
   * Applies a raw scene property update to bridge state.
   * @param property - Scene property being updated.
   * @param value - Raw Live payload for the property.
   */
  private applySceneProperty(property: SceneProperty, value: unknown): void {
    switch (property) {
      case "name": {
        this.sceneName = this.normalizers.toStringValue(value);
        return;
      }

      case "color": {
        this.sceneColor = this.normalizers.toSceneColorValue(value);
      }
    }
  }

  /**
   * Applies a raw song property update to bridge state.
   * @param property - Song property being updated.
   * @param value - Raw Live payload for the property.
   * @returns Whether the update should emit a HUD state.
   */
  private applySongProperty(
    property: SongProperty,
    value: unknown,
  ): boolean | undefined {
    switch (property) {
      case "current_song_time": {
        return this.handleSongTime(this.normalizers.toNumber(value));
      }

      case "is_playing": {
        this.isPlaying = this.normalizers.toBoolean(value);
        return;
      }

      case "signature_denominator": {
        this.signatureDenominator = Math.max(
          1,
          Math.round(this.normalizers.toNumber(value)),
        );
        return;
      }

      case "signature_numerator": {
        this.signatureNumerator = Math.max(
          1,
          Math.round(this.normalizers.toNumber(value)),
        );
        return;
      }
    }
  }

  /**
   * Applies a raw track property update to bridge state.
   * @param property - Track property being updated.
   * @param value - Raw Live payload for the property.
   * @returns Whether the update should emit a HUD state.
   */
  private applyTrackProperty(
    property: TrackProperty,
    value: unknown,
  ): boolean | undefined {
    switch (property) {
      case "name": {
        this.trackName = this.normalizers.toStringValue(value);
        return;
      }

      case "playing_slot_index": {
        void this.handlePlayingSlot(
          this.normalizers.toNumber(value, INACTIVE_SLOT_INDEX),
        );
        return false;
      }

      case "color": {
        this.trackColor = this.normalizers.toColorValue(value);
      }
    }
  }

  /**
   * Applies a raw selected-track snapshot property to bridge state.
   * @param property - Track property being updated.
   * @param value - Raw Live payload for the property.
   */
  private applyTrackSnapshotProperty(
    property: Exclude<TrackProperty, "playing_slot_index">,
    value: unknown,
  ): void {
    if (property === "name") {
      this.trackName = this.normalizers.toStringValue(value);
      return;
    }

    this.trackColor = this.normalizers.toColorValue(value);
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

  /**
   * Cancels any queued reconnect attempt.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Clears the current track subscription and any dependent clip state.
   */
  private clearTrackSubscription(): void {
    this.clearObserverGroup(this.trackObserverCleanups);
    this.clearClipSubscription();
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
   * Checks whether the active clip matches a track and clip index.
   * @param track - Candidate track index.
   * @param clip - Candidate clip index.
   * @returns Whether the active clip matches the given location.
   */
  private isActiveClip(track: number, clip: number): boolean {
    const activeClip = this.activeClip;
    if (activeClip === undefined) {
      return false;
    }

    return activeClip.track === track && activeClip.clip === clip;
  }

  /**
   * Checks whether the current active clip still matches a guarded clip subscription.
   * @param trackIndex - Candidate selected track index.
   * @param slotIndex - Candidate clip-slot index.
   * @param token - Candidate selected-track token.
   * @returns Whether the clip subscription is still current.
   */
  private isCurrentClipSubscription(
    trackIndex: number,
    slotIndex: number,
    token: number,
  ): boolean {
    return (
      token === this.selectedTrackToken &&
      this.isActiveClip(trackIndex, slotIndex)
    );
  }

  /**
   * Checks whether an epoch still matches the active connection.
   * @param epoch - Connection epoch to validate.
   * @returns Whether the epoch is still current.
   */
  private isCurrentEpoch(epoch: number): boolean {
    return this.started && epoch === this.connectionEpoch;
  }

  /**
   * Checks whether the current active scene still matches a guarded slot transition.
   * @param sceneIndex - Candidate active scene index.
   * @param token - Candidate selected-track token.
   * @returns Whether the scene transition is still current.
   */
  private isCurrentSceneSelection(sceneIndex: number, token: number): boolean {
    return token === this.selectedTrackToken && this.activeScene === sceneIndex;
  }

  /**
   * Checks whether the current active clip still matches a guarded slot transition.
   * @param trackIndex - Candidate selected track index.
   * @param slotIndex - Candidate clip-slot index.
   * @param token - Candidate selected-track token.
   * @returns Whether the clip transition is still current.
   */
  private isCurrentSlotSelection(
    trackIndex: number,
    slotIndex: number,
    token: number,
  ): boolean {
    return (
      this.isCurrentTrackSelection(trackIndex, token) &&
      this.isCurrentClipSubscription(trackIndex, slotIndex, token)
    );
  }

  /**
   * Checks whether the selected-track transaction still matches the current selection.
   * @param trackIndex - Candidate selected track index.
   * @param token - Candidate selected-track token.
   * @returns Whether the track selection is still current.
   */
  private isCurrentTrackSelection(trackIndex: number, token: number): boolean {
    return (
      token === this.selectedTrackToken && this.selectedTrack === trackIndex
    );
  }

  /**
   * Computes the next reconnect delay and advances backoff state.
   * @returns The delay in milliseconds before the next reconnect attempt.
   */
  private nextReconnectDelayMs(): number {
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * RECONNECT_BACKOFF_BASE ** this.reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    return delay;
  }

  /**
   * Observes the active clip while it remains current.
   * @param clip - Active clip to observe.
   * @param activeClip - Active clip identity to guard observer callbacks.
   * @returns A promise that settles after clip observers are attached.
   */
  private async observeClip(
    clip: LiveClip,
    activeClip: BridgeClipReference,
  ): Promise<void> {
    for (const property of CLIP_PROPERTIES) {
      await this.observeClipProperty(clip, activeClip, property);
    }
  }

  /**
   * Observes a clip property while the given clip remains active.
   * @param clip - Active clip to observe.
   * @param activeClip - Active clip identity to guard observer callbacks.
   * @param property - Clip property to observe.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeClipProperty(
    clip: LiveClip,
    activeClip: BridgeClipReference,
    property: ClipProperty,
  ): Promise<void> {
    const stop = await this.access.safeClipObserve(clip, property, (value) => {
      if (!this.isActiveClip(activeClip.track, activeClip.clip)) {
        return;
      }

      this.applyClipProperty(property, value);
      this.emit();
    });
    this.registerCleanup(this.clipObserverCleanups, stop);
  }

  /**
   * Observes a scene property while the given scene remains active.
   * @param scene - Active scene to observe.
   * @param sceneIndex - Zero-based active scene index.
   * @param property - Scene property to observe.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeSceneProperty(
    scene: LiveScene,
    sceneIndex: number,
    property: SceneProperty,
  ): Promise<void> {
    const stop = await this.access.safeSceneObserve(
      scene,
      property,
      (value) => {
        if (this.activeScene !== sceneIndex) {
          return;
        }

        this.applySceneProperty(property, value);
        this.emit();
      },
    );
    this.registerCleanup(this.sceneObserverCleanups, stop);
  }

  /**
   * Observes the selected-track payload from Live's song view.
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
   * Observes song-level state needed by the HUD.
   * @returns A promise that settles after all song observers are registered.
   */
  private async observeSongProperties(): Promise<void> {
    for (const property of SONG_PROPERTIES) {
      await this.observeSongProperty(property);
    }
  }

  /**
   * Observes song-level state needed by the HUD.
   * @param property - Song property to observe.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeSongProperty(property: SongProperty): Promise<void> {
    const stop = await this.access.safeSongObserve(property, (value) => {
      if (this.applySongProperty(property, value) !== false) {
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
    for (const property of TRACK_OBSERVER_PROPERTIES) {
      await this.observeTrackProperty(track, trackIndex, property);
    }
  }

  /**
   * Observes a track property while the given track remains selected.
   * @param track - Selected Live track.
   * @param trackIndex - Zero-based selected track index.
   * @param property - Track property to observe.
   * @returns A promise that settles after the observer is registered.
   */
  private async observeTrackProperty(
    track: LiveTrack,
    trackIndex: number,
    property: TrackProperty,
  ): Promise<void> {
    const stop = await this.access.safeTrackObserve(
      track,
      property,
      (value) => {
        if (this.selectedTrack !== trackIndex) {
          return;
        }

        if (this.applyTrackProperty(property, value) !== false) {
          this.emit();
        }
      },
    );
    this.registerCleanup(this.trackObserverCleanups, stop);
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
    this.clipMeta = cloneDefaultClipMeta();
    this.resetClipRunState();
  }

  /** Clears song-level observers before reconnecting or resynchronizing. */
  private resetSongSubscriptions(): void {
    this.clearObserverGroup(this.songObserverCleanups);
    this.clearTrackSubscription();
  }

  /**
   * Resolves the active clip from the selected track and slot when it still exists.
   * @param track - Selected Live track that owns the active slot.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based active clip-slot index.
   * @param token - Selection token guarding against stale async work.
   * @returns The resolved clip when the slot still maps to the current selection.
   */
  private async resolveSlotClip(
    track: LiveTrack,
    trackIndex: number,
    slotIndex: number,
    token: number,
  ): Promise<LiveClip | undefined> {
    const clipSlot = await this.access.safeTrackChild(track, slotIndex);
    if (
      clipSlot === undefined ||
      !this.isCurrentSlotSelection(trackIndex, slotIndex, token)
    ) {
      return undefined;
    }

    const hasClip = this.normalizers.toBoolean(
      await this.access.safeClipSlotGet(clipSlot, "has_clip"),
    );
    if (
      !hasClip ||
      !this.isCurrentSlotSelection(trackIndex, slotIndex, token)
    ) {
      return undefined;
    }

    const clip = await this.access.safeClipSlotClip(clipSlot);
    return this.isCurrentSlotSelection(trackIndex, slotIndex, token)
      ? clip
      : undefined;
  }

  /**
   * Builds the current mutable bridge snapshot for HUD-state derivation.
   * @returns The current bridge snapshot consumed by `buildHudState`.
   */
  private snapshot(): Parameters<typeof buildHudState>[0] {
    return {
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
    };
  }

  /**
   * Syncs the selected-track snapshot before observers stream updates.
   * @param track - Selected Live track.
   * @param trackIndex - Zero-based selected track index.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after the snapshot is applied.
   */
  private async syncSelectedTrackState(
    track: LiveTrack,
    trackIndex: number,
    token: number,
  ): Promise<void> {
    const trackValues = await Promise.all(
      TRACK_SNAPSHOT_PROPERTIES.map((property) =>
        this.access.safeTrackGet(track, property),
      ),
    );
    if (!this.isCurrentTrackSelection(trackIndex, token)) {
      return;
    }

    for (const [index, property] of TRACK_SNAPSHOT_PROPERTIES.entries()) {
      this.applyTrackSnapshotProperty(property, trackValues[index]);
    }
  }

  /**
   * Syncs the initial song snapshot before observers take over.
   * @param epoch - Connection epoch tied to the current bridge session.
   * @returns A promise that settles after the initial song state is applied.
   */
  private async syncSongState(epoch: number): Promise<void> {
    const songValues = await Promise.all(
      SONG_PROPERTIES.map((property) => this.access.safeSongGet(property)),
    );
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    for (const [index, property] of SONG_PROPERTIES.entries()) {
      this.applySongProperty(property, songValues[index]);
    }

    const selectedTrack = await this.access.safeSongViewGet("selected_track");
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    const trackIndex = await this.resolveTrackIndex(selectedTrack);
    if (!this.isCurrentEpoch(epoch)) {
      return;
    }

    this.handleSelectedTrack(trackIndex);
    this.emit();
  }
}

/**
 * Clones the default clip metadata snapshot.
 * @returns A fresh clip metadata object.
 */
function cloneDefaultClipMeta(): ClipTimingMeta {
  return { ...DEFAULT_CLIP_META };
}

/**
 * Best-effort disconnect for the Live client during app teardown.
 * @param liveClient - Live client facade to disconnect.
 */
function disconnectLiveClient(liveClient: LiveClient): void {
  try {
    liveClient.disconnect();
  } catch {
    return;
  }
}

/**
 * Swallows observer cleanup failures during teardown.
 * @returns `undefined`.
 */
function ignoreObserverCleanupError(): void {
  return undefined;
}
