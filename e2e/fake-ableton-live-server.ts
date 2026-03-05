import { setTimeout as wait } from "node:timers/promises";
import { type WebSocket, WebSocketServer } from "ws";

export interface FakeLiveSnapshot {
  scenes: SceneState[];
  selectedTrackId: number;
  song: SongState;
  tracks: TrackState[];
}

interface ClipSlotState {
  clip: ClipState;
  hasClip: boolean;
  id: number;
}

interface ClipState {
  color: number;
  length: number;
  loopEnd: number;
  looping: boolean;
  loopStart: number;
  name: string;
  playingPosition: number;
}

interface ObserverRef {
  eventId: string;
  path: string;
  property: string;
}

interface SceneState {
  color: number;
  id: number;
  name: string;
}

interface SongState {
  currentSongTime: number;
  isPlaying: boolean;
  signatureDenominator: number;
  signatureNumerator: number;
}

interface TrackState {
  clipSlots: ClipSlotState[];
  color: number;
  hasAudioInput: boolean;
  id: number;
  name: string;
  playingSlotIndex: number;
}

interface WireMessage {
  action?: string;
  args?: Record<string, unknown>;
  path?: string;
  uuid?: string;
}

const DEFAULT_SNAPSHOT: FakeLiveSnapshot = {
  scenes: [
    {
      color: 0,
      id: 301,
      name: "Scene A",
    },
  ],
  selectedTrackId: 5,
  song: {
    currentSongTime: 0,
    isPlaying: true,
    signatureDenominator: 4,
    signatureNumerator: 4,
  },
  tracks: [
    {
      clipSlots: [
        {
          clip: {
            color: 0xffd000,
            length: 64,
            loopEnd: 64,
            looping: false,
            loopStart: 0,
            name: "Build",
            playingPosition: 0,
          },
          hasClip: true,
          id: 101,
        },
      ],
      color: 0xffd000,
      hasAudioInput: false,
      id: 5,
      name: "Track A",
      playingSlotIndex: 0,
    },
  ],
};

