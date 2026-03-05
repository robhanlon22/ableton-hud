import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultHudState, HUD_CHANNELS } from "../shared/ipc";

const runtime = vi.hoisted(() => {
  interface PrefsValue {
    alwaysOnTop: boolean;
    compactMode: boolean;
    mode: "elapsed" | "remaining";
    trackLocked: boolean;
    windowBounds?: {
      height: number;
      width: number;
      x: number;
      y: number;
    };
  }

  type Listener = (...args: unknown[]) => void;

  const appListeners = new Map<string, Listener[]>();
  const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const windows: BrowserWindowMock[] = [];
  let whenReadyResolver: (() => void) | null = null;
  let whenReadyPromise = Promise.resolve();

  class BrowserWindowMock {
    alwaysOnTop = false;

    readonly bounds = {
      height: 180,
      width: 370,
      x: 10,
      y: 20,
    };

    closed = false;

    contentSize: [number, number] = [370, 180];
    destroyed = false;
    readonly eventListeners = new Map<string, Listener[]>();
    readonly loadFile = vi.fn(() => Promise.resolve());
    readonly loadURL = vi.fn(() => Promise.resolve());
    resizable = true;
    readonly setAlwaysOnTop = vi.fn((enabled: boolean, level?: string) => {
      void level;
      this.alwaysOnTop = enabled;
    });

    readonly setContentSize = vi.fn((width: number, height: number) => {
      this.contentSize = [width, height];
      this.bounds.width = width;
      this.bounds.height = height;
    });
    readonly setPosition = vi.fn((x: number, y: number) => {
      this.bounds.x = x;
      this.bounds.y = y;
    });
    readonly setResizable = vi.fn((enabled: boolean) => {
      this.resizable = enabled;
    });
    visibleOnAllWorkspaces = false;
    readonly setVisibleOnAllWorkspaces = vi.fn((enabled: boolean) => {
      this.visibleOnAllWorkspaces = enabled;
    });
    readonly webContents = {
      listeners: new Map<string, Listener[]>(),
      on: vi.fn((event: string, callback: Listener) => {
        const listeners = this.webContents.listeners.get(event) ?? [];
        listeners.push(callback);
        this.webContents.listeners.set(event, listeners);
      }),
      send: vi.fn(),
    };
    constructor(readonly options: Record<string, unknown>) {
      this.bounds.width = options.width as number;
      this.bounds.height = options.height as number;
      this.bounds.x = (options.x as number | undefined) ?? this.bounds.x;
      this.bounds.y = (options.y as number | undefined) ?? this.bounds.y;
      this.resizable = options.resizable as boolean;
      this.contentSize = [this.bounds.width, this.bounds.height];
      windows.push(this);
    }

    static getAllWindows(): BrowserWindowMock[] {
      return windows.filter((windowInstance) => !windowInstance.closed);
    }

    static reset(): void {
      windows.length = 0;
    }

    emit(event: string, ...args: unknown[]): void {
      const listeners = this.eventListeners.get(event) ?? [];
      for (const listener of listeners) {
        listener(...args);
      }
    }

    emitWebContents(event: string, ...args: unknown[]): void {
      const listeners = this.webContents.listeners.get(event) ?? [];
      for (const listener of listeners) {
        listener(...args);
      }
    }

    getBounds(): { height: number; width: number; x: number; y: number } {
      return { ...this.bounds };
    }

    getContentSize(): [number, number] {
      return [...this.contentSize] as [number, number];
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
      const listeners = this.eventListeners.get(event) ?? [];
      listeners.push(callback);
      this.eventListeners.set(event, listeners);
    }
  }

  class AbletonLiveBridgeMock {
    readonly setMode = vi.fn();

    readonly start = vi.fn();
    readonly stop = vi.fn();
    readonly toggleTrackLock = vi.fn(() => true);
    constructor(
      readonly mode: string,
      readonly onState: (
        state: ReturnType<typeof createDefaultHudState>,
      ) => void,
      readonly trackLocked: boolean,
    ) {
      bridgeInstances.push(this);
    }

    emitState(state: ReturnType<typeof createDefaultHudState>): void {
      this.onState(state);
    }
  }

  const appendSwitchMock = vi.fn();
  const appOnMock = vi.fn((event: string, callback: Listener) => {
    const listeners = appListeners.get(event) ?? [];
    listeners.push(callback);
    appListeners.set(event, listeners);
  });
  const appQuitMock = vi.fn();
  const appWhenReadyMock = vi.fn(() => whenReadyPromise);
  const existsSyncMock = vi.fn(() => true);
  const ipcHandleMock = vi.fn((channel: string, handler: Listener) => {
    ipcHandlers.set(channel, handler);
  });
  const ipcRemoveHandlerMock = vi.fn((channel: string) => {
    ipcHandlers.delete(channel);
  });
  const prefLoadMock = vi.fn<() => Promise<PrefsValue>>(() =>
    Promise.resolve({
      alwaysOnTop: true,
      compactMode: false,
      mode: "elapsed" as const,
      trackLocked: false,
    }),
  );
  const prefSaveMock = vi.fn(() => Promise.resolve());
  const bridgeInstances: AbletonLiveBridgeMock[] = [];

  const resetWhenReady = (): void => {
    whenReadyPromise = new Promise<void>((resolve) => {
      whenReadyResolver = resolve;
    });
  };

  const resolveWhenReady = async (): Promise<void> => {
    if (whenReadyResolver) {
      whenReadyResolver();
    }
    await Promise.resolve();
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  };

  const emitAppEvent = async (event: string): Promise<void> => {
    const listeners = appListeners.get(event) ?? [];
    for (const listener of listeners) {
      listener();
      await Promise.resolve();
    }
    await Promise.resolve();
  };

  const reset = (): void => {
    appListeners.clear();
    ipcHandlers.clear();
    BrowserWindowMock.reset();
    bridgeInstances.length = 0;
    appendSwitchMock.mockReset();
    appOnMock.mockClear();
    appQuitMock.mockReset();
    appWhenReadyMock.mockClear();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
    ipcHandleMock.mockReset();
    ipcRemoveHandlerMock.mockReset();
    prefLoadMock.mockReset();
    prefSaveMock.mockReset();
    prefLoadMock.mockResolvedValue({
      alwaysOnTop: true,
      compactMode: false,
      mode: "elapsed",
      trackLocked: false,
    });
    prefSaveMock.mockResolvedValue(undefined);
    resetWhenReady();
  };

  reset();

  return {
    AbletonLiveBridgeMock,
    appendSwitchMock,
    appListeners,
    appOnMock,
    appQuitMock,
    appWhenReadyMock,
    bridgeInstances,
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
    windows,
  };
});

