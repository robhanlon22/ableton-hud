import {
  buildClipPath,
  buildClipSlotPath,
  type ClipState,
  type FakeLiveSnapshot,
  type SceneState,
  type SongState,
  type TrackState,
} from "./support";

const RAW_CLIP_IDENTIFIER_BASE = 200;
const EMPTY_CLIP_CHILD: SerializedLiveObject = {
  id: "0",
  is_audio_clip: false,
  length: 0,
  name: "",
  path: "",
};
const LIVE_SET_PATH = "live_set";
const LIVE_SET_VIEW_PATH = "live_set view";
const TRACKS_CHILD = "tracks";
const SCENES_CHILD = "scenes";
const CLIP_SLOTS_CHILD = "clip_slots";
const CLIP_CHILD = "clip";
const SELECTED_TRACK_PROPERTY = "selected_track";
const TRACK_PATH_PATTERN = /^live_set tracks (\d+)$/u;
const TRACK_PREFIX_PATTERN = /^live_set tracks (\d+)/u;
const SCENE_PATH_PATTERN = /^live_set scenes (\d+)$/u;
const CLIP_SLOT_PATH_PATTERN = /^live_set tracks (\d+) clip_slots (\d+)$/u;
const CLIP_PATH_PATTERN = /^live_set tracks (\d+) clip_slots (\d+) clip$/u;

/**
 *
 */
type LiveProperty = boolean | number | string | undefined;

/**
 * Captures the track and clip-slot indexes parsed from a Live object path.
 */
interface PathIndexes {
  /**
   * Zero-based clip-slot index parsed from the path.
   */
  slotIndex: number;

  /**
   * Zero-based track index parsed from the path.
   */
  trackIndex: number;
}

/**
 *
 */
type SerializedLiveObject = Record<string, unknown>;

/**
 * Resolves a `children` websocket request from the fake Live snapshot.
 * @param snapshot - Current fake Live state.
 * @param path - Object path requested by the client.
 * @param child - Requested child collection.
 * @param index - Optional child index filter.
 * @returns Serialized child objects for the requested path.
 */
export function resolveChildren(
  snapshot: FakeLiveSnapshot,
  path: string,
  child: string,
  index?: number,
): SerializedLiveObject[] {
  if (path === LIVE_SET_PATH) {
    return selectByIndex(resolveLiveSetChildren(snapshot, child), index);
  }

  const clipSlotChildren = resolveClipSlotChildren(snapshot, path, child);
  if (clipSlotChildren) {
    return selectByIndex(clipSlotChildren, index);
  }

  return resolveClipChildren(snapshot, path, child) ?? [];
}

/**
 * Resolves a `get` websocket request from the fake Live snapshot.
 * @param snapshot - Current fake Live state.
 * @param path - Object path requested by the client.
 * @param property - Property name requested by the client.
 * @returns Serialized property value for the requested path.
 */
export function resolveGet(
  snapshot: FakeLiveSnapshot,
  path: string,
  property: string,
): LiveProperty {
  if (path === LIVE_SET_VIEW_PATH && property === SELECTED_TRACK_PROPERTY) {
    return snapshot.selectedTrackId;
  }

  if (path === LIVE_SET_PATH) {
    return resolveSongProperty(snapshot.song, property);
  }

  return (
    resolveTrackProperty(snapshot, path, property) ??
    resolveSceneProperty(snapshot, path, property) ??
    resolveClipSlotProperty(snapshot, path, property) ??
    resolveClipProperty(snapshot, path, property)
  );
}

/**
 * Resolves top-level `live_set` child collections.
 * @param snapshot - Current fake Live state.
 * @param child - Requested child collection.
 * @returns Serialized top-level child objects.
 */
const resolveLiveSetChildren = (
  snapshot: FakeLiveSnapshot,
  child: string,
): SerializedLiveObject[] => {
  if (child === TRACKS_CHILD) {
    return snapshot.tracks.map((track, trackIndex) => {
      return {
        has_audio_input: track.hasAudioInput,
        id: String(track.id),
        name: track.name,
        path: `live_set tracks ${String(trackIndex)}`,
      };
    });
  }
  if (child === SCENES_CHILD) {
    return snapshot.scenes.map((scene, sceneIndex) => {
      return {
        id: String(scene.id),
        isEmpty: false,
        name: scene.name,
        path: `live_set scenes ${String(sceneIndex)}`,
      };
    });
  }
  return [];
};

/**
 * Resolves clip-slot children for a track path.
 * @param snapshot - Current fake Live state.
 * @param path - Requested track path.
 * @param child - Requested child collection.
 * @returns Serialized clip slots or `undefined` when the path does not match.
 */