export class FakeAbletonLiveServer {
  get port(): number {
    if (!this.wss) {
      throw new Error("Fake server has not started.");
    }
    const address = this.wss.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to resolve fake server address.");
    }
    return address.port;
  }

  private clients = new Set<WebSocket>();
  private readonly observers = new Map<WebSocket, ObserverRef[]>();
  private readonly snapshot: FakeLiveSnapshot =
    structuredClone(DEFAULT_SNAPSHOT);
  private tickTimer: NodeJS.Timeout | null = null;
  private wss: null | WebSocketServer = null;

  static async start(): Promise<FakeAbletonLiveServer> {
    const instance = new FakeAbletonLiveServer();
    await instance.startInternal();
    return instance;
  }

  setClip(next: Partial<ClipState>): void {
    const clip = this.snapshot.tracks[0].clipSlots[0].clip;
    Object.assign(clip, next);
    this.emitTrackClipUpdates();
  }

  setScene(next: Partial<SceneState>): void {
    Object.assign(this.snapshot.scenes[0], next);
    this.emitProperty(
      "live_set scenes 0",
      "name",
      this.snapshot.scenes[0].name,
    );
    this.emitProperty(
      "live_set scenes 0",
      "color",
      this.snapshot.scenes[0].color,
    );
  }

  setSong(next: Partial<SongState>): void {
    Object.assign(this.snapshot.song, next);
    this.emitProperty("live_set", "is_playing", this.snapshot.song.isPlaying);
    this.emitProperty(
      "live_set",
      "signature_numerator",
      this.snapshot.song.signatureNumerator,
    );
    this.emitProperty(
      "live_set",
      "signature_denominator",
      this.snapshot.song.signatureDenominator,
    );
    this.emitProperty(
      "live_set",
      "current_song_time",
      this.snapshot.song.currentSongTime,
    );
  }

  setTrack(next: Partial<TrackState>): void {
    const track = this.snapshot.tracks[0];
    Object.assign(track, next);
    this.emitTrackUpdates();
  }

  async stabilize(): Promise<void> {
    await wait(200);
  }

  async stop(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.observers.clear();

    if (!this.wss) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.wss?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.wss = null;
  }

  private clipPath(trackIndex: number, slotIndex: number): string {
    return `live_set tracks ${String(trackIndex)} clip_slots ${String(slotIndex)} clip`;
  }

  private clipSlotPath(trackIndex: number, slotIndex: number): string {
    return `live_set tracks ${String(trackIndex)} clip_slots ${String(slotIndex)}`;
  }

  private emitProperty(path: string, property: string, data: unknown): void {
    for (const [socket, refs] of this.observers.entries()) {
      const listeners = refs
        .filter((ref) => ref.path === path && ref.property === property)
        .map((ref) => ref.eventId);
      if (listeners.length === 0) {
        continue;
      }
      socket.send(
        JSON.stringify({
          event: "callback",
          result: {
            data,
            listeners,
          },
        }),
      );
    }
  }

  private emitTrackClipUpdates(): void {
    const clip = this.snapshot.tracks[0].clipSlots[0].clip;
    const path = this.clipPath(0, 0);
    this.emitProperty(path, "name", clip.name);
    this.emitProperty(path, "color", clip.color);
    this.emitProperty(path, "length", clip.length);
    this.emitProperty(path, "loop_start", clip.loopStart);
    this.emitProperty(path, "loop_end", clip.loopEnd);
    this.emitProperty(path, "looping", clip.looping);
    this.emitProperty(path, "playing_position", clip.playingPosition);
  }

  private emitTrackUpdates(): void {
    const track = this.snapshot.tracks[0];
    const path = "live_set tracks 0";
    this.emitProperty(path, "name", track.name);
    this.emitProperty(path, "color", track.color);
    this.emitProperty(path, "playing_slot_index", track.playingSlotIndex);
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    const parsed = JSON.parse(raw) as WireMessage;
    const action = parsed.action;
    const args = parsed.args ?? {};
    const path = parsed.path ?? "";
    const uuid = parsed.uuid ?? "";

    const ok = (result: unknown): void => {
      socket.send(
        JSON.stringify({
          event: "success",
          result,
          uuid,
        }),
      );
    };

    if (action === "observe") {
      const eventId = toWireString(args.eventId);
      const property = toWireString(args.property);
      const refs = this.observers.get(socket);
      refs?.push({ eventId, path, property });
      ok(eventId);
      this.emitProperty(path, property, this.resolveGet(path, property));
      return;
    }

    if (action === "removeObserver") {
      const eventId = toWireString(args.eventId);
      const refs = this.observers.get(socket) ?? [];
      this.observers.set(
        socket,
        refs.filter((ref) => ref.eventId !== eventId),
      );
      ok(null);
      return;
    }

    if (action === "get") {
      const property = toWireString(args.prop);
      ok(this.resolveGet(path, property));
      return;
    }

    if (action === "children") {
      const child = toWireString(args.child);
      const index = toOptionalNumber(args.index);
      ok(this.resolveChildren(path, child, index));
      return;
    }

    if (action === "set" || action === "call" || action === "callMultiple") {
      ok(null);
      return;
    }

    socket.send(
      JSON.stringify({
        event: "error",
        result: `Unsupported action: ${String(action)}`,
        uuid,
      }),
    );
  }

  private resolveChildren(
    path: string,
    child: string,
    index?: number,
  ): unknown[] {
    if (path === "live_set" && child === "tracks") {
      const raws = this.snapshot.tracks.map((track, trackIndex) => {
        return {
          has_audio_input: track.hasAudioInput,
          id: String(track.id),
          name: track.name,
          path: `live_set tracks ${String(trackIndex)}`,
        };
      });
      return index === undefined ? raws : raws.slice(index, index + 1);
    }

    if (path === "live_set" && child === "scenes") {
      const raws = this.snapshot.scenes.map((scene, sceneIndex) => {
        return {
          id: String(scene.id),
          isEmpty: false,
          name: scene.name,
          path: `live_set scenes ${String(sceneIndex)}`,
        };
      });
      return index === undefined ? raws : raws.slice(index, index + 1);
    }

    const trackMatch = /live_set tracks (\d+)/u.exec(path);
    if (trackMatch && child === "clip_slots") {
      const trackIndex = Number.parseInt(trackMatch[1], 10);
      const track = this.snapshot.tracks.at(trackIndex);
      if (!track) {
        return [];
      }
      const raws = track.clipSlots.map((slot, slotIndex) => {
        return {
          clip: this.toRawClip(slot.clip, trackIndex, slotIndex),
          has_clip: slot.hasClip,
          id: slot.id,
          path: this.clipSlotPath(trackIndex, slotIndex),
        };
      });
      return index === undefined ? raws : raws.slice(index, index + 1);
    }

    const clipSlotMatch = /live_set tracks (\d+) clip_slots (\d+)/u.exec(path);
    if (clipSlotMatch && child === "clip") {
      const trackIndex = Number.parseInt(clipSlotMatch[1], 10);
      const slotIndex = Number.parseInt(clipSlotMatch[2], 10);
      const slot = this.snapshot.tracks.at(trackIndex)?.clipSlots.at(slotIndex);
      if (!slot?.hasClip) {
        return [
          { id: "0", is_audio_clip: false, length: 0, name: "", path: "" },
        ];
      }
      return [this.toRawClip(slot.clip, trackIndex, slotIndex)];
    }

    return [];
  }

  private resolveGet(path: string, property: string): unknown {
    if (path === "live_set view" && property === "selected_track") {
      return this.snapshot.selectedTrackId;
    }

    if (path === "live_set") {
      if (property === "signature_numerator") {
        return this.snapshot.song.signatureNumerator;
      }
      if (property === "signature_denominator") {
        return this.snapshot.song.signatureDenominator;
      }
      if (property === "is_playing") {
        return this.snapshot.song.isPlaying;
      }
      if (property === "current_song_time") {
        return this.snapshot.song.currentSongTime;
      }
    }

    const trackMatch = /live_set tracks (\d+)$/u.exec(path);
    if (trackMatch) {
      const trackIndex = Number.parseInt(trackMatch[1], 10);
      const track = this.snapshot.tracks.at(trackIndex);
      if (!track) {
        return null;
      }

      if (property === "name") {
        return track.name;
      }
      if (property === "color") {
        return track.color;
      }
      if (property === "playing_slot_index") {
        return track.playingSlotIndex;
      }
    }

    const sceneMatch = /live_set scenes (\d+)/u.exec(path);
    if (sceneMatch) {
      const sceneIndex = Number.parseInt(sceneMatch[1], 10);
      const scene = this.snapshot.scenes.at(sceneIndex);
      if (!scene) {
        return null;
      }

      if (property === "name") {
        return scene.name;
      }
      if (property === "color") {
        return scene.color;
      }
    }

    const clipSlotMatch = /live_set tracks (\d+) clip_slots (\d+)$/u.exec(path);
    if (clipSlotMatch && property === "has_clip") {
      const trackIndex = Number.parseInt(clipSlotMatch[1], 10);
      const slotIndex = Number.parseInt(clipSlotMatch[2], 10);
      return (
        this.snapshot.tracks.at(trackIndex)?.clipSlots.at(slotIndex)?.hasClip ??
        false
      );
    }

    const clipMatch = /live_set tracks (\d+) clip_slots (\d+) clip$/u.exec(
      path,
    );
    if (clipMatch) {
      const trackIndex = Number.parseInt(clipMatch[1], 10);
      const slotIndex = Number.parseInt(clipMatch[2], 10);
      const clip = this.snapshot.tracks
        .at(trackIndex)
        ?.clipSlots.at(slotIndex)?.clip;
      if (!clip) {
        return null;
      }

      if (property === "name") {
        return clip.name;
      }
      if (property === "color") {
        return clip.color;
      }
      if (property === "length") {
        return clip.length;
      }
      if (property === "loop_start") {
        return clip.loopStart;
      }
      if (property === "loop_end") {
        return clip.loopEnd;
      }
      if (property === "looping") {
        return clip.looping;
      }
      if (property === "playing_position") {
        return clip.playingPosition;
      }
    }

    return null;
  }

  private async startInternal(): Promise<void> {
    this.wss = new WebSocketServer({
      host: "127.0.0.1",
      path: "/ableton-live",
      port: 0,
    });

    this.wss.on("connection", (socket) => {
      this.clients.add(socket);
      this.observers.set(socket, []);

      socket.on("close", () => {
        this.clients.delete(socket);
        this.observers.delete(socket);
      });

      socket.on("message", (payload) => {
        const raw = toUtf8String(payload);
        this.handleMessage(socket, raw);
      });
    });

    await wait(50);

    this.tickTimer = setInterval(() => {
      if (!this.snapshot.song.isPlaying) {
        return;
      }

      this.snapshot.song.currentSongTime += 0.25;
      const track = this.snapshot.tracks[0];
      const activeSlot = track.playingSlotIndex;
      const clip = track.clipSlots.at(activeSlot)?.clip;
      if (clip) {
        clip.playingPosition = Math.min(
          clip.playingPosition + 0.25,
          Math.max(clip.length, clip.loopEnd),
        );
      }

      this.emitProperty(
        "live_set",
        "current_song_time",
        this.snapshot.song.currentSongTime,
      );
      this.emitProperty(
        "live_set tracks 0 clip_slots 0 clip",
        "playing_position",
        this.snapshot.tracks[0].clipSlots[0].clip.playingPosition,
      );
    }, 120);
  }

  private toRawClip(
    clip: ClipState,
    trackIndex: number,
    slotIndex: number,
  ): Record<string, boolean | number | string> {
    return {
      id: String(200 + slotIndex + trackIndex),
      is_audio_clip: false,
      length: clip.length,
      name: clip.name,
      path: this.clipPath(trackIndex, slotIndex),
    };
  }
}

/**
 * Converts a dynamic wire value to a numeric index when possible.
 * @param value - Raw argument value from the websocket payload.
 * @returns A finite number, or `undefined` if parsing fails.
 */
function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Decodes websocket raw payload bytes into UTF-8 text.
 * @param payload - Raw payload from the ws message callback.
 * @returns UTF-8 decoded string payload.
 */
function toUtf8String(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }
  if (Array.isArray(payload)) {
    const buffers = payload.map((part) => {
      return Buffer.isBuffer(part) ? part : Buffer.from(part);
    });
    return Buffer.concat(buffers).toString("utf8");
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString("utf8");
  }
  return "";
}

/**
 * Normalizes a websocket wire field to a string.
 * @param value - Raw wire value.
 * @returns String value for primitive inputs, otherwise an empty string.
 */
function toWireString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
