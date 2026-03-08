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
} from "./types";

const DEFAULT_WINDOW_HEIGHT = 180;
const DEFAULT_WINDOW_WIDTH = 370;
const DEFAULT_WINDOW_X = 10;
const DEFAULT_WINDOW_Y = 20;
const READY_PROMISE_FLUSH_COUNT = 8;

interface RuntimeResetDependencies {
  appendSwitchMock: ReturnType<typeof vi.fn>;
  appListeners: Map<string, Listener[]>;
  appOnMock: ReturnType<typeof vi.fn>;
  appQuitMock: ReturnType<typeof vi.fn>;
  appSetPathMock: ReturnType<typeof vi.fn>;
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
}

/**
 * Appends an event listener to the shared listener registry.
 * @param listenersByEvent - The listener bucket keyed by event name.
 * @param event - The event name to append to.
 * @param callback - The listener to register.
 */
const addListener = (
  listenersByEvent: Map<string, Listener[]>,
  event: string,
  callback: Listener,
): void => {
  const listeners = listenersByEvent.get(event) ?? [];
  listeners.push(callback);
  listenersByEvent.set(event, listeners);
};

/**
 * Creates an `app.on` handler backed by the shared listener registry.
 * @param appListeners - The app-level listeners keyed by event name.
 * @returns An `app.on` implementation for the runtime mock.
 */
const createAppOnHandler =
  (appListeners: Map<string, Listener[]>) =>
  (event: string, callback: Listener): void => {
    addListener(appListeners, event, callback);
  };

/**
 * Returns the default `toggleTrackLock` mock result.
 * @returns The default locked-state toggle result.
 */
const createBridgeToggleTrackLockHandler = (): boolean => true;

/**
 * Creates the default preference fixture for main-process tests.
 * @returns The default persisted preference state.
 */
const createDefaultPrefsValue = (): PrefsValue => ({
  alwaysOnTop: true,
  compactMode: false,
  mode: "elapsed",
  trackLocked: false,
});

/**
 * Returns the default file-existence result for preload resolution.
 * @returns `true` for the mocked preload bundle lookup.
 */
const createExistsSyncHandler = (): boolean => true;

/**
 * Creates the `ipcMain.handle` mock implementation.
 * @param ipcHandlers - The handler map keyed by IPC channel.
 * @returns A handler registration function.
 */
const createIpcHandleHandler =
  (ipcHandlers: Map<string, IpcHandler>) =>
  (channel: string, handler: IpcHandler): void => {
    ipcHandlers.set(channel, handler);
  };

/**
 * Creates the `ipcMain.removeHandler` mock implementation.
 * @param ipcHandlers - The handler map keyed by IPC channel.
 * @returns A handler removal function.
 */
const createIpcRemoveHandler =
  (ipcHandlers: Map<string, IpcHandler>) =>
  (channel: string): void => {
    ipcHandlers.delete(channel);
  };

/**
 * Resolves the default preference fixture.
 * @returns A promise of the default preference state.
 */
const createPrefLoadHandler = (): Promise<PrefsValue> =>
  Promise.resolve(createDefaultPrefsValue());

/**
 * Resolves a void promise for async mock methods.
 * @returns A resolved void promise.
 */
const createResolvedVoidPromise = (): Promise<void> => Promise.resolve();

/**
 * Creates a lookup for listeners registered on an event map.
 * @param listenersByEvent - The listener bucket keyed by event name.
 * @returns A resolver that returns listeners for a given event.
 */
const createResolveListeners =
  (listenersByEvent: Map<string, Listener[]>) =>
  (event: string): Listener[] =>
    listenersByEvent.get(event) ?? [];

/**
 * Creates an always-on-top mutator for a window mock.
 * @param windowInstance - The mocked window to update.
 * @returns A callback that updates the always-on-top flag.
 */
const createSetAlwaysOnTop =
  (windowInstance: BrowserWindowLike) =>
  (enabled: boolean): void => {
    windowInstance.alwaysOnTop = enabled;
  };

/**
 * Creates a content-size mutator for a window mock.
 * @param windowInstance - The mocked window to update.
 * @returns A callback that updates the tracked content size.
 */
const createSetContentSize =
  (windowInstance: BrowserWindowLike) =>
  (width: number, height: number): void => {
    windowInstance.contentSize = [width, height];
    windowInstance.bounds.width = width;
    windowInstance.bounds.height = height;
  };

/**
 * Creates a position mutator for a window mock.
 * @param windowInstance - The mocked window to update.
 * @returns A callback that updates the tracked position.
 */
