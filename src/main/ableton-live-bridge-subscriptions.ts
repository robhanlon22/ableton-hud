import type {
  ClipProperty,
  LiveClip,
  LiveScene,
  LiveTrack,
  ObserverCleanup,
  PayloadNormalizers,
  SceneProperty,
  SongProperty,
} from "./ableton-live-bridge-types";

interface ObserveClipPropertyOptions {
  applyValue: (value: unknown) => void;
  clip: LiveClip;
  clipObserverCleanups: ObserverCleanup[];
  emit: () => void;
  isActiveClip: (track: number, clip: number) => boolean;
  property: ClipProperty;
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  safeClipObserve: (
    clip: LiveClip,
    property: ClipProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  slotIndex: number;
  trackIndex: number;
}

interface ObserveScenePropertyOptions {
  activeScene: () => number | undefined;
  applyValue: (value: unknown) => void;
  emit: () => void;
  property: SceneProperty;
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  safeSceneObserve: (
    scene: LiveScene,
    property: SceneProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  scene: LiveScene;
  sceneIndex: number;
  sceneObserverCleanups: ObserverCleanup[];
}

interface ObserveSongMetricOptions {
  applyValue: (value: unknown) => void;
  emit: () => void;
  property: SongProperty;
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  safeSongObserve: (
    property: SongProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  songObserverCleanups: ObserverCleanup[];
}

interface ObserveTrackStateOptions {
  emit: () => void;
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  normalizers: Pick<
    PayloadNormalizers,
    "toColorValue" | "toNumber" | "toStringValue"
  >;
  registerCleanup: (
    cleanupGroup: ObserverCleanup[],
    stop: ObserverCleanup | undefined,
  ) => void;
  safeTrackObserve: (
    track: LiveTrack,
    property: "color" | "name" | "playing_slot_index",
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  selectedTrack: () => number | undefined;
  setTrackColor: (color: number | undefined) => void;
  setTrackName: (name: string) => void;
  track: LiveTrack;
  trackIndex: number;
  trackObserverCleanups: ObserverCleanup[];
  unplayedSlotIndex: number;
}

interface SyncClipSnapshotOptions {
  clip: LiveClip;
  clipMeta: {
    length: number;
    loopEnd: number;
    looping: boolean;
    loopStart: number;
  };
  handlePlayingPosition: (position: number) => void;
  isActiveClip: (track: number, clip: number) => boolean;
  normalizers: Pick<
    PayloadNormalizers,
    "toBoolean" | "toColorValue" | "toNumber" | "toStringValue"
  >;
  safeClipGet: (clip: LiveClip, property: ClipProperty) => Promise<unknown>;
  setClipColor: (color: number | undefined) => void;
  setClipName: (name: string) => void;
  slotIndex: number;
  token: number;
  trackIndex: number;
  trackToken: () => number;
}

interface SyncTrackStateOptions {
  normalizers: Pick<PayloadNormalizers, "toColorValue" | "toStringValue">;
  safeTrackGet: (
    track: LiveTrack,
    property: "color" | "name",
  ) => Promise<unknown>;
  setTrackColor: (color: number | undefined) => void;
  setTrackName: (name: string) => void;
  track: LiveTrack;
}

/**
 * Observes a clip property and stores the resulting cleanup.
 * @param options - Clip observation dependencies and mutation callbacks.
 */
export async function observeClipProperty(
  options: ObserveClipPropertyOptions,
): Promise<void> {
  const stop = await options.safeClipObserve(
    options.clip,
    options.property,
    (value) => {
      if (!options.isActiveClip(options.trackIndex, options.slotIndex)) {
        return;
      }

      options.applyValue(value);
      options.emit();
    },
  );
  options.registerCleanup(options.clipObserverCleanups, stop);
}

/**
 * Observes a scene property and stores the resulting cleanup.
 * @param options - Scene observation dependencies and mutation callbacks.
 */
export async function observeSceneProperty(
  options: ObserveScenePropertyOptions,
): Promise<void> {
  const stop = await options.safeSceneObserve(
    options.scene,
    options.property,
    (value) => {
      if (options.activeScene() !== options.sceneIndex) {
        return;
      }

      options.applyValue(value);
      options.emit();
    },
  );
  options.registerCleanup(options.sceneObserverCleanups, stop);
}

/**
 * Observes a song-level metric and stores the resulting cleanup.
 * @param options - Song observation dependencies and mutation callbacks.
 */
export async function observeSongMetric(
  options: ObserveSongMetricOptions,
): Promise<void> {
  const stop = await options.safeSongObserve(options.property, (value) => {
    options.applyValue(value);
    options.emit();
  });
  options.registerCleanup(options.songObserverCleanups, stop);
}

/**
 * Observes track state changes and stores the resulting cleanups.
 * @param options - Track observation dependencies and mutation callbacks.
 */
export async function observeTrackState(
  options: ObserveTrackStateOptions,
): Promise<void> {
  const stopPlayingSlot = await options.safeTrackObserve(
    options.track,
    "playing_slot_index",
    (slotIndex) => {
      if (options.selectedTrack() === options.trackIndex) {
        void options.handlePlayingSlot(
          options.normalizers.toNumber(slotIndex, options.unplayedSlotIndex),
        );
      }
    },
  );
  const stopTrackName = await options.safeTrackObserve(
    options.track,
    "name",
    (name) => {
      if (options.selectedTrack() === options.trackIndex) {
        options.setTrackName(options.normalizers.toStringValue(name));
        options.emit();
      }
    },
  );
  const stopTrackColor = await options.safeTrackObserve(
    options.track,
    "color",
    (color) => {
      if (options.selectedTrack() === options.trackIndex) {
        options.setTrackColor(options.normalizers.toColorValue(color));
        options.emit();
      }
    },
  );

  options.registerCleanup(options.trackObserverCleanups, stopPlayingSlot);
  options.registerCleanup(options.trackObserverCleanups, stopTrackName);
  options.registerCleanup(options.trackObserverCleanups, stopTrackColor);
}

/**
 * Reads the current clip snapshot into bridge state.
 * @param options - Clip synchronization dependencies and mutation callbacks.
 */
export async function syncClipSnapshot(
  options: SyncClipSnapshotOptions,
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
    options.safeClipGet(options.clip, "playing_position"),
    options.safeClipGet(options.clip, "color"),
    options.safeClipGet(options.clip, "name"),
    options.safeClipGet(options.clip, "length"),
    options.safeClipGet(options.clip, "loop_start"),
    options.safeClipGet(options.clip, "loop_end"),
    options.safeClipGet(options.clip, "looping"),
  ]);