const resolveClipSlotChildren = (
  snapshot: FakeLiveSnapshot,
  path: string,
  child: string,
): SerializedLiveObject[] | undefined => {
  const trackIndex = parseTrackPrefixIndex(path);
  if (trackIndex === undefined || child !== CLIP_SLOTS_CHILD) {
    return undefined;
  }

  const track = snapshot.tracks.at(trackIndex);
  if (!track) {
    return [];
  }

  return track.clipSlots.map((slot, slotIndex) => {
    return {
      clip: createRawClip(slot.clip, trackIndex, slotIndex),
      has_clip: slot.hasClip,
      id: slot.id,
      path: buildClipSlotPath(trackIndex, slotIndex),
    };
  });
};

/**
 * Resolves clip children for a clip-slot path.
 * @param snapshot - Current fake Live state.
 * @param path - Requested clip-slot path.
 * @param child - Requested child collection.
 * @returns Serialized clip children or `undefined` when the path does not match.
 */
const resolveClipChildren = (
  snapshot: FakeLiveSnapshot,
  path: string,
  child: string,
): SerializedLiveObject[] | undefined => {
  const indexes = parseClipSlotIndexes(path);
  if (!indexes || child !== CLIP_CHILD) {
    return undefined;
  }

  const { slotIndex, trackIndex } = indexes;
  const slot = snapshot.tracks.at(trackIndex)?.clipSlots.at(slotIndex);
  if (!slot?.hasClip) {
    return [EMPTY_CLIP_CHILD];
  }

  return [createRawClip(slot.clip, trackIndex, slotIndex)];
};

/**
 * Resolves a track property from the fake Live snapshot.
 * @param snapshot - Current fake Live state.
 * @param path - Requested track path.
 * @param property - Requested property name.
 * @returns Serialized property value for the matched track.
 */
const resolveTrackProperty = (
  snapshot: FakeLiveSnapshot,
  path: string,
  property: string,
): LiveProperty => {
  const trackIndex = parseTrackIndex(path);
  const track =
    trackIndex === undefined ? undefined : snapshot.tracks.at(trackIndex);
  return track ? readTrackProperty(track, property) : undefined;
};

/**
 * Resolves a scene property from the fake Live snapshot.
 * @param snapshot - Current fake Live state.
 * @param path - Requested scene path.
 * @param property - Requested property name.
 * @returns Serialized property value for the matched scene.
 */
const resolveSceneProperty = (
  snapshot: FakeLiveSnapshot,
  path: string,
  property: string,
): LiveProperty => {
  const sceneIndex = parseSceneIndex(path);
  const scene =
    sceneIndex === undefined ? undefined : snapshot.scenes.at(sceneIndex);
  return scene ? readSceneProperty(scene, property) : undefined;
};

/**
 * Resolves clip-slot properties that the fake server exposes directly.
 * @param snapshot - Current fake Live state.
 * @param path - Requested clip-slot path.
 * @param property - Requested property name.
 * @returns Clip-slot property value for the matched path.
 */
const resolveClipSlotProperty = (
  snapshot: FakeLiveSnapshot,
  path: string,
  property: string,
): boolean | undefined => {
  const indexes = parseClipSlotIndexes(path);
  if (!indexes || property !== "has_clip") {
    return undefined;
  }

  return (
    snapshot.tracks.at(indexes.trackIndex)?.clipSlots.at(indexes.slotIndex)
      ?.hasClip ?? false
  );
};

/**
 * Resolves a clip property from the fake Live snapshot.
 * @param snapshot - Current fake Live state.
 * @param path - Requested clip path.
 * @param property - Requested property name.
 * @returns Serialized property value for the matched clip.
 */
const resolveClipProperty = (
  snapshot: FakeLiveSnapshot,
  path: string,
  property: string,
): LiveProperty => {
  const indexes = parseClipIndexes(path);
  const clip =
    indexes === undefined
      ? undefined
      : snapshot.tracks.at(indexes.trackIndex)?.clipSlots.at(indexes.slotIndex)
          ?.clip;
  return clip ? readClipProperty(clip, property) : undefined;
};

/**
 * Resolves a song property from the fake Live snapshot.
 * @param song - Fake Live song state.
 * @param property - Requested property name.
 * @returns Serialized property value for the matched song property.
 */
const resolveSongProperty = (
  song: SongState,
  property: string,
): LiveProperty => {
  const propertyValues: Record<string, LiveProperty> = {
    current_song_time: song.currentSongTime,
    is_playing: song.isPlaying,
    signature_denominator: song.signatureDenominator,
    signature_numerator: song.signatureNumerator,
  };
  return propertyValues[property];
};

/**
 * Reads a serialized track property value.
 * @param track - Fake track state.
 * @param property - Requested property name.
 * @returns Serialized property value for the track.
 */
