import type {
  LiveClip,
  LiveClipSlot,
  LiveScene,
  LiveSong,
  LiveSongView,
  LiveTrack,
} from "@main/ableton-live-bridge";
import type {
  BridgeOverrides,
  BridgeSessionTestContext,
  BridgeTestContext,
  Cleanup,
  LiveHarness,
} from "@main/ableton-live-bridge/__tests__/test-types";
import type { HudState } from "@shared/types";

import { vi } from "vitest";

let activeHarness: LiveHarness | undefined;

/**
 * Returns an explicit `undefined` value for noop test doubles.
 * @returns An undefined payload.
 */
const noop = (): undefined => undefined;

/**
 * Describes the host and port passed to the mocked Live client constructor.
 */
interface LiveClientOptions {
  /** Live websocket host. */
  host: string;
  /** Live websocket port. */
  port: number;
}

/**
 * Describes a runtime that may expose a mutable `WebSocket` shim.
 */
interface WebSocketRuntime {
  /** Optional runtime WebSocket constructor shim. */
  WebSocket?: typeof WebSocket;
}

export const wsCtorMock = vi.fn(noop);

const abletonLiveCtorMock = vi.fn((options: LiveClientOptions) => {
  if (activeHarness === undefined) {
    throw new Error("Expected an active Live harness.");
  }

  activeHarness.options = options;
  return activeHarness.instance;
});

/**
 * Mocks the `ableton-live` constructor while preserving `new` semantics in tests.
 * @param options - Host and port options passed to the client constructor.
 * @returns The active mocked Live harness instance.
 */
function createAbletonLiveMock(
  this: unknown,
  options: LiveClientOptions,
): ReturnType<typeof abletonLiveCtorMock> {
  return abletonLiveCtorMock(options);
}

const abletonLiveMock = vi.fn(createAbletonLiveMock);

vi.mock("ws", () => ({ default: wsCtorMock }));
vi.mock("ableton-live", () => ({ AbletonLive: abletonLiveMock }));

/**
 * Creates a public bridge instance with optional environment overrides.
 * @param overrides - Optional host, port, and websocket overrides.
 * @returns A public bridge shell, its active harness, and HUD state spy.
 */
export async function createBridge(
  overrides?: BridgeOverrides,
): Promise<BridgeTestContext> {
  const runtime = await createRuntimeHarness(overrides);
  const BridgeConstructor = runtime.bridgeModule.AbletonLiveBridge;
  if (typeof BridgeConstructor !== "function") {
    throw new TypeError("Expected AbletonLiveBridge constructor export.");
  }

  return {
    bridge: new BridgeConstructor("elapsed", runtime.onState, false),
    harness: runtime.harness,
    onState: runtime.onState,
  };
}

/**
 * Creates a cleanup spy that returns `undefined`.
 * @returns A cleanup spy suitable for observer registration.
 */
export function createCleanupMock(): ReturnType<typeof vi.fn<Cleanup>> {
  return vi.fn(noop);
}

/**
 * Creates a default mocked Live harness.
 * @returns A harness with tracked event handlers and mocked endpoints.
 */
export function createHarness(): LiveHarness {
  const eventHandlers = new Map<string, () => void>();
  const song: LiveSong = {
    child: vi.fn(resolvedUndefined),
    children: vi.fn(() => resolved([])),
    get: vi.fn(resolvedUndefined),
    observe: vi.fn(resolvedUndefined),
  };
  const songView: LiveSongView = {
    get: vi.fn(resolvedUndefined),
    observe: vi.fn(resolvedUndefined),
  };

  return {
    eventHandlers,
    instance: {
      connect: vi.fn(() => resolved()),
      disconnect: vi.fn(noop),
      on: vi.fn((event: string, callback: () => void) => {
        eventHandlers.set(event, callback);
      }),
      song,
      songView,
    },
    options: undefined,
  };
}

/**
 * Creates a default `LiveClip` test double.
 * @param overrides - Optional method overrides.
 * @returns A clip surface with fallback no-op methods.
 */
export function createLiveClip(overrides: Partial<LiveClip> = {}): LiveClip {
  const clipSurface: Pick<LiveClip, "get" | "observe"> = {
    get: vi.fn(resolvedUndefined),
    observe: vi.fn(resolvedUndefined),
  };
  return {
    ...clipSurface,
    ...overrides,
  };
}

/**
 * Creates a default `LiveClipSlot` test double.
 * @param overrides - Optional method overrides.
 * @returns A clip-slot surface with fallback no-op methods.
 */
export function createLiveClipSlot(
  overrides: Partial<LiveClipSlot> = {},
): LiveClipSlot {
  return {
    clip: vi.fn(resolvedUndefined),
    get: vi.fn(resolvedUndefined),
    ...overrides,
  };
}

/**
 * Creates a default `LiveScene` test double.
 * @param overrides - Optional method overrides.
 * @returns A scene surface with fallback no-op methods.
 */
export function createLiveScene(overrides: Partial<LiveScene> = {}): LiveScene {
  const get = overrides.get ?? vi.fn(resolvedUndefined);
  const observe = overrides.observe ?? vi.fn(resolvedUndefined);

  return {
    get,
    observe,
  };
}

/**
 * Creates a default `LiveTrack` test double.
 * @param overrides - Optional method or metadata overrides.
 * @returns A track surface with fallback no-op methods.
 */
export function createLiveTrack(overrides: Partial<LiveTrack> = {}): LiveTrack {
  return {
    child: vi.fn(resolvedUndefined),
    get: vi.fn(resolvedUndefined),
    observe: vi.fn(resolvedUndefined),
    ...overrides,
  };
}