  if (
    options.token !== options.trackToken() ||
    !options.isActiveClip(options.trackIndex, options.slotIndex)
  ) {
    return;
  }

  options.handlePlayingPosition(options.normalizers.toNumber(playingPosition));
  options.setClipColor(options.normalizers.toColorValue(clipColor));
  options.setClipName(options.normalizers.toStringValue(clipName));
  options.clipMeta.length = options.normalizers.toNumber(
    clipLength,
    options.clipMeta.length,
  );
  options.clipMeta.loopStart = options.normalizers.toNumber(
    loopStart,
    options.clipMeta.loopStart,
  );
  options.clipMeta.loopEnd = options.normalizers.toNumber(
    loopEnd,
    options.clipMeta.loopEnd,
  );
  options.clipMeta.looping = options.normalizers.toBoolean(looping);
}

/**
 * Reads the current track name and color into bridge state.
 * @param options - Track synchronization dependencies and mutation callbacks.
 */
export async function syncTrackState(
  options: SyncTrackStateOptions,
): Promise<void> {
  options.setTrackName(
    options.normalizers.toStringValue(
      await options.safeTrackGet(options.track, "name"),
    ),
  );
  options.setTrackColor(
    options.normalizers.toColorValue(
      await options.safeTrackGet(options.track, "color"),
    ),
  );
}
