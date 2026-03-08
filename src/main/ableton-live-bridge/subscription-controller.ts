import type { LiveBridgeAccess } from "./live-access";
import type {
  ClipProperty,
  LiveClip,
  LiveScene,
  LiveTrack,
  ObserverCleanup,
  PayloadNormalizers,
  SceneProperty,
  TrackProperty,
} from "./types";

import {
  observeClipProperty,
  observeSceneProperty,
  observeTrackState,
  syncClipSnapshot as syncClipSnapshotState,
  syncTrackState as syncTrackStateSnapshot,
} from "./subscriptions";

/**
 * Dependencies required by the subscription controller to observe and sync bridge state.
 */
export interface BridgeSubscriptionControllerDeps {
  /**
   * Mutable clip timing metadata owned by the bridge.
   */
  clipMeta: {
    /**
     * Total clip length in beats.
     */
    length: number;
    /**
     * Loop end position in beats.
     */
    loopEnd: number;
    /**
     * Whether the clip is currently looping.
     */
    looping: boolean;
    /**
     * Loop start position in beats.
     */
    loopStart: number;
  };
  /**
   * Cleanup callbacks for the active clip observers.
   */
  clipObserverCleanups: ObserverCleanup[];
  /**
   * Emits the latest HUD state to renderer listeners.
   */
  emit: () => void;
  /**
   * Reads the currently active scene index from bridge state.
   * @returns The active scene index, when one is selected.
   */
  getActiveScene: () => number | undefined;
  /**
   * Reads the currently selected track index from bridge state.
   * @returns The selected track index, when one is selected.
   */
  getSelectedTrack: () => number | undefined;
  /**
   * Reads the current selected-track token used to guard async work.
   * @returns The current selected-track token.
   */
  getSelectedTrackToken: () => number;
  /**
   * Applies an updated playing position to bridge state.
   * @param position - Playing position in beats.
   */
  handlePlayingPosition: (position: number) => void;
  /**
   * Applies an updated playing slot to bridge state.
   * @param slotIndex - Zero-based playing slot index, or the inactive sentinel.
   * @returns A promise that settles after the slot update is handled.
   */
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  /**
   * Checks whether a clip is still the active clip after async work completes.
   * @param track - Zero-based track index to compare.
   * @param clip - Zero-based clip-slot index to compare.
   * @returns Whether the clip is still active.
   */
  isActiveClip: (track: number, clip: number) => boolean;
  /**
   * Payload normalizers shared with the bridge runtime.
   */
  normalizers: PayloadNormalizers;
  /**
   * Stores a cleanup callback in the target cleanup group.
   * @param cleanupGroup - Cleanup collection that owns the callback.
   * @param stop - Cleanup callback returned by an observer registration.
   */
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  /**
   * Reads a clip property with guarded Live error handling.
   * @param clip - Clip to query.
   * @param property - Clip property to read.
   * @returns The raw Live payload when available.
   */
  safeClipGet: (clip: LiveClip, property: ClipProperty) => Promise<unknown>;
  /**
   * Observes a clip property with guarded Live error handling.
   * @param clip - Clip to observe.
   * @param property - Clip property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A cleanup callback when observation succeeds.
   */
  safeClipObserve: (
    clip: LiveClip,
    property: ClipProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  /**
   * Reads a scene property with guarded Live error handling.
   * @param scene - Scene to query.
   * @param property - Scene property to read.
   * @returns The raw Live payload when available.
   */
  safeSceneGet: (scene: LiveScene, property: SceneProperty) => Promise<unknown>;
  /**
   * Observes a scene property with guarded Live error handling.
   * @param scene - Scene to observe.
   * @param property - Scene property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A cleanup callback when observation succeeds.
   */
  safeSceneObserve: (
    scene: LiveScene,
    property: SceneProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  /**
   * Resolves a scene child from the Live song.
   * @param sceneIndex - Zero-based scene index to resolve.
   * @returns The resolved scene, when available.
   */
  safeSongSceneChild: (sceneIndex: number) => Promise<LiveScene | undefined>;
  /**
   * Reads a track property with guarded Live error handling.
   * @param track - Track to query.
   * @param property - Track property to read.
   * @returns The raw Live payload when available.
   */
  safeTrackGet: (track: LiveTrack, property: TrackProperty) => Promise<unknown>;
  /**
   * Observes a track property with guarded Live error handling.
   * @param track - Track to observe.
   * @param property - Track property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A cleanup callback when observation succeeds.
   */
  safeTrackObserve: (
    track: LiveTrack,
    property: TrackProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  /**
   * Cleanup callbacks for the active scene observers.
   */
  sceneObserverCleanups: ObserverCleanup[];
  /**
   * Stores the normalized clip color in bridge state.
   * @param color - Normalized clip color, when available.
   */
  setClipColor: (color: number | undefined) => void;
  /**
   * Stores the current clip name in bridge state.
   * @param name - Clip name emitted by Live.
   */
  setClipName: (name: string) => void;
  /**
   * Stores the normalized scene color in bridge state.
   * @param color - Normalized scene color, when available.
   */
  setSceneColor: (color: number | undefined) => void;
  /**
   * Stores the current scene name in bridge state.
   * @param name - Scene name emitted by Live.
   */
  setSceneName: (name: string) => void;
  /**
   * Stores the normalized selected-track color in bridge state.
   * @param color - Normalized track color, when available.
   */
  setTrackColor: (color: number | undefined) => void;
  /**
   * Stores the current selected-track name in bridge state.
   * @param name - Track name emitted by Live.
   */
  setTrackName: (name: string) => void;
  /**
   * Cleanup callbacks for the active track observers.
   */
  trackObserverCleanups: ObserverCleanup[];
  /**
   * Sentinel value used when the selected track has no playing clip.
   */
  unplayedSlotIndex: number;
}

/**
 * Mutable bridge state required to build subscription controller dependencies.
 */
export interface LiveBridgeSubscriptionStateOptions {
  /**
   * Live access layer used to talk to Ableton Live safely.
   */
  access: LiveBridgeAccess;
  /**
   * Bridge callbacks exposing mutable snapshot state.
   */
  bridge: LiveBridgeSnapshotHost;
  /**
   * Mutable clip timing metadata owned by the bridge.
   */
  clipMeta: {
    /**
     * Total clip length in beats.
     */
    length: number;
    /**
     * Loop end position in beats.
     */
    loopEnd: number;
    /**
     * Whether the clip is currently looping.
     */
    looping: boolean;
    /**
     * Loop start position in beats.
     */
    loopStart: number;
  };
  /**
   * Cleanup callbacks for the active clip observers.
   */
  clipObserverCleanups: ObserverCleanup[];
  /**
   * Emits the latest HUD state to renderer listeners.
   */
  emit: () => void;
  /**
   * Applies an updated playing position to bridge state.
   * @param position - Playing position in beats.
   */
  handlePlayingPosition: (position: number) => void;
  /**
   * Checks whether a clip is still the active clip after async work completes.
   * @param track - Zero-based track index to compare.
   * @param clip - Zero-based clip-slot index to compare.
   * @returns Whether the clip is still active.
   */
  isActiveClip: (track: number, clip: number) => boolean;
  /**
   * Payload normalizers shared with the bridge runtime.
   */
  normalizers: PayloadNormalizers;
  /**
   * Stores a cleanup callback in the target cleanup group.
   * @param cleanupGroup - Cleanup collection that owns the callback.
   * @param stop - Cleanup callback returned by an observer registration.
   */
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  /**
   * Cleanup callbacks for the active scene observers.
   */
  sceneObserverCleanups: ObserverCleanup[];
  /**
   * Cleanup callbacks for the active track observers.
   */
  trackObserverCleanups: ObserverCleanup[];
  /**
   * Sentinel value used when the selected track has no playing clip.
   */
  unplayedSlotIndex: number;
}

/**
 * Bridge callbacks required to expose mutable snapshot state to the controller.
 */
interface LiveBridgeSnapshotHost {
  /**
   * Reads the active scene index from bridge state.
   * @returns The active scene index, when one is selected.
   */
  getActiveScene(): number | undefined;
  /**
   * Reads the selected track index from bridge state.
   * @returns The selected track index, when one is selected.
   */
  getSelectedTrack(): number | undefined;
  /**
   * Reads the selected-track token used to guard async work.
   * @returns The current selected-track token.
   */
  getSelectedTrackToken(): number;
  /**
   * Applies an updated playing slot to bridge state.
   * @param slotIndex - Zero-based playing slot index, or the inactive sentinel.
   * @returns A promise that settles after the slot update is handled.
   */
  handlePlayingSlot(slotIndex: number): Promise<void>;
  /**
   * Stores the normalized clip color in bridge state.
   * @param color - Normalized clip color, when available.
   */
  setClipColor(color: number | undefined): void;
  /**
   * Stores the current clip name in bridge state.
   * @param name - Clip name emitted by Live.
   */
  setClipName(name: string): void;
  /**
   * Stores the normalized scene color in bridge state.
   * @param color - Normalized scene color, when available.
   */
  setSceneColor(color: number | undefined): void;
  /**
   * Stores the current scene name in bridge state.
   * @param name - Scene name emitted by Live.
   */
  setSceneName(name: string): void;
  /**
   * Stores the normalized selected-track color in bridge state.
   * @param color - Normalized track color, when available.
   */
  setTrackColor(color: number | undefined): void;
  /**
   * Stores the current selected-track name in bridge state.
   * @param name - Track name emitted by Live.
   */
  setTrackName(name: string): void;
}

/**
 * Static clip-observer descriptor merged with the current clip target.
 */
type ObserveCurrentClipPropertyDescriptor = Omit<
  ObserveCurrentClipPropertyOptions,
  "clip" | "slotIndex" | "trackIndex"
>;

/**
 * Parameters required to observe one property on the current active clip.
 */
interface ObserveCurrentClipPropertyOptions {
  /**
   * Applies the normalized property value to bridge state.
   * @param value - Raw Live payload to normalize and store.
   */
  applyValue: (value: unknown) => void;
  /**
   * Active clip to observe.
   */
  clip: LiveClip;
  /**
   * Clip property to observe.
   */
  property: ClipProperty;
  /**
   * Zero-based active clip-slot index.
   */
  slotIndex: number;
  /**
   * Zero-based track index containing the active clip.
   */
  trackIndex: number;
}

/**
 * Coordinates bridge observation and snapshot wiring without bloating the main class.
 */
export class LiveBridgeSubscriptionController {
  /**
   * Stores the bridge callbacks used to sync track, clip, and scene subscriptions.
   * @param deps - Subscription callbacks and mutable bridge state references.
   */
  constructor(private readonly deps: BridgeSubscriptionControllerDeps) {}

  /**
   * Observes selected-track properties and playback-slot changes.
   * @param track - Selected Live track.
   * @param trackIndex - Zero-based selected track index.
   * @returns A promise that settles after track observers are attached.
   */
  async observeTrack(track: LiveTrack, trackIndex: number): Promise<void> {
    await observeTrackState({
      emit: this.deps.emit,
      handlePlayingSlot: this.deps.handlePlayingSlot,
      normalizers: this.deps.normalizers,
      registerCleanup: this.deps.registerCleanup,
      safeTrackObserve: this.deps.safeTrackObserve,
      selectedTrack: this.deps.getSelectedTrack,
      setTrackColor: this.deps.setTrackColor,
      setTrackName: this.deps.setTrackName,
      track,
      trackIndex,
      trackObserverCleanups: this.deps.trackObserverCleanups,
      unplayedSlotIndex: this.deps.unplayedSlotIndex,
    });
  }

  /**
   * Observes the active clip and syncs its initial snapshot.
   * @param trackIndex - Zero-based selected track index.
   * @param slotIndex - Zero-based active clip-slot index.
   * @param clip - Active Live clip to observe.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after clip observers and snapshot sync complete.
   */
  async subscribeClip(
    trackIndex: number,
    slotIndex: number,
    clip: LiveClip,
    token: number,
  ): Promise<void> {
    const clipTarget = { clip, slotIndex, trackIndex };
    for (const observer of this.buildClipObserverDescriptors()) {
      await this.observeCurrentClipProperty({ ...clipTarget, ...observer });
    }
    await syncClipSnapshotState({
      clip,
      clipMeta: this.deps.clipMeta,
      handlePlayingPosition: this.deps.handlePlayingPosition,
      isActiveClip: this.deps.isActiveClip,
      normalizers: this.deps.normalizers,
      safeClipGet: this.deps.safeClipGet,
      setClipColor: this.deps.setClipColor,
      setClipName: this.deps.setClipName,
      slotIndex,
      token,
      trackIndex,
      trackToken: this.deps.getSelectedTrackToken,
    });
  }

  /**
   * Observes the currently active scene and syncs its initial snapshot.
   * @param sceneIndex - Zero-based active scene index.
   * @param token - Selection token guarding against stale async work.
   * @returns A promise that settles after scene observers and snapshot sync complete.
   */
  async subscribeScene(sceneIndex: number, token: number): Promise<void> {
    const scene = await this.deps.safeSongSceneChild(sceneIndex);
    if (
      scene === undefined ||
      token !== this.deps.getSelectedTrackToken() ||
      this.deps.getActiveScene() !== sceneIndex
    ) {
      return;
    }

    await this.observeCurrentSceneProperty(
      scene,
      sceneIndex,
      "name",
      (value) => {
        this.deps.setSceneName(this.deps.normalizers.toStringValue(value));
      },
    );
    await this.observeCurrentSceneProperty(
      scene,
      sceneIndex,
      "color",
      (value) => {
        this.deps.setSceneColor(this.deps.normalizers.toSceneColorValue(value));
      },
    );

    const [sceneColor, sceneName] = await Promise.all([
      this.deps.safeSceneGet(scene, "color"),
      this.deps.safeSceneGet(scene, "name"),
    ]);
    if (
      token === this.deps.getSelectedTrackToken() &&
      this.deps.getActiveScene() === sceneIndex
    ) {
      this.deps.setSceneColor(
        this.deps.normalizers.toSceneColorValue(sceneColor),
      );
      this.deps.setSceneName(this.deps.normalizers.toStringValue(sceneName));
    }
  }

  /**
   * Syncs the current selected-track snapshot before observers stream updates.
   * @param track - Selected Live track.
   * @returns A promise that settles after the track snapshot is applied.
   */
  async syncTrackState(track: LiveTrack): Promise<void> {
    await syncTrackStateSnapshot({
      normalizers: this.deps.normalizers,
      safeTrackGet: this.deps.safeTrackGet,
      setTrackColor: this.deps.setTrackColor,
      setTrackName: this.deps.setTrackName,
      track,
    });
  }

  /**
   * Applies clip-color updates to the bridge state.
   * @param value - Raw clip-color payload.
   */
  private applyClipColor(value: unknown): void {
    this.deps.setClipColor(this.deps.normalizers.toColorValue(value));
  }

  /**
   * Applies clip-length updates to the bridge state.
   * @param value - Raw clip-length payload.
   */
  private applyClipLength(value: unknown): void {
    this.deps.clipMeta.length = this.deps.normalizers.toNumber(
      value,
      this.deps.clipMeta.length,
    );
  }

  /**
   * Applies clip loop-end updates to the bridge state.
   * @param value - Raw clip loop-end payload.
   */
  private applyClipLoopEnd(value: unknown): void {
    this.deps.clipMeta.loopEnd = this.deps.normalizers.toNumber(
      value,
      this.deps.clipMeta.loopEnd,
    );
  }

  /**
   * Applies clip looping-flag updates to the bridge state.
   * @param value - Raw clip looping payload.
   */
  private applyClipLooping(value: unknown): void {
    this.deps.clipMeta.looping = this.deps.normalizers.toBoolean(value);
  }

  /**
   * Applies clip loop-start updates to the bridge state.
   * @param value - Raw clip loop-start payload.
   */
  private applyClipLoopStart(value: unknown): void {
    this.deps.clipMeta.loopStart = this.deps.normalizers.toNumber(
      value,
      this.deps.clipMeta.loopStart,
    );
  }

  /**
   * Applies clip-name updates to the bridge state.
   * @param value - Raw clip-name payload.
   */
  private applyClipName(value: unknown): void {
    this.deps.setClipName(this.deps.normalizers.toStringValue(value));
  }

  /**
   * Applies clip playback-position updates to the bridge state.
   * @param value - Raw clip playing-position payload.
   */
  private applyPlayingPosition(value: unknown): void {
    this.deps.handlePlayingPosition(this.deps.normalizers.toNumber(value));
  }

  /**
   * Builds clip-property observer descriptors for the active clip subscription.
   * @returns The ordered observer descriptors for active-clip properties.
   */
  private buildClipObserverDescriptors(): ObserveCurrentClipPropertyDescriptor[] {
    return [
      {
        applyValue: this.applyPlayingPosition.bind(this),
        property: "playing_position",
      },
      {
        applyValue: this.applyClipName.bind(this),
        property: "name",
      },
      {
        applyValue: this.applyClipColor.bind(this),
        property: "color",
      },
      {
        applyValue: this.applyClipLength.bind(this),
        property: "length",
      },
      {
        applyValue: this.applyClipLoopStart.bind(this),
        property: "loop_start",
      },
      {
        applyValue: this.applyClipLoopEnd.bind(this),
        property: "loop_end",
      },
      {
        applyValue: this.applyClipLooping.bind(this),
        property: "looping",
      },
    ];
  }

  /**
   * Observes a property on the currently active clip.
   * @param options - Clip property observer configuration.
   * @returns A promise that settles after the observer is attached.
   */
  private async observeCurrentClipProperty(
    options: ObserveCurrentClipPropertyOptions,
  ): Promise<void> {
    await observeClipProperty({
      applyValue: options.applyValue,
      clip: options.clip,
      clipObserverCleanups: this.deps.clipObserverCleanups,
      emit: this.deps.emit,
      isActiveClip: this.deps.isActiveClip,
      property: options.property,
      registerCleanup: this.deps.registerCleanup,
      safeClipObserve: this.deps.safeClipObserve,
      slotIndex: options.slotIndex,
      trackIndex: options.trackIndex,
    });
  }

  /**
   * Observes a property on the currently active scene.
   * @param scene - Active Live scene.
   * @param sceneIndex - Zero-based active scene index.
   * @param property - Scene property to observe.
   * @param applyValue - Bridge updater for the observed value.
   * @returns A promise that settles after the observer is attached.
   */
  private async observeCurrentSceneProperty(
    scene: LiveScene,
    sceneIndex: number,
    property: SceneProperty,
    applyValue: (value: unknown) => void,
  ): Promise<void> {
    await observeSceneProperty({
      activeScene: this.deps.getActiveScene,
      applyValue,
      emit: this.deps.emit,
      property,
      registerCleanup: this.deps.registerCleanup,
      safeSceneObserve: this.deps.safeSceneObserve,
      scene,
      sceneIndex,
      sceneObserverCleanups: this.deps.sceneObserverCleanups,
    });
  }
}

/**
 * Builds typed controller dependencies without bloating the main bridge constructor.
 */
export class LiveBridgeSubscriptionState {
  /**
   * Stores bridge callbacks, access helpers, and cleanup buckets for subscriptions.
   * @param options - Bridge callbacks, access-layer helpers, and mutable state buckets.
   */
  constructor(private readonly options: LiveBridgeSubscriptionStateOptions) {}

  /**
   * Creates the dependency bag consumed by the subscription controller.
   * @returns The typed dependency bag for track, clip, and scene subscriptions.
   */
  createDeps(): BridgeSubscriptionControllerDeps {
    return {
      clipMeta: this.options.clipMeta,
      clipObserverCleanups: this.options.clipObserverCleanups,
      emit: this.options.emit,
      getActiveScene: this.options.bridge.getActiveScene.bind(
        this.options.bridge,
      ),
      getSelectedTrack: this.options.bridge.getSelectedTrack.bind(
        this.options.bridge,
      ),
      getSelectedTrackToken: this.options.bridge.getSelectedTrackToken.bind(
        this.options.bridge,
      ),
      handlePlayingPosition: this.options.handlePlayingPosition,
      handlePlayingSlot: this.observePlayingSlot.bind(this),
      isActiveClip: this.options.isActiveClip,
      normalizers: this.options.normalizers,
      registerCleanup: this.options.registerCleanup,
      safeClipGet: this.options.access.safeClipGet.bind(this.options.access),
      safeClipObserve: this.options.access.safeClipObserve.bind(
        this.options.access,
      ),
      safeSceneGet: this.options.access.safeSceneGet.bind(this.options.access),
      safeSceneObserve: this.options.access.safeSceneObserve.bind(
        this.options.access,
      ),
      safeSongSceneChild: this.getObservedScene.bind(this),
      safeTrackGet: this.options.access.safeTrackGet.bind(this.options.access),
      safeTrackObserve: this.options.access.safeTrackObserve.bind(
        this.options.access,
      ),
      sceneObserverCleanups: this.options.sceneObserverCleanups,
      setClipColor: this.options.bridge.setClipColor.bind(this.options.bridge),
      setClipName: this.options.bridge.setClipName.bind(this.options.bridge),
      setSceneColor: this.options.bridge.setSceneColor.bind(
        this.options.bridge,
      ),
      setSceneName: this.options.bridge.setSceneName.bind(this.options.bridge),
      setTrackColor: this.options.bridge.setTrackColor.bind(
        this.options.bridge,
      ),
      setTrackName: this.options.bridge.setTrackName.bind(this.options.bridge),
      trackObserverCleanups: this.options.trackObserverCleanups,
      unplayedSlotIndex: this.options.unplayedSlotIndex,
    };
  }

  /**
   * Reads the current scene through the latest access-layer implementation.
   * @param sceneIndex - Zero-based scene index to resolve.
   * @returns The resolved Live scene, when available.
   */
  private async getObservedScene(
    sceneIndex: number,
  ): Promise<LiveScene | undefined> {
    return this.options.access.safeSongSceneChild(sceneIndex);
  }

  /**
   * Routes slot observer updates through the latest bridge handler.
   * @param slotIndex - Zero-based playing slot index, or a negative sentinel.
   * @returns A promise that settles after the slot transition is handled.
   */
  private async observePlayingSlot(slotIndex: number): Promise<void> {
    await this.options.bridge.handlePlayingSlot(slotIndex);
  }
}
