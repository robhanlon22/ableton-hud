import type {
  ClipProperty,
  LiveClip,
  LiveScene,
  LiveTrack,
  ObserverCleanup,
  PayloadNormalizers,
  SceneProperty,
  TrackProperty,
} from "./ableton-live-bridge-types";

import {
  observeClipProperty,
  observeSceneProperty,
  observeTrackState,
  syncClipSnapshot as syncClipSnapshotState,
  syncTrackState as syncTrackStateSnapshot,
} from "./ableton-live-bridge-subscriptions";

interface BridgeSubscriptionControllerDeps {
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
  constructor(private readonly deps: BridgeSubscriptionControllerDeps) {}

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

  async syncTrackState(track: LiveTrack): Promise<void> {
    await syncTrackStateSnapshot({
      normalizers: this.deps.normalizers,
      safeTrackGet: this.deps.safeTrackGet,
      setTrackColor: this.deps.setTrackColor,
      setTrackName: this.deps.setTrackName,
      track,
    });
  }

  private buildClipObserverDescriptors(): ObserveCurrentClipPropertyDescriptor[] {
    return [
      {
        applyValue: (value) => {
          this.deps.handlePlayingPosition(
            this.deps.normalizers.toNumber(value),
          );
        },
        property: "playing_position",
      },
      {
        applyValue: (value) => {
          this.deps.setClipName(this.deps.normalizers.toStringValue(value));
        },
        property: "name",
      },
      {
        applyValue: (value) => {
          this.deps.setClipColor(this.deps.normalizers.toColorValue(value));
        },
        property: "color",
      },
      {
        applyValue: (value) => {
          this.deps.clipMeta.length = this.deps.normalizers.toNumber(
            value,
            this.deps.clipMeta.length,
          );
        },
        property: "length",
      },
      {
        applyValue: (value) => {
          this.deps.clipMeta.loopStart = this.deps.normalizers.toNumber(
            value,
            this.deps.clipMeta.loopStart,
          );
        },
        property: "loop_start",
      },
      {
        applyValue: (value) => {
          this.deps.clipMeta.loopEnd = this.deps.normalizers.toNumber(
            value,
            this.deps.clipMeta.loopEnd,
          );
        },
        property: "loop_end",
      },
      {
        applyValue: (value) => {
          this.deps.clipMeta.looping = this.deps.normalizers.toBoolean(value);
        },
        property: "looping",
      },
    ];
  }

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
