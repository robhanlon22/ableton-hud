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
  /**
   * Creates guarded access helpers around the Live song and song-view APIs.
   * @param song - Live song facade.
   * @param songView - Live song-view facade.
   * @param normalizers - Payload normalization helpers.
   */
  constructor(
    private readonly song: LiveSong,
    private readonly songView: LiveSongView,
    private readonly normalizers: PayloadNormalizers,
  ) {}

  /**
   * Resolves a Live track by index.
   * @param trackIndex - Track index to load.
   * @returns The resolved track when available.
   */
  async getTrack(trackIndex: number): Promise<LiveTrack | undefined> {
    const track = await this.safeCall(() =>
      this.song.child("tracks", trackIndex),
    );
    return isLiveTrack(track) ? track : undefined;
  }

  /**
   * Resolves a selected-track payload to a track index.
   * @param selectedTrack - Raw selected-track payload from Live.
   * @returns The resolved track index or `-1` when unavailable.
   */
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

  /**
   * Reads a clip property with guarded Live error handling.
   * @param clip - Clip to query.
   * @param property - Clip property to read.
   * @returns The raw property payload when available.
   */
  async safeClipGet(clip: LiveClip, property: ClipProperty): Promise<unknown> {
    return this.safeCall(() => clip.get(property));
  }

  /**
   * Observes a clip property with guarded Live error handling.
   * @param clip - Clip to observe.
   * @param property - Clip property to observe.
   * @param listener - Listener for observed values.
   * @returns A cleanup callback when observation succeeds.
   */
  async safeClipObserve(
    clip: LiveClip,
    property: ClipProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => clip.observe(property, listener));
  }

  /**
   * Resolves the clip inside a clip slot.
   * @param clipSlot - Clip slot to query.
   * @returns The resolved clip when present.
   */
  async safeClipSlotClip(
    clipSlot: LiveClipSlot,
  ): Promise<LiveClip | undefined> {
    const clip = await this.safeCall(() => clipSlot.clip());
    return isLiveClip(clip) ? clip : undefined;
  }

  /**
   * Reads a clip-slot property with guarded Live error handling.
   * @param clipSlot - Clip slot to query.
   * @param property - Clip-slot property to read.
   * @returns The raw property payload when available.
   */
  async safeClipSlotGet(
    clipSlot: LiveClipSlot,
    property: "has_clip",
  ): Promise<unknown> {
    return this.safeCall(() => clipSlot.get(property));
  }

  /**
   * Reads a scene property with guarded Live error handling.
   * @param scene - Scene to query.
   * @param property - Scene property to read.
   * @returns The raw property payload when available.
   */
  async safeSceneGet(
    scene: LiveScene,
    property: SceneProperty,
  ): Promise<unknown> {
    return this.safeCall(() => scene.get(property));
  }

  /**
   * Observes a scene property with guarded Live error handling.
   * @param scene - Scene to observe.
   * @param property - Scene property to observe.
   * @param listener - Listener for observed values.
   * @returns A cleanup callback when observation succeeds.
   */
  async safeSceneObserve(
    scene: LiveScene,
    property: SceneProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => scene.observe(property, listener));
  }

  /**
   * Reads a song property with guarded Live error handling.
   * @param property - Song property to read.
   * @returns The raw property payload when available.
   */
  async safeSongGet(property: SongProperty): Promise<unknown> {
    return this.safeCall(() => this.song.get(property));
  }

  /**
   * Observes a song property with guarded Live error handling.
   * @param property - Song property to observe.
   * @param listener - Listener for observed values.
   * @returns A cleanup callback when observation succeeds.
   */
  async safeSongObserve(
    property: SongProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => this.song.observe(property, listener));
  }

  /**
   * Resolves a scene child from the Live song.
   * @param sceneIndex - Scene index to load.
   * @returns The resolved scene when available.
   */
  async safeSongSceneChild(sceneIndex: number): Promise<LiveScene | undefined> {
    const scene = await this.safeCall(() =>
      this.song.child("scenes", sceneIndex),
    );
    return isLiveScene(scene) ? scene : undefined;
  }

  /**
   * Resolves all Live tracks from the song.
   * @returns Normalized track objects that could be loaded from Live.
   */
  async safeSongTracks(): Promise<LiveTrack[]> {
    const tracks = await this.safeCall(() => this.song.children("tracks"));
    return Array.isArray(tracks)
      ? tracks.filter((track): track is LiveTrack => isLiveTrack(track))
      : [];
  }

  /**
   * Reads the selected-track song-view property.
   * @param property - Song-view property to read.
   * @returns The raw property payload when available.
   */
  async safeSongViewGet(property: "selected_track"): Promise<unknown> {
    return this.safeCall(() => this.songView.get(property));
  }

  /**
   * Observes the selected-track song-view property.
   * @param property - Song-view property to observe.
   * @param listener - Listener for observed values.
   * @returns A cleanup callback when observation succeeds.
   */
  async safeSongViewObserve(
    property: "selected_track",
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => this.songView.observe(property, listener));
  }

  /**
   * Resolves a clip slot from a track.
   * @param track - Track to query.
   * @param clipSlotIndex - Clip-slot index to load.
   * @returns The resolved clip slot when available.
   */
  async safeTrackChild(
    track: LiveTrack,
    clipSlotIndex: number,
  ): Promise<LiveClipSlot | undefined> {
    const clipSlot = await this.safeCall(() =>
      track.child("clip_slots", clipSlotIndex),
    );
    return isLiveClipSlot(clipSlot) ? clipSlot : undefined;
  }

  /**
   * Reads a track property with guarded Live error handling.
   * @param track - Track to query.
   * @param property - Track property to read.
   * @returns The raw property payload when available.
   */
  async safeTrackGet(
    track: LiveTrack,
    property: TrackProperty,
  ): Promise<unknown> {
    return this.safeCall(() => track.get(property));
  }

  /**
   * Observes a track property with guarded Live error handling.
   * @param track - Track to observe.
   * @param property - Track property to observe.
   * @param listener - Listener for observed values.
   * @returns A cleanup callback when observation succeeds.
   */
  async safeTrackObserve(
    track: LiveTrack,
    property: TrackProperty,
    listener: (value: unknown) => void,
  ): Promise<ObserverCleanup | undefined> {
    return this.safeObserve(() => track.observe(property, listener));
  }

  /**
   * Resolves a track index by matching a selected-track Live object id.
   * @param selectedTrackId - Selected-track object id from Live.
   * @returns The resolved track index or the original id when it cannot be mapped.
   */
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

  /**
   * Runs a Live operation and swallows transport-layer failures.
   * @param operation - Live operation to invoke.
   * @returns The resolved value when the call succeeds.
   */
  private async safeCall<T>(
    operation: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch {
      return undefined;
    }
  }

  /**
   * Runs a Live observe operation and normalizes its cleanup callback.
   * @param operation - Observe operation to invoke.
   * @returns A normalized cleanup callback when observation succeeds.
   */
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

  return methodNames.every((methodName) => {
    return hasNamedMethod(value, methodName);
  });
}

/**
 * Checks whether an object exposes a named method on itself or its prototype chain.
 * @param value - Candidate object to inspect.
 * @param methodName - Method name that must resolve to a function.
 * @returns Whether the named method exists and is callable.
 */
function hasNamedMethod(value: object, methodName: string): boolean {
  const ownDescriptor = Object.getOwnPropertyDescriptor(value, methodName);
  if (typeof ownDescriptor?.value === "function") {
    return true;
  }

  const prototypeCandidate: unknown = Object.getPrototypeOf(value);
  if (prototypeCandidate === null || typeof prototypeCandidate !== "object") {
    return false;
  }

  return hasNamedMethod(prototypeCandidate, methodName);
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
