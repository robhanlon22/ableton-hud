import { vi } from "vitest";

/**
 * Captures the bridge surface observed by main-process tests.
 */
export interface AbletonLiveBridgeLike {
  /** Pushes a HUD state snapshot through the bridge callback. */
  emitState: (state: unknown) => void;
  /** Current counter mode stored on the bridge. */
  readonly mode: string;
  /** Sink that receives emitted HUD state snapshots. */
  readonly onState: (state: unknown) => void;
  /** Mock for changing the bridge mode. */
  readonly setMode: ReturnType<typeof vi.fn>;
  /** Mock for starting the bridge lifecycle. */
  readonly start: ReturnType<typeof vi.fn>;
  /** Mock for stopping the bridge lifecycle. */
  readonly stop: ReturnType<typeof vi.fn>;
  /** Mock for toggling track-lock state. */
  readonly toggleTrackLock: ReturnType<typeof vi.fn>;
  /** Current mocked track-lock state. */
  readonly trackLocked: boolean;
}

/**
 * Constructs mocked bridge instances for main-process tests.
 */
export type AbletonLiveBridgeMockConstructor = new (
  /** Initial mode passed to the bridge constructor. */
  mode: string,
  /** HUD state sink passed to the bridge constructor. */
  onState: (state: unknown) => void,
  /** Initial track-lock flag passed to the bridge constructor. */
  trackLocked: boolean,
) => AbletonLiveBridgeLike;

/**
 * Captures the browser-window surface exercised by main-process tests.
 */
export interface BrowserWindowLike {
  /** Whether the window is currently always-on-top. */
  alwaysOnTop: boolean;
  /** Current tracked window bounds. */
  readonly bounds: StoredWindowBounds;
  /** Whether the window has received a `closed` event. */
  closed: boolean;
  /** Current tracked content size. */
  contentSize: [number, number];
  /** Whether the window has been destroyed. */
  destroyed: boolean;
  /** Emits a window event to registered listeners. */
  emit: (event: string, ...arguments_: unknown[]) => void;
  /** Emits a `webContents` event to registered listeners. */
  emitWebContents: (event: string, ...arguments_: unknown[]) => void;
  /** Registered window listeners keyed by event name. */
  readonly eventListeners: Map<string, Listener[]>;
  /** Returns the current tracked window bounds. */
  getBounds: () => StoredWindowBounds;
  /** Returns the current tracked content size. */
  getContentSize: () => [number, number];
  /** Reports whether the window is always-on-top. */
  isAlwaysOnTop: () => boolean;
  /** Reports whether the window has been destroyed. */
  isDestroyed: () => boolean;
  /** Reports whether the window is visible on all workspaces. */
  isVisibleOnAllWorkspaces: () => boolean;
  /** Mock for `BrowserWindow.loadFile`. */
  readonly loadFile: ReturnType<typeof vi.fn>;
  /** Mock for `BrowserWindow.loadURL`. */
  readonly loadURL: ReturnType<typeof vi.fn>;
  /** Registers a window event listener. */
  on: (event: string, callback: Listener) => void;
  /** Constructor options used to create the window. */
  readonly options: BrowserWindowOptionsValue;
  /** Whether the window is currently resizable. */
  resizable: boolean;
  /** Mock for `BrowserWindow.setAlwaysOnTop`. */
  readonly setAlwaysOnTop: ReturnType<typeof vi.fn>;
  /** Mock for `BrowserWindow.setContentSize`. */
  readonly setContentSize: ReturnType<typeof vi.fn>;
  /** Mock for `BrowserWindow.setPosition`. */
  readonly setPosition: ReturnType<typeof vi.fn>;
  /** Mock for `BrowserWindow.setResizable`. */
  readonly setResizable: ReturnType<typeof vi.fn>;
  /** Mock for `BrowserWindow.setVisibleOnAllWorkspaces`. */
  readonly setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>;
  /** Whether the window is visible on all workspaces. */
  visibleOnAllWorkspaces: boolean;
  /** Mocked `webContents` surface for the window. */
  readonly webContents: WebContentsLike;
}

/**
 * Constructs and tracks mocked browser windows for tests.
 */
export interface BrowserWindowMockConstructor {
  /** Creates a new mocked browser window from the provided options. */
  new (options: BrowserWindowOptionsValue): BrowserWindowLike;
  /** Returns all currently tracked mocked windows. */
  getAllWindows: () => BrowserWindowLike[];
  /** Clears any tracked mocked windows. */
  reset: () => void;
}

/**
 * Stores the subset of `BrowserWindowConstructorOptions` used by tests.
 */
