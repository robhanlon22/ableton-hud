import { setTimeout as wait } from "node:timers/promises";
import { type WebSocket, WebSocketServer } from "ws";

import { resolveChildren, resolveGet } from "./resolver";
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
} from "./support";

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

/**
 * Serves a deterministic fake Ableton Live websocket surface for E2E tests.
 */
export class FakeAbletonLiveServer {
  /**
   * Returns the bound websocket port for the fake server.
   * @returns Listening port for the active websocket server.
   */
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

  /**
   * Starts a fake Ableton Live websocket server for tests.
   * @param options - Server bootstrap options.
   * @returns Started fake server instance.
   */
  static async start(
    options: StartFakeServerOptions = {},
  ): Promise<FakeAbletonLiveServer> {
    const instance = new FakeAbletonLiveServer();
    await instance.startInternal(options);
    return instance;
  }

  /**
   * Abruptly drops every connected websocket client.
   */
  crashConnections(): void {
    for (const client of this.clients) {
      client.terminate();
    }
    this.clients.clear();
    this.observers.clear();
  }

  /**
   * Applies clip overrides and broadcasts the resulting clip updates.
   * @param next - Partial clip state to merge into the active clip.
   */
  setClip(next: Partial<ClipState>): void {
    const clip = this.snapshot.tracks[TRACK_INDEX].clipSlots[SLOT_INDEX].clip;
    Object.assign(clip, next);
    this.emitTrackClipUpdates();
  }

  /**
   * Applies scene overrides and broadcasts the resulting scene updates.
   * @param next - Partial scene state to merge into the active scene.
   */
  setScene(next: Partial<SceneState>): void {
    Object.assign(this.snapshot.scenes[TRACK_INDEX], next);
    this.emitSceneUpdates();
  }

  /**
   * Applies song overrides and broadcasts the resulting song updates.
   * @param next - Partial song state to merge into the fake song.
   */
  setSong(next: Partial<SongState>): void {
    Object.assign(this.snapshot.song, next);
    this.emitSongUpdates();
  }

  /**
   * Applies track overrides and broadcasts the resulting track updates.
   * @param next - Partial track state to merge into the active track.
   */
  setTrack(next: Partial<TrackState>): void {
    const track = this.snapshot.tracks[TRACK_INDEX];
    Object.assign(track, next);
    this.emitTrackUpdates();
  }

  /**
   * Waits for async websocket traffic to settle after a state change.
   */
  async stabilize(): Promise<void> {
    await wait(STABILIZE_DELAY_MS);
  }

  /**
   * Stops playback ticks, closes clients, and shuts down the websocket server.
   */
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

  /**
   * Advances the fake transport clock and emits playback observers.
   */
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

  /**
   * Closes all connected websocket clients and clears observer state.
   */
  private closeClients(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.observers.clear();
  }

  /**
   * Dispatches a parsed websocket action to the matching handler.
   * @param socket - Client socket that sent the request.
   * @param message - Parsed websocket request payload.
   * @returns Whether the action was handled.
   */
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

  /**
   * Emits a property-change callback to matching observers.
   * @param path - Observed Live object path.
   * @param property - Observed property name.
   * @param data - Serialized callback payload data.
   */
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

  /**
   * Broadcasts scene observer updates for the active scene.
   */
  private emitSceneUpdates(): void {
    const scene = this.snapshot.scenes[TRACK_INDEX];
    const scenePath = "live_set scenes 0";
    this.emitProperty(scenePath, "name", scene.name);
    this.emitProperty(scenePath, "color", scene.color);
  }

  /**
   * Broadcasts song observer updates for the fake transport.
   */
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

  /**
   * Broadcasts clip observer updates for the active clip.
   */
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

  /**
   * Broadcasts track observer updates for the active track.
   */
  private emitTrackUpdates(): void {
    const track = this.snapshot.tracks[TRACK_INDEX];
    const trackPath = "live_set tracks 0";
    this.emitProperty(trackPath, "name", track.name);
    this.emitProperty(trackPath, "color", track.color);
    this.emitProperty(trackPath, "playing_slot_index", track.playingSlotIndex);
  }

  /**
   * Handles a `children` websocket request.
   * @param socket - Client socket that sent the request.
   * @param path - Requested Live object path.
   * @param arguments_ - Raw request arguments.
   * @param uuid - Request correlation id.
   */
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

  /**
   * Handles a `get` websocket request.
   * @param socket - Client socket that sent the request.
   * @param path - Requested Live object path.
   * @param arguments_ - Raw request arguments.
   * @param uuid - Request correlation id.
   */
  private handleGet(
    socket: WebSocket,
    path: string,
    arguments_: Record<string, unknown>,
    uuid: string,
  ): void {
    const property = toWireString(arguments_.prop);
    this.sendSuccess(socket, uuid, resolveGet(this.snapshot, path, property));
  }

  /**
   * Parses and routes a raw websocket message from a client.
   * @param socket - Client socket that sent the request.
   * @param raw - Raw websocket payload string.
   */
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

  /**
   * Handles an `observe` websocket request.
   * @param socket - Client socket that sent the request.
   * @param path - Requested Live object path.
   * @param arguments_ - Raw request arguments.
   * @param uuid - Request correlation id.
   */
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

  /**
   * Handles a `removeObserver` websocket request.
   * @param socket - Client socket that sent the request.
   * @param arguments_ - Raw request arguments.
   * @param uuid - Request correlation id.
   */
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

  /**
   * Sends an unsupported-action error response to the client.
   * @param socket - Client socket to reply to.
   * @param uuid - Request correlation id.
   * @param action - Unsupported action name.
   */
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

  /**
   * Sends a success response to the client.
   * @param socket - Client socket to reply to.
   * @param uuid - Request correlation id.
   * @param result - Optional serialized response payload.
   */
  private sendSuccess(socket: WebSocket, uuid: string, result?: unknown): void {
    socket.send(
      JSON.stringify({
        event: "success",
        result,
        uuid,
      }),
    );
  }

  /**
   * Starts the websocket server and playback tick loop.
   * @param options - Server bootstrap options.
   */
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

  /**
   * Stops the fake playback tick loop when it is running.
   */
  private stopTicking(): void {
    if (!this.tickTimer) {
      return;
    }
    clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }
}
