import {
  buildClipPath,
  buildClipSlotPath,
  type ClipState,
  type FakeLiveSnapshot,
  type SceneState,
  type SongState,
  type TrackState,
} from "./fake-ableton-live-support";

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

type LiveProperty = boolean | number | string | undefined;
interface PathIndexes {
  slotIndex: number;
  trackIndex: number;
}

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

const parseTrackIndex = (path: string): number | undefined =>
  parseSingleIndex(TRACK_PATH_PATTERN, path);

const parseTrackPrefixIndex = (path: string): number | undefined =>
  parseSingleIndex(TRACK_PREFIX_PATTERN, path);

const parseSceneIndex = (path: string): number | undefined =>
  parseSingleIndex(SCENE_PATH_PATTERN, path);

const parseClipSlotIndexes = (path: string): PathIndexes | undefined =>
  parsePathIndexes(CLIP_SLOT_PATH_PATTERN, path);

const parseClipIndexes = (path: string): PathIndexes | undefined =>
  parsePathIndexes(CLIP_PATH_PATTERN, path);

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

const selectByIndex = <T>(items: T[], index?: number): T[] => {
  if (index === undefined) {
    return items;
  }
  return items.slice(index, index + 1);
};

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
