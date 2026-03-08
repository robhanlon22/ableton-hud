import { vi } from "vitest";

export interface AbletonLiveBridgeLike {
  emitState: (state: unknown) => void;
  readonly mode: string;
  readonly onState: (state: unknown) => void;
  readonly setMode: ReturnType<typeof vi.fn>;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly toggleTrackLock: ReturnType<typeof vi.fn>;
  readonly trackLocked: boolean;
}

export type AbletonLiveBridgeMockConstructor = new (
  mode: string,
  onState: (state: unknown) => void,
  trackLocked: boolean,
) => AbletonLiveBridgeLike;

export interface BrowserWindowLike {
  alwaysOnTop: boolean;
  readonly bounds: StoredWindowBounds;
  closed: boolean;
  contentSize: [number, number];
  destroyed: boolean;
  emit: (event: string, ...arguments_: unknown[]) => void;
  emitWebContents: (event: string, ...arguments_: unknown[]) => void;
  readonly eventListeners: Map<string, Listener[]>;
  getBounds: () => StoredWindowBounds;
  getContentSize: () => [number, number];
  isAlwaysOnTop: () => boolean;
  isDestroyed: () => boolean;
  isVisibleOnAllWorkspaces: () => boolean;
  readonly loadFile: ReturnType<typeof vi.fn>;
  readonly loadURL: ReturnType<typeof vi.fn>;
  on: (event: string, callback: Listener) => void;
  readonly options: BrowserWindowOptionsValue;
  resizable: boolean;
  readonly setAlwaysOnTop: ReturnType<typeof vi.fn>;
  readonly setContentSize: ReturnType<typeof vi.fn>;
  readonly setPosition: ReturnType<typeof vi.fn>;
  readonly setResizable: ReturnType<typeof vi.fn>;
  readonly setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>;
  visibleOnAllWorkspaces: boolean;
  readonly webContents: {
    listeners: Map<string, Listener[]>;
    on: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

export interface BrowserWindowMockConstructor {
  new (options: BrowserWindowOptionsValue): BrowserWindowLike;
  getAllWindows: () => BrowserWindowLike[];
  reset: () => void;
}

export interface BrowserWindowOptionsValue {
  height: number;
  resizable: boolean;
  width: number;
  x?: number;
  y?: number;
}

export interface IndexMainRuntime {
  AbletonLiveBridgeMock: AbletonLiveBridgeMockConstructor;
  appendSwitchMock: ReturnType<typeof vi.fn>;
  appListeners: Map<string, Listener[]>;
  appOnMock: ReturnType<typeof vi.fn>;
  appQuitMock: ReturnType<typeof vi.fn>;
  appWhenReadyMock: ReturnType<typeof vi.fn>;
  bridgeInstances: AbletonLiveBridgeLike[];
  BrowserWindowMock: BrowserWindowMockConstructor;
  emitAppEvent: (event: string) => Promise<void>;
  existsSyncMock: ReturnType<typeof vi.fn>;
  ipcHandleMock: ReturnType<typeof vi.fn>;
  ipcHandlers: Map<string, IpcHandler>;
  ipcRemoveHandlerMock: ReturnType<typeof vi.fn>;
  prefLoadMock: ReturnType<typeof vi.fn<() => Promise<PrefsValue>>>;
  prefSaveMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
  reset: () => void;
  resolveWhenReady: () => Promise<void>;
  windows: BrowserWindowLike[];
}

export type IpcHandler = (...arguments_: unknown[]) => unknown;
export type Listener = (...arguments_: unknown[]) => void;

export interface PrefsValue {
  alwaysOnTop: boolean;
  compactMode: boolean;
  mode: "elapsed" | "remaining";
  trackLocked: boolean;
  windowBounds?: StoredWindowBounds;
}

export interface RuntimeCollections {
  bridgeInstances: AbletonLiveBridgeLike[];
  windows: BrowserWindowLike[];
}

export interface StoredWindowBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}
