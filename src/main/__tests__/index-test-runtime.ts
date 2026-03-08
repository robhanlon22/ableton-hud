import { vi } from "vitest";

import type {
  AbletonLiveBridgeLike,
  AbletonLiveBridgeMockConstructor,
  BrowserWindowLike,
  BrowserWindowMockConstructor,
  BrowserWindowOptionsValue,
  IndexMainRuntime,
  IpcHandler,
  Listener,
  PrefsValue,
  RuntimeCollections,
  StoredWindowBounds,
} from "./index-test-types";

const DEFAULT_WINDOW_HEIGHT = 180;
const DEFAULT_WINDOW_WIDTH = 370;
const DEFAULT_WINDOW_X = 10;
const DEFAULT_WINDOW_Y = 20;
const READY_PROMISE_FLUSH_COUNT = 8;

const addListener = (
  listenersByEvent: Map<string, Listener[]>,
  event: string,
  callback: Listener,
): void => {
  const listeners = listenersByEvent.get(event) ?? [];
  listeners.push(callback);
  listenersByEvent.set(event, listeners);
};

const createAppOnHandler =
  (appListeners: Map<string, Listener[]>) =>
  (event: string, callback: Listener): void => {
    addListener(appListeners, event, callback);
  };

const createBridgeToggleTrackLockHandler = (): boolean => true;

const createDefaultPrefsValue = (): PrefsValue => ({
  alwaysOnTop: true,
  compactMode: false,
  mode: "elapsed",
  trackLocked: false,
});

const createExistsSyncHandler = (): boolean => true;

const createIpcHandleHandler =
  (ipcHandlers: Map<string, IpcHandler>) =>
  (channel: string, handler: IpcHandler): void => {
    ipcHandlers.set(channel, handler);
  };

const createIpcRemoveHandler =
  (ipcHandlers: Map<string, IpcHandler>) =>
  (channel: string): void => {
    ipcHandlers.delete(channel);
  };

const createPrefLoadHandler = (): Promise<PrefsValue> =>
  Promise.resolve(createDefaultPrefsValue());

const createResolvedVoidPromise = (): Promise<void> => Promise.resolve();

const createResolveListeners =
  (listenersByEvent: Map<string, Listener[]>) =>
  (event: string): Listener[] =>
    listenersByEvent.get(event) ?? [];

const createSetAlwaysOnTop =
  (windowInstance: BrowserWindowLike) =>
  (enabled: boolean): void => {
    windowInstance.alwaysOnTop = enabled;
  };

const createSetContentSize =
  (windowInstance: BrowserWindowLike) =>
  (width: number, height: number): void => {
    windowInstance.contentSize = [width, height];
    windowInstance.bounds.width = width;
    windowInstance.bounds.height = height;
  };

const createSetPosition =
  (windowInstance: BrowserWindowLike) =>
  (x: number, y: number): void => {
    windowInstance.bounds.x = x;
    windowInstance.bounds.y = y;
  };

const createSetResizable =
  (windowInstance: BrowserWindowLike) =>
  (enabled: boolean): void => {
    windowInstance.resizable = enabled;
  };

const createSetVisibleOnAllWorkspaces =
  (windowInstance: BrowserWindowLike) =>
  (enabled: boolean): void => {
    windowInstance.visibleOnAllWorkspaces = enabled;
  };

const createWebContents = () => {
  const listeners = new Map<string, Listener[]>();

  return {
    listeners,
    on: vi.fn((event: string, callback: Listener) => {
      addListener(listeners, event, callback);
    }),
    send: vi.fn(),
  };
};

const emitMockEvent = (
  listenersByEvent: Map<string, Listener[]>,
  event: string,
  ...arguments_: unknown[]
): void => {
  const resolveListeners = createResolveListeners(listenersByEvent);
  for (const listener of resolveListeners(event)) {
    listener(...arguments_);
  }
};

const initializeBrowserWindow = (
  windowInstance: BrowserWindowLike,
  options: BrowserWindowOptionsValue,
  windows: BrowserWindowLike[],
): void => {
  windowInstance.bounds.width = options.width;
  windowInstance.bounds.height = options.height;
  windowInstance.bounds.x = options.x ?? windowInstance.bounds.x;
  windowInstance.bounds.y = options.y ?? windowInstance.bounds.y;
  windowInstance.resizable = options.resizable;
  windowInstance.contentSize = [
    windowInstance.bounds.width,
    windowInstance.bounds.height,
  ];
  windows.push(windowInstance);
};