const createSetPosition =
  (windowInstance: BrowserWindowLike) =>
  (x: number, y: number): void => {
    windowInstance.bounds.x = x;
    windowInstance.bounds.y = y;
  };

/**
 * Creates a resizable-state mutator for a window mock.
 * @param windowInstance - The mocked window to update.
 * @returns A callback that updates the resizable flag.
 */
const createSetResizable =
  (windowInstance: BrowserWindowLike) =>
  (enabled: boolean): void => {
    windowInstance.resizable = enabled;
  };

/**
 * Creates a workspace-visibility mutator for a window mock.
 * @param windowInstance - The mocked window to update.
 * @returns A callback that updates the all-workspaces flag.
 */
const createSetVisibleOnAllWorkspaces =
  (windowInstance: BrowserWindowLike) =>
  (enabled: boolean): void => {
    windowInstance.visibleOnAllWorkspaces = enabled;
  };

/**
 * Creates the mocked `webContents` surface for a window instance.
 * @returns A tracked `webContents` mock with listener storage.
 */
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

/**
 * Emits a stored event to every registered listener.
 * @param listenersByEvent - The listener bucket keyed by event name.
 * @param event - The event to emit.
 * @param arguments_ - The arguments to pass through to listeners.
 */
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

/**
 * Applies the constructor options to a new window mock.
 * @param windowInstance - The window mock under initialization.
 * @param options - The constructor options provided by the runtime.
 * @param windows - The tracked runtime window collection.
 */
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

/**
 * Creates the `BrowserWindow` mock constructor used by main-process tests.
 * @param runtimeCollections - The runtime collections that hold tracked windows.
 * @returns A `BrowserWindow` mock constructor.
 */
const createBrowserWindowMockClass = (
  runtimeCollections: RuntimeCollections,
): BrowserWindowMockConstructor => {
  const { windows } = runtimeCollections;

  /**
   * Mirrors the BrowserWindow methods used by the main-process tests.
   */
  class BrowserWindowMock {
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

    /**
     * Captures the constructor options and wires the tracked mutators.
     * @param options - The requested BrowserWindow options.
     */
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

    /**
     * Returns the non-closed tracked windows.
     * @returns The currently open mocked windows.
     */
    static getAllWindows(): BrowserWindowLike[] {
      return windows.filter((windowInstance) => !windowInstance.closed);
    }

    /**
     * Clears the tracked mocked windows.
     */
    static reset(): void {
      windows.length = 0;
    }

    /**
     * Emits a window-scoped event to the registered listeners.
     * @param event - The event name to emit.
     * @param arguments_ - The event arguments to forward.
     */
    emit(event: string, ...arguments_: unknown[]): void {
      emitMockEvent(this.eventListeners, event, ...arguments_);
    }

    /**
     * Emits a webContents-scoped event to the registered listeners.
     * @param event - The event name to emit.
     * @param arguments_ - The event arguments to forward.
     */
    emitWebContents(event: string, ...arguments_: unknown[]): void {
      emitMockEvent(this.webContents.listeners, event, ...arguments_);
    }

    /**
     * Returns the current tracked window bounds.
     * @returns A bounds snapshot for the window mock.
     */
    getBounds(): StoredWindowBounds {
      return { ...this.bounds };
    }

    /**
     * Returns the current tracked content size.
     * @returns The width and height tuple for the content area.
     */
    getContentSize(): [number, number] {
      return [this.contentSize[0], this.contentSize[1]];
    }

    /**
     * Reports whether the window is currently topmost.
     * @returns Whether the always-on-top flag is set.
     */
    isAlwaysOnTop(): boolean {
      return this.alwaysOnTop;
    }

    /**
     * Reports whether the window has been destroyed.
     * @returns Whether the destroyed flag is set.
     */
    isDestroyed(): boolean {
      return this.destroyed;
    }

    /**
     * Reports whether the window is visible on every workspace.
     * @returns Whether the all-workspaces flag is set.
     */
    isVisibleOnAllWorkspaces(): boolean {
      return this.visibleOnAllWorkspaces;
    }

    /**
     * Registers a window-scoped event listener.
     * @param event - The event name to register.
     * @param callback - The listener callback to add.
     */
    on(event: string, callback: Listener): void {
      addListener(this.eventListeners, event, callback);
    }
  }

  return BrowserWindowMock;
};

/**
 * Creates the bridge mock constructor used by main-process tests.
 * @param runtimeCollections - The runtime collections that hold bridge instances.
 * @returns A mock `AbletonLiveBridge` constructor.
 */
