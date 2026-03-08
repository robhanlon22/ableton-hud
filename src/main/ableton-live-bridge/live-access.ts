import type {
  ClipProperty,
  LiveClip,
  LiveClipSlot,
  LiveScene,
  LiveSong,
  LiveSongView,
  LiveTrack,
  ObserverCleanup,
  PayloadNormalizers,
  SceneProperty,
  SongProperty,
  TrackProperty,
} from "./types";

/**
 * Encapsulates guarded Live API access and payload normalization.
 */
export class LiveBridgeAccess {
  constructor(
    private readonly song: LiveSong,
    private readonly songView: LiveSongView,
    private readonly normalizers: PayloadNormalizers,
  ) {}

  async getTrack(trackIndex: number): Promise<LiveTrack | undefined> {
    const track = await this.safeCall(() =>
      this.song.child("tracks", trackIndex),
    );
    return isLiveTrack(track) ? track : undefined;
  }

  async resolveTrackIndex(selectedTrack: unknown): Promise<number> {
    const payload =
      this.normalizers.normalizeSelectedTrackPayload(selectedTrack);
    if (payload.directId !== undefined) {
      return this.resolveTrackIndexFromId(payload.directId);
    }

    const parsedIndex = this.normalizers.parseTrackIndexFromPath(
      payload.path ?? payload.rawPath,
    );
    return parsedIndex >= 0 ? parsedIndex : -1;
  }

  async safeClipGet(clip: LiveClip, property: ClipProperty): Promise<unknown> {
    return this.safeCall(() => clip.get(property));
  }

  async safeClipObserve(
    clip: LiveClip,
    property: ClipProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => clip.observe(property, listener));
  }

  async safeClipSlotClip(
    clipSlot: LiveClipSlot,
  ): Promise<LiveClip | undefined> {
    const clip = await this.safeCall(() => clipSlot.clip());
    return isLiveClip(clip) ? clip : undefined;
  }

  async safeClipSlotGet(
    clipSlot: LiveClipSlot,
    property: "has_clip",
  ): Promise<unknown> {
    return this.safeCall(() => clipSlot.get(property));
  }

  async safeSceneGet(
    scene: LiveScene,
    property: SceneProperty,
  ): Promise<unknown> {
    return this.safeCall(() => scene.get(property));
  }

  async safeSceneObserve(
    scene: LiveScene,
    property: SceneProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => scene.observe(property, listener));
  }

  async safeSongGet(property: SongProperty): Promise<unknown> {
    return this.safeCall(() => this.song.get(property));
  }

  async safeSongObserve(
    property: SongProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => this.song.observe(property, listener));
  }

  async safeSongSceneChild(sceneIndex: number): Promise<LiveScene | undefined> {
    const scene = await this.safeCall(() =>
      this.song.child("scenes", sceneIndex),
    );
    return isLiveScene(scene) ? scene : undefined;
  }

  async safeSongTracks(): Promise<LiveTrack[]> {
    const tracks = await this.safeCall(() => this.song.children("tracks"));
    return Array.isArray(tracks)
      ? tracks.filter((track): track is LiveTrack => isLiveTrack(track))
      : [];
  }

  async safeSongViewGet(property: "selected_track"): Promise<unknown> {
    return this.safeCall(() => this.songView.get(property));
  }

  async safeSongViewObserve(
    property: "selected_track",
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => this.songView.observe(property, listener));
  }

  async safeTrackChild(
    track: LiveTrack,
    clipSlotIndex: number,
  ): Promise<LiveClipSlot | undefined> {
    const clipSlot = await this.safeCall(() =>
      track.child("clip_slots", clipSlotIndex),
    );
    return isLiveClipSlot(clipSlot) ? clipSlot : undefined;
  }

  async safeTrackGet(
    track: LiveTrack,
    property: TrackProperty,
  ): Promise<unknown> {
    return this.safeCall(() => track.get(property));
  }

  async safeTrackObserve(
    track: LiveTrack,
    property: TrackProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => track.observe(property, listener));
  }

  private async resolveTrackIndexFromId(
    selectedTrackId: number,
  ): Promise<number> {
    const tracks = await this.safeSongTracks();
    const matchedTrack = tracks.find((track) => {
      const normalizedTrack = this.normalizers.normalizeTrackRef(track);
      return (
        normalizedTrack.id === selectedTrackId ||
        normalizedTrack.rawId === selectedTrackId
      );
    });

    if (matchedTrack === undefined) {
      return selectedTrackId;
    }

    const normalizedTrack = this.normalizers.normalizeTrackRef(matchedTrack);
    const parsedIndex = this.normalizers.parseTrackIndexFromPath(
      normalizedTrack.path ?? normalizedTrack.rawPath,
    );
    return parsedIndex >= 0 ? parsedIndex : selectedTrackId;
  }

  private async safeCall<T>(
    operation: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch {
      return undefined;
    }
  }

  private async safeObserve(
    operation: () => Promise<unknown>,
  ): Promise<ObserverCleanup | undefined> {
    const cleanup = await this.safeCall(operation);
    return this.normalizers.normalizeCleanup(cleanup);
  }
}

/**
 * Checks that an unknown value exposes the named function members.
 * @param value - The value to inspect.
 * @param methodNames - Required method names.
 * @returns Whether the required methods are present.
 */
function hasLiveMethods(value: unknown, methodNames: string[]): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const target = value;
  return methodNames.every((methodName) => {
    return typeof Reflect.get(target, methodName) === "function";
  });
}

/**
 * Checks whether a value implements the Live `clip` contract.
 * @param value - The value to inspect.
 * @returns Whether the value matches the clip surface.
 */
function isLiveClip(value: unknown): value is LiveClip {
  return hasLiveMethods(value, ["get", "observe"]);
}

/**
 * Checks whether a value implements the Live `clip slot` contract.
 * @param value - The value to inspect.
 * @returns Whether the value matches the clip-slot surface.
 */
function isLiveClipSlot(value: unknown): value is LiveClipSlot {
  return hasLiveMethods(value, ["clip", "get"]);
}

/**
 * Checks whether a value implements the Live `scene` contract.
 * @param value - The value to inspect.
 * @returns Whether the value matches the scene surface.
 */
function isLiveScene(value: unknown): value is LiveScene {
  return hasLiveMethods(value, ["get", "observe"]);
}

/**
 * Checks whether a value implements the Live `track` contract.
 * @param value - The value to inspect.
 * @returns Whether the value matches the track surface.
 */
function isLiveTrack(value: unknown): value is LiveTrack {
  return hasLiveMethods(value, ["child", "get", "observe"]);
}
