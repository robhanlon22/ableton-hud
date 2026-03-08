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

export interface BridgeSubscriptionControllerDeps {
  clipMeta: {
    length: number;
    loopEnd: number;
    looping: boolean;
    loopStart: number;
  };
  clipObserverCleanups: ObserverCleanup[];
  emit: () => void;
  getActiveScene: () => number | undefined;
  getSelectedTrack: () => number | undefined;
  getSelectedTrackToken: () => number;
  handlePlayingPosition: (position: number) => void;
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  isActiveClip: (track: number, clip: number) => boolean;
  normalizers: PayloadNormalizers;
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  safeClipGet: (clip: LiveClip, property: ClipProperty) => Promise<unknown>;
  safeClipObserve: (
    clip: LiveClip,
    property: ClipProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  safeSceneGet: (scene: LiveScene, property: SceneProperty) => Promise<unknown>;
  safeSceneObserve: (
    scene: LiveScene,
    property: SceneProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  safeSongSceneChild: (sceneIndex: number) => Promise<LiveScene | undefined>;
  safeTrackGet: (track: LiveTrack, property: TrackProperty) => Promise<unknown>;
  safeTrackObserve: (
    track: LiveTrack,
    property: TrackProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  sceneObserverCleanups: ObserverCleanup[];
  setClipColor: (color: number | undefined) => void;
  setClipName: (name: string) => void;
  setSceneColor: (color: number | undefined) => void;
  setSceneName: (name: string) => void;
  setTrackColor: (color: number | undefined) => void;
  setTrackName: (name: string) => void;
  trackObserverCleanups: ObserverCleanup[];
  unplayedSlotIndex: number;
}

export interface LiveBridgeSubscriptionStateOptions {
  access: LiveBridgeAccess;
  bridge: LiveBridgeSnapshotHost;
  clipMeta: {
    length: number;
    loopEnd: number;
    looping: boolean;
    loopStart: number;
  };
  clipObserverCleanups: ObserverCleanup[];
  emit: () => void;
  handlePlayingPosition: (position: number) => void;
  isActiveClip: (track: number, clip: number) => boolean;
  normalizers: PayloadNormalizers;
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  sceneObserverCleanups: ObserverCleanup[];
  trackObserverCleanups: ObserverCleanup[];
  unplayedSlotIndex: number;
}

/**
 * Bridge callbacks required to expose mutable snapshot state to the controller.
 */
interface LiveBridgeSnapshotHost {
  getActiveScene(): number | undefined;
  getSelectedTrack(): number | undefined;
  getSelectedTrackToken(): number;
  handlePlayingSlot(slotIndex: number): Promise<void>;
  setClipColor(color: number | undefined): void;
  setClipName(name: string): void;
  setSceneColor(color: number | undefined): void;
  setSceneName(name: string): void;
  setTrackColor(color: number | undefined): void;
  setTrackName(name: string): void;
}

type ObserveCurrentClipPropertyDescriptor = Omit<
  ObserveCurrentClipPropertyOptions,
  "clip" | "slotIndex" | "trackIndex"
>;

interface ObserveCurrentClipPropertyOptions {
  applyValue: (value: unknown) => void;
  clip: LiveClip;
  property: ClipProperty;
  slotIndex: number;
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
