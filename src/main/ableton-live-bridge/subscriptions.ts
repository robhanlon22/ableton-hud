import type {
  ClipProperty,
  LiveClip,
  LiveScene,
  LiveTrack,
  ObserverCleanup,
  PayloadNormalizers,
  SceneProperty,
  SongProperty,
} from "./types";

/**
 * Dependencies required to observe one property on the active clip.
 */
interface ObserveClipPropertyOptions {
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
   * Cleanup callbacks for the active clip observers.
   */
  clipObserverCleanups: ObserverCleanup[];
  /**
   * Emits the latest HUD state to renderer listeners.
   */
  emit: () => void;
  /**
   * Checks whether a clip is still the active clip after async work completes.
   * @param track - Zero-based track index to compare.
   * @param clip - Zero-based clip-slot index to compare.
   * @returns Whether the clip is still active.
   */
  isActiveClip: (track: number, clip: number) => boolean;
  /**
   * Clip property to observe.
   */
  property: ClipProperty;
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
   * Zero-based active clip-slot index.
   */
  slotIndex: number;
  /**
   * Zero-based track index containing the active clip.
   */
  trackIndex: number;
}

/**
 * Dependencies required to observe one property on the active scene.
 */
interface ObserveScenePropertyOptions {
  /**
   * Reads the currently active scene index from bridge state.
   * @returns The active scene index, when one is selected.
   */
  activeScene: () => number | undefined;
  /**
   * Applies the normalized property value to bridge state.
   * @param value - Raw Live payload to normalize and store.
   */
  applyValue: (value: unknown) => void;
  /**
   * Emits the latest HUD state to renderer listeners.
   */
  emit: () => void;
  /**
   * Scene property to observe.
   */
  property: SceneProperty;
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
   * Active scene to observe.
   */
  scene: LiveScene;
  /**
   * Zero-based active scene index.
   */
  sceneIndex: number;
  /**
   * Cleanup callbacks for the active scene observers.
   */
  sceneObserverCleanups: ObserverCleanup[];
}

/**
 * Dependencies required to observe a song-level metric.
 */
interface ObserveSongMetricOptions {
  /**
   * Applies the normalized property value to bridge state.
   * @param value - Raw Live payload to normalize and store.
   */
  applyValue: (value: unknown) => void;
  /**
   * Emits the latest HUD state to renderer listeners.
   */
  emit: () => void;
  /**
   * Song property to observe.
   */
  property: SongProperty;
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
   * Observes a song property with guarded Live error handling.
   * @param property - Song property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A cleanup callback when observation succeeds.
   */
  safeSongObserve: (
    property: SongProperty,
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  /**
   * Cleanup callbacks for the active song observers.
   */
  songObserverCleanups: ObserverCleanup[];
}

/**
 * Dependencies required to observe selected-track metadata and playback state.
 */
interface ObserveTrackStateOptions {
  /**
   * Emits the latest HUD state to renderer listeners.
   */
  emit: () => void;
  /**
   * Applies an updated playing slot to bridge state.
   * @param slotIndex - Zero-based playing slot index, or the inactive sentinel.
   * @returns A promise that settles after the slot update is handled.
   */
  handlePlayingSlot: (slotIndex: number) => Promise<void>;
  /**
   * Track payload normalizers used while processing observer values.
   */
  normalizers: Pick<
    PayloadNormalizers,
    "toColorValue" | "toNumber" | "toStringValue"
  >;
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
   * Observes a track property with guarded Live error handling.
   * @param track - Track to observe.
   * @param property - Track property to observe.
   * @param listener - Listener invoked with raw Live payloads.
   * @returns A cleanup callback when observation succeeds.
   */
  safeTrackObserve: (
    track: LiveTrack,
    property: "color" | "name" | "playing_slot_index",
    listener: (value: unknown) => void,
  ) => Promise<ObserverCleanup | undefined>;
  /**
   * Reads the currently selected track index from bridge state.
   * @returns The selected track index, when one is selected.
   */
  selectedTrack: () => number | undefined;
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
   * Selected track to observe.
   */
  track: LiveTrack;
  /**
   * Zero-based selected track index.
   */
  trackIndex: number;
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
 * Dependencies required to sync the active clip snapshot into bridge state.
 */
interface SyncClipSnapshotOptions {
  /**
   * Active clip whose snapshot should be read.
   */
  clip: LiveClip;
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
   * Clip payload normalizers used while processing snapshot values.
   */
  normalizers: Pick<
    PayloadNormalizers,
    "toBoolean" | "toColorValue" | "toNumber" | "toStringValue"
  >;
  /**
   * Reads a clip property with guarded Live error handling.
   * @param clip - Clip to query.
   * @param property - Clip property to read.
   * @returns The raw Live payload when available.
   */
  safeClipGet: (clip: LiveClip, property: ClipProperty) => Promise<unknown>;
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
   * Zero-based active clip-slot index.
   */
  slotIndex: number;
  /**
   * Selected-track token guarding against stale async work.
   */
  token: number;
  /**
   * Zero-based track index containing the active clip.
   */
  trackIndex: number;
  /**
   * Reads the current selected-track token from bridge state.
   * @returns The current selected-track token.
   */
  trackToken: () => number;
}

/**
 * Dependencies required to sync selected-track metadata into bridge state.
 */
interface SyncTrackStateOptions {
  /**
   * Track payload normalizers used while processing snapshot values.
   */
  normalizers: Pick<PayloadNormalizers, "toColorValue" | "toStringValue">;
  /**
   * Reads a track property with guarded Live error handling.
   * @param track - Track to query.
   * @param property - Track property to read.
   * @returns The raw Live payload when available.
   */
  safeTrackGet: (
    track: LiveTrack,
    property: "color" | "name",
  ) => Promise<unknown>;
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
   * Selected track whose snapshot should be read.
   */
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
