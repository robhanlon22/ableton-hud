import { setTimeout as wait } from "node:timers/promises";
import { type WebSocket, WebSocketServer } from "ws";

import { resolveChildren, resolveGet } from "./fake-ableton-live-resolver";
import {
  buildClipPath,
  ClipState,
  DEFAULT_SNAPSHOT,
  FakeLiveSnapshot,
  ObserverReference,
  parseWireMessage,
  SceneState,
  SongState,
  StartFakeServerOptions,
  toOptionalNumber,
  toUtf8String,
  toWireString,
  TrackState,
} from "./fake-ableton-live-support";

const STABILIZE_DELAY_MS = 200;
const SERVER_READY_DELAY_MS = 50;
const PLAYBACK_TICK_INTERVAL_MS = 120;
const PLAYBACK_TICK_BEATS = 0.25;
const TRACK_INDEX = 0;
const SLOT_INDEX = 0;

interface ParsedWireMessage {
  action: string | undefined;
  arguments_: Record<string, unknown>;
  path: string;
  uuid: string;
}

export class FakeAbletonLiveServer {
  get port(): number {
    const webSocketServer = this.wss;
    if (!webSocketServer) {
      throw new Error("Fake server has not started.");
    }
    const address = webSocketServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to resolve fake server address.");
    }
    return address.port;
  }

  private clients = new Set<WebSocket>();
  private readonly observers = new Map<WebSocket, ObserverReference[]>();
  private readonly snapshot: FakeLiveSnapshot =
    structuredClone(DEFAULT_SNAPSHOT);
  private tickTimer?: NodeJS.Timeout;
  private wss?: WebSocketServer;

  static async start(
    options: StartFakeServerOptions = {},
  ): Promise<FakeAbletonLiveServer> {
    const instance = new FakeAbletonLiveServer();
    await instance.startInternal(options);
    return instance;
  }

  crashConnections(): void {
    for (const client of this.clients) {
      client.terminate();
    }
    this.clients.clear();
    this.observers.clear();
  }

  setClip(next: Partial<ClipState>): void {
    const clip = this.snapshot.tracks[TRACK_INDEX].clipSlots[SLOT_INDEX].clip;
    Object.assign(clip, next);
    this.emitTrackClipUpdates();
  }

  setScene(next: Partial<SceneState>): void {
    Object.assign(this.snapshot.scenes[TRACK_INDEX], next);
    this.emitSceneUpdates();
  }

  setSong(next: Partial<SongState>): void {
    Object.assign(this.snapshot.song, next);
    this.emitSongUpdates();
  }

  setTrack(next: Partial<TrackState>): void {
    const track = this.snapshot.tracks[TRACK_INDEX];
    Object.assign(track, next);
    this.emitTrackUpdates();
  }

  async stabilize(): Promise<void> {
    await wait(STABILIZE_DELAY_MS);
  }

  async stop(): Promise<void> {
    this.stopTicking();
    this.closeClients();

    const webSocketServer = this.wss;
    if (!webSocketServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      webSocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.wss = undefined;
  }

  private advancePlayback(): void {
    if (!this.snapshot.song.isPlaying) {
      return;
    }

    this.snapshot.song.currentSongTime += PLAYBACK_TICK_BEATS;
    const track = this.snapshot.tracks[TRACK_INDEX];
    const clip = track.clipSlots.at(track.playingSlotIndex)?.clip;
    if (clip) {
      clip.playingPosition = Math.min(
        clip.playingPosition + PLAYBACK_TICK_BEATS,
        Math.max(clip.length, clip.loopEnd),
      );
    }

    this.emitProperty(
      "live_set",
      "current_song_time",
      this.snapshot.song.currentSongTime,
    );
    this.emitProperty(
      buildClipPath(TRACK_INDEX, SLOT_INDEX),
      "playing_position",
      this.snapshot.tracks[TRACK_INDEX].clipSlots[SLOT_INDEX].clip
        .playingPosition,
    );
  }

  private closeClients(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.observers.clear();
  }

  private dispatchAction(
    socket: WebSocket,
    message: ParsedWireMessage,
  ): boolean {
    const { action, arguments_: arguments_, path, uuid } = message;
    if (action === "call" || action === "callMultiple" || action === "set") {
      this.sendSuccess(socket, uuid);
      return true;
    }

    if (action === "children") {
      this.handleChildren(socket, path, arguments_, uuid);
      return true;
    }

    if (action === "get") {
      this.handleGet(socket, path, arguments_, uuid);
      return true;
    }

    if (action === "observe") {
      this.handleObserve(socket, path, arguments_, uuid);
      return true;
    }

    if (action === "removeObserver") {
      this.handleRemoveObserver(socket, arguments_, uuid);
      return true;
    }

    return false;
  }

  private emitProperty(path: string, property: string, data: unknown): void {
    for (const [socket, references] of this.observers.entries()) {
      const listeners = references
        .filter((reference) => {
          return reference.path === path && reference.property === property;
        })
        .map((reference) => reference.eventId);
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

  private emitSceneUpdates(): void {
    const scene = this.snapshot.scenes[TRACK_INDEX];
    const scenePath = "live_set scenes 0";
    this.emitProperty(scenePath, "name", scene.name);
    this.emitProperty(scenePath, "color", scene.color);
  }

  private emitSongUpdates(): void {
    const { song } = this.snapshot;
    this.emitProperty("live_set", "is_playing", song.isPlaying);
    this.emitProperty(
      "live_set",
      "signature_numerator",
      song.signatureNumerator,
    );
    this.emitProperty(
      "live_set",
      "signature_denominator",
      song.signatureDenominator,
    );
    this.emitProperty("live_set", "current_song_time", song.currentSongTime);
  }

  private emitTrackClipUpdates(): void {
    const clip = this.snapshot.tracks[TRACK_INDEX].clipSlots[SLOT_INDEX].clip;
    const clipPath = buildClipPath(TRACK_INDEX, SLOT_INDEX);
    this.emitProperty(clipPath, "name", clip.name);
    this.emitProperty(clipPath, "color", clip.color);
    this.emitProperty(clipPath, "length", clip.length);
    this.emitProperty(clipPath, "loop_start", clip.loopStart);
    this.emitProperty(clipPath, "loop_end", clip.loopEnd);
    this.emitProperty(clipPath, "looping", clip.looping);
    this.emitProperty(clipPath, "playing_position", clip.playingPosition);
  }

  private emitTrackUpdates(): void {
    const track = this.snapshot.tracks[TRACK_INDEX];
    const trackPath = "live_set tracks 0";
    this.emitProperty(trackPath, "name", track.name);
    this.emitProperty(trackPath, "color", track.color);
    this.emitProperty(trackPath, "playing_slot_index", track.playingSlotIndex);
  }

  private handleChildren(
    socket: WebSocket,
    path: string,
    arguments_: Record<string, unknown>,
    uuid: string,
  ): void {
    const child = toWireString(arguments_.child);
    const index = toOptionalNumber(arguments_.index);
    this.sendSuccess(
      socket,
      uuid,
      resolveChildren(this.snapshot, path, child, index),
    );
  }

  private handleGet(
    socket: WebSocket,
    path: string,
    arguments_: Record<string, unknown>,
    uuid: string,
  ): void {
    const property = toWireString(arguments_.prop);
    this.sendSuccess(socket, uuid, resolveGet(this.snapshot, path, property));
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    const {
      action,
      args: arguments_ = {},
      path = "",
      uuid = "",
    } = parseWireMessage(raw);
    const parsedMessage: ParsedWireMessage = {
      action,
      arguments_,
      path,
      uuid,
    };
    if (this.dispatchAction(socket, parsedMessage)) {
      return;
    }

    this.sendError(socket, uuid, parsedMessage.action);
  }

  private handleObserve(
    socket: WebSocket,
    path: string,
    arguments_: Record<string, unknown>,
    uuid: string,
  ): void {
    const eventId = toWireString(arguments_.eventId);
    const property = toWireString(arguments_.property);
    const references = this.observers.get(socket) ?? [];
    references.push({ eventId, path, property });
    this.observers.set(socket, references);
    this.sendSuccess(socket, uuid, eventId);
    this.emitProperty(
      path,
      property,
      resolveGet(this.snapshot, path, property),
    );
  }

  private handleRemoveObserver(
    socket: WebSocket,
    arguments_: Record<string, unknown>,
    uuid: string,
  ): void {
    const eventId = toWireString(arguments_.eventId);
    const references = this.observers.get(socket) ?? [];
    this.observers.set(
      socket,
      references.filter((reference) => reference.eventId !== eventId),
    );
    this.sendSuccess(socket, uuid);
  }

  private sendError(
    socket: WebSocket,
    uuid: string,
    action: string | undefined,
  ): void {
    socket.send(
      JSON.stringify({
        event: "error",
        result: `Unsupported action: ${String(action)}`,
        uuid,
      }),
    );
  }

  private sendSuccess(socket: WebSocket, uuid: string, result?: unknown): void {
    socket.send(
      JSON.stringify({
        event: "success",
        result,
        uuid,
      }),
    );
  }

  private async startInternal(options: StartFakeServerOptions): Promise<void> {
    this.wss = new WebSocketServer({
      host: "127.0.0.1",
      path: "/ableton-live",
      port: options.port ?? 0,
    });

    this.wss.on("connection", (socket) => {
      this.clients.add(socket);
      this.observers.set(socket, []);

      socket.on("close", () => {
        this.clients.delete(socket);
        this.observers.delete(socket);
      });

      socket.on("message", (payload) => {
        this.handleMessage(socket, toUtf8String(payload));
      });
    });

    await wait(SERVER_READY_DELAY_MS);
    this.tickTimer = setInterval(() => {
      this.advancePlayback();
    }, PLAYBACK_TICK_INTERVAL_MS);
  }

  private stopTicking(): void {
    if (!this.tickTimer) {
      return;
    }
    clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }
}