const createBrowserWindowMockClass = ({
  windows,
}: RuntimeCollections): BrowserWindowMockConstructor => {
  return class BrowserWindowMock {
    alwaysOnTop = false;
    readonly bounds = {
      height: DEFAULT_WINDOW_HEIGHT,
      width: DEFAULT_WINDOW_WIDTH,
      x: DEFAULT_WINDOW_X,
      y: DEFAULT_WINDOW_Y,
    };
    closed = false;
    contentSize: [number, number] = [
      DEFAULT_WINDOW_WIDTH,
      DEFAULT_WINDOW_HEIGHT,
    ];
    destroyed = false;
    readonly eventListeners = new Map<string, Listener[]>();
    readonly loadFile = vi.fn(createResolvedVoidPromise);
    readonly loadURL = vi.fn(createResolvedVoidPromise);
    readonly options: BrowserWindowOptionsValue;
    resizable = true;
    readonly setAlwaysOnTop: BrowserWindowLike["setAlwaysOnTop"];
    readonly setContentSize: BrowserWindowLike["setContentSize"];
    readonly setPosition: BrowserWindowLike["setPosition"];
    readonly setResizable: BrowserWindowLike["setResizable"];
    readonly setVisibleOnAllWorkspaces: BrowserWindowLike["setVisibleOnAllWorkspaces"];
    visibleOnAllWorkspaces = false;
    readonly webContents = createWebContents();

    constructor(options: BrowserWindowOptionsValue) {
      this.options = options;
      this.setAlwaysOnTop = vi.fn(createSetAlwaysOnTop(this));
      this.setContentSize = vi.fn(createSetContentSize(this));
      this.setPosition = vi.fn(createSetPosition(this));
      this.setResizable = vi.fn(createSetResizable(this));
      this.setVisibleOnAllWorkspaces = vi.fn(
        createSetVisibleOnAllWorkspaces(this),
      );
      initializeBrowserWindow(this, options, windows);
    }

    static getAllWindows(): BrowserWindowLike[] {
      return windows.filter((windowInstance) => !windowInstance.closed);
    }

    static reset(): void {
      windows.length = 0;
    }

    emit(event: string, ...arguments_: unknown[]): void {
      emitMockEvent(this.eventListeners, event, ...arguments_);
    }

    emitWebContents(event: string, ...arguments_: unknown[]): void {
      emitMockEvent(this.webContents.listeners, event, ...arguments_);
    }

    getBounds(): StoredWindowBounds {
      return { ...this.bounds };
    }

    getContentSize(): [number, number] {
      return [this.contentSize[0], this.contentSize[1]];
    }

    isAlwaysOnTop(): boolean {
      return this.alwaysOnTop;
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    isVisibleOnAllWorkspaces(): boolean {
      return this.visibleOnAllWorkspaces;
    }

    on(event: string, callback: Listener): void {
      addListener(this.eventListeners, event, callback);
    }
  };
};

const createAbletonLiveBridgeMockClass = ({
  bridgeInstances,
}: RuntimeCollections): AbletonLiveBridgeMockConstructor => {
  return class AbletonLiveBridgeMock {
    readonly mode: string;
    readonly onState: (state: unknown) => void;
    readonly setMode = vi.fn();
    readonly start = vi.fn();
    readonly stop = vi.fn();
    readonly toggleTrackLock = vi.fn(createBridgeToggleTrackLockHandler);
    readonly trackLocked: boolean;

    constructor(
      mode: string,
      onState: (state: unknown) => void,
      trackLocked: boolean,
    ) {
      this.mode = mode;
      this.onState = onState;
      this.trackLocked = trackLocked;
      bridgeInstances.push(this);
    }

    emitState(state: unknown): void {
      this.onState(state);
    }
  };
};

const createResolveWhenReady = (
  resolveWhenReadyPromise: () => (() => void) | undefined,
): (() => Promise<void>) => {
  return async (): Promise<void> => {
    resolveWhenReadyPromise()?.();
    await Promise.resolve();
    for (let index = 0; index < READY_PROMISE_FLUSH_COUNT; index += 1) {
      await Promise.resolve();
    }
  };
};

const createEmitAppEvent =
  (appListeners: Map<string, Listener[]>) =>
  async (event: string): Promise<void> => {
    const resolveListeners = createResolveListeners(appListeners);
    for (const listener of resolveListeners(event)) {
      listener();
      await Promise.resolve();
    }
    await Promise.resolve();
  };

const createRuntimeReset = ({
  appendSwitchMock,
  appListeners,
  appOnMock,
  appQuitMock,
  appWhenReadyMock,
  bridgeInstances,
  BrowserWindowMock,
  existsSyncMock,
  ipcHandleMock,
  ipcHandlers,
  ipcRemoveHandlerMock,
  prefLoadMock,
  prefSaveMock,
  resetWhenReady,
}: {
  appendSwitchMock: ReturnType<typeof vi.fn>;
  appListeners: Map<string, Listener[]>;
  appOnMock: ReturnType<typeof vi.fn>;
  appQuitMock: ReturnType<typeof vi.fn>;
  appWhenReadyMock: ReturnType<typeof vi.fn>;
  bridgeInstances: AbletonLiveBridgeLike[];
  BrowserWindowMock: BrowserWindowMockConstructor;
  existsSyncMock: ReturnType<typeof vi.fn>;
  ipcHandleMock: ReturnType<typeof vi.fn>;
  ipcHandlers: Map<string, IpcHandler>;
  ipcRemoveHandlerMock: ReturnType<typeof vi.fn>;
  prefLoadMock: ReturnType<typeof vi.fn<() => Promise<PrefsValue>>>;
  prefSaveMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
  resetWhenReady: () => Promise<void>;
}): (() => void) => {
  return (): void => {
    const whenReadyPromise = resetWhenReady();
    appListeners.clear();
    ipcHandlers.clear();
    BrowserWindowMock.reset();
    bridgeInstances.length = 0;
    appendSwitchMock.mockReset();
    appOnMock.mockReset();
    appOnMock.mockImplementation(createAppOnHandler(appListeners));
    appQuitMock.mockReset();
    appWhenReadyMock.mockReset();
    appWhenReadyMock.mockReturnValue(whenReadyPromise);
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
    ipcHandleMock.mockReset();
    ipcHandleMock.mockImplementation(createIpcHandleHandler(ipcHandlers));
    ipcRemoveHandlerMock.mockReset();
    ipcRemoveHandlerMock.mockImplementation(
      createIpcRemoveHandler(ipcHandlers),
    );
    prefLoadMock.mockReset();
    prefSaveMock.mockReset();
    prefLoadMock.mockResolvedValue(createDefaultPrefsValue());
    prefSaveMock.mockImplementation(createResolvedVoidPromise);
  };
};

/**
 * Creates the mocked runtime used by the Electron main-index tests.
 * @returns The runtime state, mocks, and helper methods shared by the tests.
 */
export function createIndexMainRuntime(): IndexMainRuntime {
  const appListeners = new Map<string, Listener[]>();
  const ipcHandlers = new Map<string, IpcHandler>();
  const runtimeCollections: RuntimeCollections = {
    bridgeInstances: [],
    windows: [],
  };
  const BrowserWindowMock = createBrowserWindowMockClass(runtimeCollections);
  const AbletonLiveBridgeMock =
    createAbletonLiveBridgeMockClass(runtimeCollections);
  let whenReadyResolver: (() => void) | undefined;
  let whenReadyPromise = Promise.resolve();

  const appendSwitchMock = vi.fn();
  const appOnMock = vi.fn(createAppOnHandler(appListeners));
  const appQuitMock = vi.fn();
  const appWhenReadyMock = vi.fn(() => whenReadyPromise);
  const existsSyncMock = vi.fn(createExistsSyncHandler);
  const ipcHandleMock = vi.fn(createIpcHandleHandler(ipcHandlers));
  const ipcRemoveHandlerMock = vi.fn(createIpcRemoveHandler(ipcHandlers));
  const prefLoadMock = vi.fn(createPrefLoadHandler);
  const prefSaveMock = vi.fn<() => Promise<void>>(createResolvedVoidPromise);

  const resetWhenReady = (): Promise<void> => {
    whenReadyPromise = new Promise<void>((resolve) => {
      whenReadyResolver = resolve;
    });
    return whenReadyPromise;
  };

  const resolveWhenReady = createResolveWhenReady(() => whenReadyResolver);
  const emitAppEvent = createEmitAppEvent(appListeners);
  const reset = createRuntimeReset({
    appendSwitchMock,
    appListeners,
    appOnMock,
    appQuitMock,
    appWhenReadyMock,
    bridgeInstances: runtimeCollections.bridgeInstances,
    BrowserWindowMock,
    existsSyncMock,
    ipcHandleMock,
    ipcHandlers,
    ipcRemoveHandlerMock,
    prefLoadMock,
    prefSaveMock,
    resetWhenReady,
  });

  reset();

  return {
    AbletonLiveBridgeMock,
    appendSwitchMock,
    appListeners,
    appOnMock,
    appQuitMock,
    appWhenReadyMock,
    bridgeInstances: runtimeCollections.bridgeInstances,
    BrowserWindowMock,
    emitAppEvent,
    existsSyncMock,
    ipcHandleMock,
    ipcHandlers,
    ipcRemoveHandlerMock,
    prefLoadMock,
    prefSaveMock,
    reset,
    resolveWhenReady,
    windows: runtimeCollections.windows,
  };
}