/**
 * Creates an internal bridge session with optional environment overrides.
 * @param overrides - Optional host, port, and websocket overrides.
 * @returns A bridge session, its active harness, and HUD state spy.
 */
export async function createSession(
  overrides?: BridgeOverrides,
): Promise<BridgeSessionTestContext> {
  const runtime = await createRuntimeHarness(overrides);
  const normalizers = {
    ...runtime.bridgeModule.defaultPayloadNormalizers,
  };
  const host =
    process.env.AOSC_LIVE_HOST ?? runtime.typesModule.DEFAULT_LIVE_HOST;
  const port = runtime.bridgeModule.resolveLivePort(process.env.AOSC_LIVE_PORT);
  const live = runtime.bridgeModule.defaultLiveFactory.create({ host, port });
  const access = new runtime.accessModule.LiveBridgeAccess(
    live.song,
    live.songView,
    normalizers,
  );

  return {
    harness: runtime.harness,
    onState: runtime.onState,
    session: new runtime.sessionModule.BridgeSession({
      access,
      live,
      mode: "elapsed",
      normalizers,
      onState: runtime.onState,
      trackLocked: false,
    }),
  };
}

/**
 * Waits for queued microtasks to settle.
 * @returns A promise that resolves after two microtask ticks.
 */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Creates a rejected promise with the provided error.
 * @param error - The error to reject with.
 * @returns A rejected promise.
 */
export function rejected(error: Error): Promise<never> {
  return Promise.reject(error);
}

/**
 * Resets mocks, globals, and environment variables between bridge tests.
 */
export function resetBridgeTestEnvironment(): void {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.AOSC_LIVE_HOST;
  delete process.env.AOSC_LIVE_PORT;
  activeHarness = undefined;
}

/**
 * Resolves a value into a settled promise without changing its type.
 * @returns A resolved promise containing `undefined`.
 */
export function resolved(): Promise<undefined>;
/**
 * Resolves a value into a settled promise without changing its type.
 * @param value - The value to resolve.
 * @returns A resolved promise containing the provided value.
 */
export function resolved<T>(value: T): Promise<T>;
export function resolved<T>(value?: T): Promise<T | undefined> {
  return Promise.resolve(value);
}

/**
 * Resolves a registered Live client event handler.
 * @param harness - The active test harness.
 * @param event - The event name to resolve.
 * @returns The registered callback.
 */
export function resolveHarnessEventHandler(
  harness: LiveHarness,
  event: string,
): () => void {
  const eventHandler = harness.eventHandlers.get(event);
  if (eventHandler === undefined) {
    throw new Error(`Expected a registered Live event handler for "${event}".`);
  }

  return eventHandler;
}

/**
 * Removes the runtime `WebSocket` shim for tests that need it absent.
 * @param runtime - Runtime whose `WebSocket` property should be cleared.
 */
function clearRuntimeWebSocket(runtime: WebSocketRuntime): void {
  delete runtime.WebSocket;
}

/**
 * Creates a shared runtime harness for bridge and session tests.
 * @param overrides - Optional host, port, and websocket overrides.
 * @returns Imported bridge modules plus the active harness and HUD state spy.
 */
async function createRuntimeHarness(overrides?: BridgeOverrides): Promise<{
  /**
   *
   */
  accessModule: typeof import("@main/ableton-live-bridge/live-access");
  /**
   *
   */
  bridgeModule: typeof import("@main/ableton-live-bridge");
  /**
   *
   */
  harness: LiveHarness;
  /**
   *
   */
  onState: ReturnType<typeof vi.fn<(state: HudState) => void>>;
  /**
   *
   */
  sessionModule: typeof import("@main/ableton-live-bridge/session");
  /**
   *
   */
  typesModule: typeof import("@main/ableton-live-bridge/types");
}> {
  vi.resetModules();
  setBridgeEnvironment(overrides);

  const harness = createHarness();
  activeHarness = harness;
  const [bridgeModule, accessModule, sessionModule, typesModule] =
    await Promise.all([
      import("@main/ableton-live-bridge"),
      import("@main/ableton-live-bridge/live-access"),
      import("@main/ableton-live-bridge/session"),
      import("@main/ableton-live-bridge/types"),
    ]);

  return {
    accessModule,
    bridgeModule,
    harness,
    onState: vi.fn<(state: HudState) => void>(),
    sessionModule,
    typesModule,
  };
}

/**
 * Returns a resolved promise that carries no value.
 * @returns A resolved promise with an undefined payload.
 */
function resolvedUndefined(): Promise<undefined> {
  return resolved();
}

/**
 * Assigns environment overrides for the next bridge creation.
 * @param overrides - Optional host, port, and websocket overrides.
 */
function setBridgeEnvironment(overrides: BridgeOverrides | undefined): void {
  if (overrides?.host === undefined) {
    delete process.env.AOSC_LIVE_HOST;
  } else {
    process.env.AOSC_LIVE_HOST = overrides.host;
  }

  if (overrides?.port === undefined) {
    delete process.env.AOSC_LIVE_PORT;
  } else {
    process.env.AOSC_LIVE_PORT = overrides.port;
  }

  if (overrides?.websocketUndefined) {
    clearRuntimeWebSocket(globalThis);
  }
}

export {
  DEFAULT_BRIDGE_PORT,
  DEFAULT_LIVE_HOST,
  RECONNECT_BASE_DELAY_MS as RECONNECT_DELAY_MS,
  RECONNECT_MAX_DELAY_MS as STOP_RECONNECT_DELAY_MS,
} from "@main/ableton-live-bridge/types";