export interface BrowserWindowOptionsValue {
  /** Window height in pixels. */
  height: number;
  /** Whether the new window should be resizable. */
  resizable: boolean;
  /** Window width in pixels. */
  width: number;
  /** Optional initial x-position. */
  x?: number;
  /** Optional initial y-position. */
  y?: number;
}

/**
 * Exposes the full mocked main-process runtime used by app tests.
 */
export interface IndexMainRuntime {
  /** Mock bridge constructor. */
  AbletonLiveBridgeMock: AbletonLiveBridgeMockConstructor;
  /** Mock for `app.commandLine.appendSwitch`. */
  appendSwitchMock: ReturnType<typeof vi.fn>;
  /** Registered app listeners keyed by event name. */
  appListeners: Map<string, Listener[]>;
  /** Mock for `app.on`. */
  appOnMock: ReturnType<typeof vi.fn>;
  /** Mock for `app.quit`. */
  appQuitMock: ReturnType<typeof vi.fn>;
  /** Mock for `app.setPath`. */
  appSetPathMock: ReturnType<typeof vi.fn>;
  /** Mock for `app.whenReady`. */
  appWhenReadyMock: ReturnType<typeof vi.fn>;
  /** Created bridge instances tracked by the runtime. */
  bridgeInstances: AbletonLiveBridgeLike[];
  /** Mock browser-window constructor. */
  BrowserWindowMock: BrowserWindowMockConstructor;
  /** Emits an app event and flushes any async listeners. */
  emitAppEvent: (event: string) => Promise<void>;
  /** Mock for `existsSync`. */
  existsSyncMock: ReturnType<typeof vi.fn>;
  /** Mock for `ipcMain.handle`. */
  ipcHandleMock: ReturnType<typeof vi.fn>;
  /** Registered IPC handlers keyed by channel. */
  ipcHandlers: Map<string, IpcHandler>;
  /** Mock for `ipcMain.removeHandler`. */
  ipcRemoveHandlerMock: ReturnType<typeof vi.fn>;
  /** Mocked Electron native theme surface. */
  nativeTheme: NativeThemeLike;
  /** Mock for loading persisted preferences. */
  prefLoadMock: ReturnType<typeof vi.fn<() => Promise<PrefsValue>>>;
  /** Mock for saving persisted preferences. */
  prefSaveMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
  /** Resets the full mocked runtime back to its initial state. */
  reset: () => void;
  /** Resolves the pending `app.whenReady()` promise. */
  resolveWhenReady: () => Promise<void>;
  /** Tracked browser windows created by the runtime. */
  windows: BrowserWindowLike[];
}

/**
 * Handles an IPC invocation from a mocked renderer or preload surface.
 */
export type IpcHandler = (...arguments_: unknown[]) => unknown;

/**
 * Handles an emitted event in the mocked Electron runtime.
 */
export type Listener = (...arguments_: unknown[]) => void;

/**
 * Captures the subset of Electron `nativeTheme` used by main-process tests.
 */
export interface NativeThemeLike {
  /** Current explicit app theme source. */
  themeSource: "dark" | "light" | "system";
}

/**
 * Captures the persisted preference fixture used by main-process tests.
 */
export interface PrefsValue {
  /** Whether the HUD should be always-on-top. */
  alwaysOnTop: boolean;
  /** Whether the HUD should start in compact mode. */
  compactMode: boolean;
  /** Persisted counter mode. */
  mode: "elapsed" | "remaining";
  /** Whether track-lock should start enabled. */
  trackLocked: boolean;
  /** Optional persisted expanded-window bounds. */
  windowBounds?: StoredWindowBounds;
}

/**
 * Groups the mutable runtime collections shared across test helpers.
 */
export interface RuntimeCollections {
  /** Tracked bridge instances. */
  bridgeInstances: AbletonLiveBridgeLike[];
  /** Tracked browser windows. */
  windows: BrowserWindowLike[];
}

/**
 * Stores the concrete window rectangle used by main-process tests.
 */
export interface StoredWindowBounds {
  /** Window height in pixels. */
  height: number;
  /** Window width in pixels. */
  width: number;
  /** Window x-position in screen coordinates. */
  x: number;
  /** Window y-position in screen coordinates. */
  y: number;
}

/**
 * Captures the mocked `webContents` surface attached to a browser window.
 */
export interface WebContentsLike {
  /** Registered `webContents` listeners keyed by event name. */
  listeners: Map<string, Listener[]>;
  /** Mock for `webContents.on`. */
  on: ReturnType<typeof vi.fn>;
  /** Mock for `webContents.send`. */
  send: ReturnType<typeof vi.fn>;
}