const createAbletonLiveBridgeMockClass = (
  runtimeCollections: RuntimeCollections,
): AbletonLiveBridgeMockConstructor => {
  const { bridgeInstances } = runtimeCollections;

  /**
   * Mirrors the bridge surface used by the main-process tests.
   */
  class AbletonLiveBridgeMock {
    readonly mode: string;
    readonly onState: (state: unknown) => void;
    readonly setMode = vi.fn();
    readonly start = vi.fn();
    readonly stop = vi.fn();
    readonly toggleTrackLock = vi.fn(createBridgeToggleTrackLockHandler);
    readonly trackLocked: boolean;

    /**
     * Captures the initial bridge state and registers the mock instance.
     * @param mode - The initial counter mode.
     * @param onState - The HUD state callback captured by the bridge.
     * @param trackLocked - The initial track-lock state.
     */
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

    /**
     * Emits a HUD state through the captured callback.
     * @param state - The state payload to forward to the runtime.
     */
    emitState(state: unknown): void {
      this.onState(state);
    }
  }

  return AbletonLiveBridgeMock;
};

/**
 * Creates a helper that resolves and flushes `app.whenReady`.
 * @param resolveWhenReadyPromise - Resolves the pending `whenReady` callback.
 * @returns A helper that settles the ready promise and queued microtasks.
 */
const createResolveWhenReady = (
  resolveWhenReadyPromise: () => (() => void) | undefined,
): (() => Promise<void>) => {
  /**
   * Resolves the mocked `whenReady` promise and drains follow-up microtasks.
   * @returns A promise that settles after the startup queue drains.
   */
  const resolveAndFlushWhenReady = async (): Promise<void> => {
    resolveWhenReadyPromise()?.();
    await Promise.resolve();
    for (let index = 0; index < READY_PROMISE_FLUSH_COUNT; index += 1) {
      await Promise.resolve();
    }
  };

  return resolveAndFlushWhenReady;
};

/**
 * Creates a helper that emits app lifecycle events to registered listeners.
 * @param appListeners - The app-level listeners keyed by event name.
 * @returns An async event emitter for the mocked app surface.
 */
const createEmitAppEvent = (appListeners: Map<string, Listener[]>) => {
  /**
   * Emits an app lifecycle event and waits for async listeners to settle.
   * @param event - The event name to emit.
   * @returns A promise that settles after listeners finish their microtasks.
   */
  const emitAppEvent = async (event: string): Promise<void> => {
    const resolveListeners = createResolveListeners(appListeners);
    for (const listener of resolveListeners(event)) {
      listener();
      await Promise.resolve();
    }
    await Promise.resolve();
  };

  return emitAppEvent;
};

/**
 * Creates a helper that restores the mocked runtime to its defaults.
 * @param runtime - The runtime-owned mocks and collections to reset.
 * @returns A runtime reset helper.
 */
const createRuntimeReset = (
  runtime: RuntimeResetDependencies,
): (() => void) => {
  const {
    appendSwitchMock,
    appListeners,
    appOnMock,
    appQuitMock,
    appSetPathMock,
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
  } = runtime;

  /**
   * Restores the runtime mocks and tracked collections to their defaults.
   */
  const resetRuntime = (): void => {
    const whenReadyPromise = resetWhenReady();
    appListeners.clear();
    ipcHandlers.clear();
    BrowserWindowMock.reset();
    bridgeInstances.length = 0;
    appendSwitchMock.mockReset();
    appOnMock.mockReset();
    appOnMock.mockImplementation(createAppOnHandler(appListeners));
    appQuitMock.mockReset();
    appSetPathMock.mockReset();
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

  return resetRuntime;
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
  const appSetPathMock = vi.fn();
  const appWhenReadyMock = vi.fn(() => whenReadyPromise);
  const existsSyncMock = vi.fn(createExistsSyncHandler);
  const ipcHandleMock = vi.fn(createIpcHandleHandler(ipcHandlers));
  const ipcRemoveHandlerMock = vi.fn(createIpcRemoveHandler(ipcHandlers));
  const prefLoadMock = vi.fn(createPrefLoadHandler);
  const prefSaveMock = vi.fn<() => Promise<void>>(createResolvedVoidPromise);

  /**
   * Rebuilds the pending `app.whenReady` promise for the next test cycle.
   * @returns The new `whenReady` promise.
   */
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
    appSetPathMock,
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
    appSetPathMock,
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