vi.mock("electron", () => ({
  app: {
    commandLine: {
      appendSwitch: runtime.appendSwitchMock,
    },
    on: runtime.appOnMock,
    quit: runtime.appQuitMock,
    whenReady: runtime.appWhenReadyMock,
  },
  BrowserWindow: runtime.BrowserWindowMock,
  ipcMain: {
    handle: runtime.ipcHandleMock,
    removeHandler: runtime.ipcRemoveHandlerMock,
  },
}));

vi.mock("./ableton-live-bridge", () => ({
  AbletonLiveBridge: runtime.AbletonLiveBridgeMock,
}));

vi.mock("./prefs", () => ({
  PrefStore: class PrefStoreMock {
    load = runtime.prefLoadMock;
    save = runtime.prefSaveMock;
  },
}));

vi.mock("node:fs", () => ({
  existsSync: runtime.existsSyncMock,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
);

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
};

describe("main/index module", () => {
  beforeEach(() => {
    runtime.reset();
    vi.resetModules();
    delete process.env.AOSC_RENDERER_DEBUG_PORT;
    delete process.env.ELECTRON_RENDERER_URL;
    delete process.env.VITE_DEV_SERVER_URL;
    setPlatform("linux");
  });

  it("boots app side effects and handles core IPC flows", async () => {
    // arrange
    process.env.AOSC_RENDERER_DEBUG_PORT = "9222";
    process.env.ELECTRON_RENDERER_URL = "http://127.0.0.1:5173";
    runtime.prefLoadMock.mockResolvedValue({
      alwaysOnTop: false,
      compactMode: false,
      mode: "remaining",
      trackLocked: true,
      windowBounds: {
        height: 250,
        width: 420,
        x: 41,
        y: 42,
      },
    });

    await import("./index");
    // act
    await runtime.resolveWhenReady();

    // assert
    expect(runtime.appendSwitchMock).toHaveBeenCalledWith(
      "remote-debugging-port",
      "9222",
    );
    expect(runtime.bridgeInstances).toHaveLength(1);
    expect(runtime.bridgeInstances[0]?.start).toHaveBeenCalledTimes(1);
    expect(runtime.windows).toHaveLength(1);
    const windowInstance = runtime.windows[0];
    expect(windowInstance.loadURL).toHaveBeenCalledWith(
      "http://127.0.0.1:5173",
    );

    expect(runtime.ipcHandlers.has(HUD_CHANNELS.getInitialState)).toBe(true);
    expect(runtime.ipcHandlers.has(HUD_CHANNELS.setMode)).toBe(true);
    expect(runtime.ipcHandlers.has(HUD_CHANNELS.setCompactView)).toBe(true);
    expect(runtime.ipcHandlers.has(HUD_CHANNELS.toggleTopmost)).toBe(true);
    expect(runtime.ipcHandlers.has(HUD_CHANNELS.toggleTrackLock)).toBe(true);

    const didFinishLoadListener =
      windowInstance.webContents.listeners.get("did-finish-load")?.[0];
    expect(didFinishLoadListener).toBeTypeOf("function");
    didFinishLoadListener?.();
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      HUD_CHANNELS.state,
      createDefaultHudState("remaining", false, false, true),
    );

    const setModeHandler = runtime.ipcHandlers.get(HUD_CHANNELS.setMode);
    expect(setModeHandler).toBeTypeOf("function");
    await setModeHandler?.({}, "elapsed");
    expect(runtime.bridgeInstances[0]?.setMode).toHaveBeenCalledWith("elapsed");

    const compactHandler = runtime.ipcHandlers.get(HUD_CHANNELS.setCompactView);
    expect(compactHandler).toBeTypeOf("function");
    windowInstance.emit("resize");
    windowInstance.emit("move");
    const prefSaveCallCountBeforeCompact =
      runtime.prefSaveMock.mock.calls.length;
    windowInstance.setContentSize.mockImplementationOnce(
      (width: number, height: number) => {
        windowInstance.contentSize = [width, height];
        windowInstance.bounds.width = width;
        windowInstance.bounds.height = height;
        windowInstance.emit("resize");
        windowInstance.emit("move");
      },
    );
    await compactHandler?.({}, { enabled: true, height: 130, width: 300 });
    expect(windowInstance.setResizable).toHaveBeenCalledWith(false);
    expect(windowInstance.setContentSize).toHaveBeenCalledWith(300, 130);
    expect(runtime.prefSaveMock.mock.calls.length).toBe(
      prefSaveCallCountBeforeCompact + 1,
    );

    await compactHandler?.({}, { enabled: false });
    expect(windowInstance.setResizable).toHaveBeenLastCalledWith(true);
    expect(windowInstance.setPosition).toHaveBeenCalledWith(41, 42);
    expect(windowInstance.setContentSize).toHaveBeenCalledWith(420, 250);

    const toggleTrackLockHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.toggleTrackLock,
    );
    expect(toggleTrackLockHandler).toBeTypeOf("function");
    await toggleTrackLockHandler?.({});

    const toggleTopmostHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.toggleTopmost,
    );
    expect(toggleTopmostHandler).toBeTypeOf("function");
    await toggleTopmostHandler?.({});
    expect(windowInstance.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(windowInstance.webContents.send).toHaveBeenLastCalledWith(
      HUD_CHANNELS.state,
      createDefaultHudState("elapsed", true, false, true),
    );

    expect(runtime.prefSaveMock).toHaveBeenCalled();
    expect(runtime.prefSaveMock).toHaveBeenLastCalledWith({
      alwaysOnTop: true,
      compactMode: false,
      mode: "elapsed",
      trackLocked: true,
      windowBounds: {
        height: 250,
        width: 420,
        x: 41,
        y: 42,
      },
    });

    await runtime.emitAppEvent("before-quit");
    expect(runtime.bridgeInstances[0]?.stop).toHaveBeenCalledTimes(1);
    await toggleTrackLockHandler?.({});
    expect(runtime.bridgeInstances[0]?.toggleTrackLock).toHaveBeenCalledTimes(
      1,
    );

    await runtime.emitAppEvent("window-all-closed");
    expect(runtime.appQuitMock).toHaveBeenCalledTimes(1);

    windowInstance.closed = true;
    await runtime.emitAppEvent("activate");
    expect(runtime.windows).toHaveLength(2);
  });

  it("uses loadFile fallback, handles darwin topmost behavior, and skips invalid states", async () => {
    // arrange
    runtime.prefLoadMock.mockResolvedValue({
      alwaysOnTop: true,
      compactMode: true,
      mode: "elapsed",
      trackLocked: false,
      windowBounds: {
        height: 333,
        width: 444,
        x: 8,
        y: 9,
      },
    });
    runtime.existsSyncMock.mockReturnValueOnce(false);
    runtime.existsSyncMock.mockReturnValueOnce(true);
    setPlatform("darwin");

    await import("./index");
    // act
    await runtime.resolveWhenReady();

    // assert
    expect(runtime.appendSwitchMock).not.toHaveBeenCalled();
    const windowInstance = runtime.windows[0];
    expect(windowInstance.loadFile).toHaveBeenCalledWith(
      expect.stringContaining("renderer/index.html"),
    );
    expect(windowInstance.options.resizable).toBe(false);

    const didFinishLoadListener =
      windowInstance.webContents.listeners.get("did-finish-load")?.[0];
    expect(didFinishLoadListener).toBeTypeOf("function");
    didFinishLoadListener?.();
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      HUD_CHANNELS.state,
      createDefaultHudState("elapsed", true, true, false),
    );

    const bridge = runtime.bridgeInstances[0];
    expect(bridge).toBeDefined();
    bridge.emitState({ ...createDefaultHudState(), counterText: 42 as never });

    const getInitialStateHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.getInitialState,
    );
    const initialState = getInitialStateHandler?.({});
    expect(initialState).toEqual(
      createDefaultHudState("elapsed", true, true, false),
    );

    const toggleTopmostHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.toggleTopmost,
    );
    windowInstance.visibleOnAllWorkspaces = true;
    await toggleTopmostHandler?.({});
    expect(windowInstance.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(windowInstance.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(
      false,
    );

    await runtime.emitAppEvent("window-all-closed");
    expect(runtime.appQuitMock).toHaveBeenCalledTimes(0);
  });

  it("covers no-op IPC branches when window is missing or compact mode is unchanged", async () => {
    // arrange
    await import("./index");
    await runtime.resolveWhenReady();

    const windowInstance = runtime.windows[0];
    const compactHandler = runtime.ipcHandlers.get(HUD_CHANNELS.setCompactView);
    const setModeHandler = runtime.ipcHandlers.get(HUD_CHANNELS.setMode);
    // act
    const toggleTopmostHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.toggleTopmost,
    );

    // assert
    expect(compactHandler).toBeTypeOf("function");
    expect(setModeHandler).toBeTypeOf("function");
    expect(toggleTopmostHandler).toBeTypeOf("function");

    await compactHandler?.({}, { enabled: false });
    expect(windowInstance.setResizable).not.toHaveBeenCalled();

    windowInstance.emit("closed");
    await compactHandler?.({}, { enabled: false });
    await toggleTopmostHandler?.({});
    await setModeHandler?.({}, "remaining");

    expect(runtime.prefSaveMock).not.toHaveBeenCalled();
  });

  it("throws when preload bundle is missing", async () => {
    // arrange
    runtime.existsSyncMock.mockReturnValue(false);
    let startupPromise: null | Promise<unknown> = null;
    runtime.appWhenReadyMock.mockImplementationOnce(
      () =>
        ({
          then: (onFulfilled: () => unknown) => {
            startupPromise = Promise.resolve().then(onFulfilled);
            return startupPromise;
          },
        }) as Promise<void>,
    );

    // act
    await import("./index");
    // assert
    expect(startupPromise).toBeDefined();
    await expect(startupPromise).rejects.toThrow(
      "Unable to find preload bundle",
    );
  });

  it("throws explicit compact dimensions error after parse succeeds without dimensions", async () => {
    // arrange
    vi.doMock("../shared/ipc", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../shared/ipc")>();
      const compactSchema = actual.CompactViewRequestSchema;
      const compactPrototype = Reflect.getPrototypeOf(compactSchema);
      if (!compactPrototype) {
        throw new Error("Compact schema prototype was missing.");
      }
      const mockedParse = vi.fn((() => ({
        enabled: true,
      })) as typeof compactSchema.parse);
      const mockedCompactSchema = Object.assign(
        Object.create(compactPrototype) as typeof compactSchema,
        compactSchema,
        { parse: mockedParse },
      );
      return {
        ...actual,
        CompactViewRequestSchema: mockedCompactSchema,
      };
    });

    await import("./index");
    await runtime.resolveWhenReady();

    // act
    const compactHandler = runtime.ipcHandlers.get(HUD_CHANNELS.setCompactView);
    // assert
    expect(compactHandler).toBeTypeOf("function");

    await expect(compactHandler?.({}, { enabled: true })).rejects.toThrow(
      "Compact view dimensions are required when enabled.",
    );
  });

  it("covers remaining branch paths for latest-state and compact toggles", async () => {
    // arrange
    vi.doUnmock("../shared/ipc");
    process.env.AOSC_RENDERER_DEBUG_PORT = "invalid-port";
    setPlatform("darwin");
    runtime.prefLoadMock.mockResolvedValue({
      alwaysOnTop: true,
      compactMode: true,
      mode: "elapsed",
      trackLocked: false,
    });

    await import("./index");
    // act
    await runtime.resolveWhenReady();

    // assert
    expect(runtime.appendSwitchMock).not.toHaveBeenCalled();
    expect(runtime.windows).toHaveLength(1);
    const windowInstance = runtime.windows[0];

    const bridge = runtime.bridgeInstances[0];
    expect(bridge).toBeDefined();
    const pushedState = {
      ...createDefaultHudState(),
      connected: true,
      counterText: "1:1:1",
    };
    bridge.emitState(pushedState);

    const didFinishLoadListener =
      windowInstance.webContents.listeners.get("did-finish-load")?.[0];
    expect(didFinishLoadListener).toBeTypeOf("function");
    didFinishLoadListener?.();
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      HUD_CHANNELS.state,
      expect.objectContaining({
        connected: true,
        counterText: "1:1:1",
      }),
    );

    const getInitialStateHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.getInitialState,
    );
    const initialState = getInitialStateHandler?.({});
    expect(initialState).toEqual(
      expect.objectContaining({
        connected: true,
        counterText: "1:1:1",
      }),
    );

    const compactHandler = runtime.ipcHandlers.get(HUD_CHANNELS.setCompactView);
    expect(compactHandler).toBeTypeOf("function");
    await compactHandler?.({}, { enabled: true, height: 138, width: 320 });
    await compactHandler?.({}, { enabled: false });
    expect(windowInstance.setPosition).not.toHaveBeenCalled();

    const toggleTopmostHandler = runtime.ipcHandlers.get(
      HUD_CHANNELS.toggleTopmost,
    );
    expect(toggleTopmostHandler).toBeTypeOf("function");
    windowInstance.visibleOnAllWorkspaces = false;
    await toggleTopmostHandler?.({});
    expect(windowInstance.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(windowInstance.setVisibleOnAllWorkspaces).toHaveBeenCalledTimes(1);

    await runtime.emitAppEvent("activate");
    expect(runtime.windows).toHaveLength(1);

    windowInstance.emit("closed");
    bridge.emitState(pushedState);
  });
});

afterAll(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, "platform", originalPlatformDescriptor);
  }
});