const readTrackProperty = (
  track: TrackState,
  property: string,
): LiveProperty => {
  const propertyValues: Record<string, LiveProperty> = {
    color: track.color,
    name: track.name,
    playing_slot_index: track.playingSlotIndex,
  };
  return propertyValues[property];
};

/**
 * Reads a serialized scene property value.
 * @param scene - Fake scene state.
 * @param property - Requested property name.
 * @returns Serialized property value for the scene.
 */
const readSceneProperty = (
  scene: SceneState,
  property: string,
): LiveProperty => {
  const propertyValues: Record<string, LiveProperty> = {
    color: scene.color,
    name: scene.name,
  };
  return propertyValues[property];
};

/**
 * Reads a serialized clip property value.
 * @param clip - Fake clip state.
 * @param property - Requested property name.
 * @returns Serialized property value for the clip.
 */
const readClipProperty = (clip: ClipState, property: string): LiveProperty => {
  const propertyValues: Record<string, LiveProperty> = {
    color: clip.color,
    length: clip.length,
    loop_end: clip.loopEnd,
    loop_start: clip.loopStart,
    looping: clip.looping,
    name: clip.name,
    playing_position: clip.playingPosition,
  };
  return propertyValues[property];
};

/**
 * Parses a track index from a full track path.
 * @param path - Candidate Live object path.
 * @returns Parsed track index when present.
 */
const parseTrackIndex = (path: string): number | undefined =>
  parseSingleIndex(TRACK_PATH_PATTERN, path);

/**
 * Parses a track index from a track-path prefix.
 * @param path - Candidate Live object path.
 * @returns Parsed track index when present.
 */
const parseTrackPrefixIndex = (path: string): number | undefined =>
  parseSingleIndex(TRACK_PREFIX_PATTERN, path);

/**
 * Parses a scene index from a scene path.
 * @param path - Candidate Live object path.
 * @returns Parsed scene index when present.
 */
const parseSceneIndex = (path: string): number | undefined =>
  parseSingleIndex(SCENE_PATH_PATTERN, path);

/**
 * Parses track and slot indexes from a clip-slot path.
 * @param path - Candidate Live object path.
 * @returns Parsed track and slot indexes when present.
 */
const parseClipSlotIndexes = (path: string): PathIndexes | undefined =>
  parsePathIndexes(CLIP_SLOT_PATH_PATTERN, path);

/**
 * Parses track and slot indexes from a clip path.
 * @param path - Candidate Live object path.
 * @returns Parsed track and slot indexes when present.
 */
const parseClipIndexes = (path: string): PathIndexes | undefined =>
  parsePathIndexes(CLIP_PATH_PATTERN, path);

/**
 * Parses a single numeric index from a path.
 * @param pattern - Pattern used to capture the index.
 * @param path - Candidate Live object path.
 * @returns Parsed index when the path matches.
 */
const parseSingleIndex = (
  pattern: RegExp,
  path: string,
): number | undefined => {
  const match = pattern.exec(path);
  if (!match) {
    return undefined;
  }

  const [, indexText] = match;
  return Number(indexText);
};

/**
 * Parses track and slot indexes from a path with two captures.
 * @param pattern - Pattern used to capture the indexes.
 * @param path - Candidate Live object path.
 * @returns Parsed track and slot indexes when the path matches.
 */
const parsePathIndexes = (
  pattern: RegExp,
  path: string,
): PathIndexes | undefined => {
  const match = pattern.exec(path);
  if (!match) {
    return undefined;
  }

  const [, trackIndexText, slotIndexText] = match;
  return {
    slotIndex: Number(slotIndexText),
    trackIndex: Number(trackIndexText),
  };
};

/**
 * Selects a single serialized child by index when requested.
 * @param items - Candidate child objects.
 * @param index - Optional child index filter.
 * @returns The original list or a single-item slice.
 */
const selectByIndex = <T>(items: T[], index?: number): T[] => {
  if (index === undefined) {
    return items;
  }
  return items.slice(index, index + 1);
};

/**
 * Serializes a fake clip into the websocket child-object shape.
 * @param clip - Fake clip state.
 * @param trackIndex - Track index containing the clip.
 * @param slotIndex - Clip-slot index containing the clip.
 * @returns Serialized clip child object.
 */
const createRawClip = (
  clip: ClipState,
  trackIndex: number,
  slotIndex: number,
): SerializedLiveObject => {
  return {
    id: String(RAW_CLIP_IDENTIFIER_BASE + slotIndex + trackIndex),
    is_audio_clip: false,
    length: clip.length,
    name: clip.name,
    path: buildClipPath(trackIndex, slotIndex),
  };
};
