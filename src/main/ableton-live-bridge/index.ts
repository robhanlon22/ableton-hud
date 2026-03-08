import type { HudMode, HudState } from "@shared/types";

import WebSocket from "ws";

import type { BridgeDeps } from "./types";

import { LiveBridgeAccess } from "./live-access";
import {
  defaultLiveFactory,
  defaultPayloadNormalizers,
  resolveLivePort,
} from "./normalizers";
import { BridgeSession } from "./session";
import { DEFAULT_LIVE_HOST } from "./types";

export {
  defaultLiveFactory,
  defaultPayloadNormalizers,
  parseTrackIndexFromPath,
  resolveLivePort,
  toBoolean,
  toColorValue,
  toNumber,
  toSceneColorValue,
  toStringValue,
} from "./normalizers";
export type {
  BridgeDeps,
  ClipProperty,
  LiveClient,
  LiveClip,
  LiveClipSlot,
  LiveFactory,
  LiveScene,
  LiveSong,
  LiveSongView,
  LiveTrack,
  PayloadNormalizers,
  SceneProperty,
  SongProperty,
  TrackProperty,
} from "./types";

/**
 * WebSocket constructor shape accepted by the bridge in browser and Node runtimes.
 */
type RuntimeWebSocketCtor = typeof globalThis.WebSocket | typeof WebSocket;

/**
 * Mutable global runtime fields needed to install a WebSocket shim in tests and Node.
 */
interface WebSocketRuntime {
  /**
   * WebSocket constructor exposed by the current runtime, when present.
   */
  WebSocket?: RuntimeWebSocketCtor;
}

/**
 * Public Ableton Live bridge shell that wires dependencies and forwards lifecycle calls.
 */
export class AbletonLiveBridge {
  readonly access: LiveBridgeAccess;

  private readonly session: BridgeSession;

  /**
   * Builds the public bridge facade around the internal Live session runtime.
   * @param mode - Initial counter mode.
   * @param onState - HUD state sink.
   * @param trackLocked - Whether track selection starts locked.
   * @param deps - Optional dependency overrides for tests.
   */
  constructor(
    mode: HudMode,
    onState: (state: HudState) => void,
    trackLocked = false,
    deps: BridgeDeps = {},
  ) {
    const host =
      deps.hostOverride ?? process.env.AOSC_LIVE_HOST ?? DEFAULT_LIVE_HOST;
    const port = resolveLivePort(
      deps.portOverride ?? process.env.AOSC_LIVE_PORT,
    );
    const websocketCtor = deps.websocketCtor ?? WebSocket;
    if (!Object.hasOwn(globalThis, "WebSocket")) {
      installGlobalWebSocket(globalThis, websocketCtor);
    }

    const normalizers = {
      ...defaultPayloadNormalizers,
      ...deps.normalizers,
    };
    const live = (deps.liveFactory ?? defaultLiveFactory).create({
      host,
      port,
    });
    const access = new LiveBridgeAccess(live.song, live.songView, normalizers);

    this.access = access;
    this.session = new BridgeSession({
      access,
      live,
      mode,
      normalizers,
      onState,
      trackLocked,
    });

    live.on("connect", this.session.handleConnect);
    live.on("disconnect", this.session.handleDisconnect);
  }

  /**
   * Updates the HUD mode.
   * @param mode - The next HUD mode.
   */
  setMode(mode: HudMode): void {
    this.session.setMode(mode);
  }

  /**
   * Updates track-lock state.
   * @param trackLocked - Whether track selection should stay locked.
   */
  setTrackLocked(trackLocked: boolean): void {
    this.session.setTrackLocked(trackLocked);
  }

  /**
   * Starts the bridge connection lifecycle.
   */
  start(): void {
    this.session.start();
  }

  /**
   * Stops the bridge and tears down active subscriptions.
   */
  stop(): void {
    this.session.stop();
  }

  /**
   * Toggles track lock and returns the new state.
   * @returns Whether track lock is enabled after toggling.
   */
  toggleTrackLock(): boolean {
    return this.session.toggleTrackLock();
  }
}

/**
 * Installs a WebSocket constructor on the global runtime when the host lacks one.
 * @param runtime - Global runtime object that may expose WebSocket.
 * @param websocketCtor - WebSocket constructor to install.
 */
function installGlobalWebSocket(
  runtime: WebSocketRuntime,
  websocketCtor: RuntimeWebSocketCtor,
): void {
  runtime.WebSocket = websocketCtor;
}
