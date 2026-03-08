import {
  createBridge,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_LIVE_HOST,
  flushMicrotasks,
  RECONNECT_DELAY_MS,
  resetBridgeTestEnvironment,
  resolved,
  resolveHarnessEventHandler,
  STOP_RECONNECT_DELAY_MS,
  wsCtorMock,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { beforeEach, expect, it, vi } from "vitest";

const CUSTOM_LIVE_HOST = "bridge.internal.example";
const DOUBLE_CALL_COUNT = 2;
const INVALID_LIVE_PORT = "70000";
const OVERRIDDEN_LIVE_PORT = 9999;
const PENDING_TRACK_INDEX = 8;
const STALE_EPOCH = -1;

const throwUnsetConnectRejector = (error: Error): never => {
  throw new TypeError(`Expected a connect rejector before "${error.message}".`);
};

const throwUnsetConnectResolver = (): never => {
  throw new TypeError("Expected a connect resolver to be assigned.");
};

beforeEach(() => {
  resetBridgeTestEnvironment();
});

it("resolves host and port config and installs the ws fallback", async () => {
  // arrange
  // act
  const { harness } = await createBridge({
    host: CUSTOM_LIVE_HOST,
    port: String(OVERRIDDEN_LIVE_PORT),
    websocketUndefined: true,
  });

  // assert
  expect(harness.options).toEqual({
    host: CUSTOM_LIVE_HOST,
    port: OVERRIDDEN_LIVE_PORT,
  });
  expect(globalThis.WebSocket).toBe(wsCtorMock);
});

it("falls back to the default port for invalid environment input", async () => {
  // arrange
  // act
  const { harness } = await createBridge({ port: INVALID_LIVE_PORT });

  // assert
  expect(harness.options).toEqual({
    host: DEFAULT_LIVE_HOST,
    port: DEFAULT_BRIDGE_PORT,
  });
});

it("registers connect and disconnect handlers and controls start and stop", async () => {
  // arrange
  const { bridge, harness, onState } = await createBridge();

  bridge.start();
  bridge.start();

  // act
  await flushMicrotasks();
  resolveHarnessEventHandler(harness, "connect")();
  await flushMicrotasks();
  resolveHarnessEventHandler(harness, "disconnect")();
  bridge.stop();

  // assert
  expect(harness.instance.connect).toHaveBeenCalledTimes(1);
  expect(harness.instance.disconnect).toHaveBeenCalledTimes(1);
  expect(onState).toHaveBeenCalled();
  expect(onState.mock.lastCall?.[0]).toEqual(
    expect.objectContaining({
      clipName: undefined,
      connected: false,
      counterText: "0:0:0",
      sceneName: undefined,
      trackName: undefined,
    }),
  );
});

it("handles connect failure by emitting a disconnected state", async () => {
  // arrange
  const { bridge, harness, onState } = await createBridge();
  harness.instance.connect.mockRejectedValueOnce(new Error("boom"));

  // act
  bridge.start();
  await flushMicrotasks();

  // assert
  expect(onState).toHaveBeenCalled();
  expect(onState.mock.lastCall?.[0].connected).toBe(false);
  bridge.stop();
});

it("retries after a startup connect failure and resets backoff after connect", async () => {
  // arrange
  vi.useFakeTimers();
  const { bridge, harness } = await createBridge();
  harness.instance.connect.mockRejectedValueOnce(new Error("boot-fail"));

  // act
  bridge.start();
  await flushMicrotasks();
  await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
  await flushMicrotasks();
  resolveHarnessEventHandler(harness, "connect")();
  resolveHarnessEventHandler(harness, "disconnect")();

  // assert
  expect(harness.instance.connect).toHaveBeenCalledTimes(DOUBLE_CALL_COUNT);
  expect(bridge.reconnectAttempt).toBe(1);
  bridge.stop();
});

it("does not run concurrent connect attempts while one is in flight", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  let resolveConnect: () => void = throwUnsetConnectResolver;
  harness.instance.connect.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveConnect = resolve;
      }),
  );
  const connectMethod = vi.spyOn(bridge, "connect");

  // act
  bridge.start();
  void bridge.connect();
  await flushMicrotasks();
  resolveConnect();
  await flushMicrotasks();

  // assert
  expect(connectMethod).toHaveBeenCalledTimes(DOUBLE_CALL_COUNT);
  expect(harness.instance.connect).toHaveBeenCalledTimes(1);
  bridge.stop();
});

it("cancels a pending reconnect timer when stopping the bridge", async () => {
  // arrange
  vi.useFakeTimers();
  const { bridge, harness } = await createBridge();
  harness.instance.connect.mockRejectedValue(new Error("offline"));

  // act
  bridge.start();
  await flushMicrotasks();
  bridge.stop();
  await vi.advanceTimersByTimeAsync(STOP_RECONNECT_DELAY_MS);
  await flushMicrotasks();

  // assert
  expect(harness.instance.connect).toHaveBeenCalledTimes(1);
});

it("ignores late connect events after stop", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  const bootstrapSpy = vi.spyOn(bridge, "bootstrap");

  // act
  bridge.start();
  bridge.stop();
  resolveHarnessEventHandler(harness, "connect")();
  await flushMicrotasks();

  // assert
  expect(bridge.connected).toBe(false);
  expect(bootstrapSpy).not.toHaveBeenCalled();
});

it("ignores late disconnect events after stop", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  const emitSpy = vi.spyOn(bridge, "emit");

  // act
  bridge.start();
  bridge.stop();
  resolveHarnessEventHandler(harness, "disconnect")();
  await flushMicrotasks();

  // assert
  expect(bridge.connected).toBe(false);
  expect(emitSpy).not.toHaveBeenCalled();
});

it("returns early from bootstrap when the epoch is stale", async () => {
  // arrange
  const { bridge } = await createBridge();
  const observeSpy = vi.spyOn(bridge.access, "safeSongViewObserve");

  // act
  await bridge.bootstrap(STALE_EPOCH);

  // assert
  expect(observeSpy).not.toHaveBeenCalled();
});

it("skips reconnect work when connect fails after the bridge stops", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  let rejectConnect: (error: Error) => void = throwUnsetConnectRejector;
  harness.instance.connect.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectConnect = reject;
      }),
  );
  const retrySpy = vi.spyOn(bridge, "scheduleReconnect");

  bridge.start();
  bridge.stop();

  // act
  rejectConnect(new Error("late-failure"));
  await flushMicrotasks();

  // assert
  expect(retrySpy).toHaveBeenCalledTimes(1);
  expect(bridge.reconnectAttempt).toBe(0);
  expect(bridge.connected).toBe(false);
});

it("returns early when scheduling reconnect while stopped", async () => {
  // arrange
  const { bridge } = await createBridge();
  bridge.started = false;
  const timeoutSpy = vi.spyOn(globalThis, "setTimeout");

  // act
  bridge.scheduleReconnect();

  // assert
  expect(timeoutSpy).not.toHaveBeenCalled();
});

it("updates mode and toggles track lock", async () => {
  // arrange
  const { bridge, onState } = await createBridge();
  const emitSpy = vi.spyOn(bridge, "emit");

  bridge.setTrackLocked(false);
  bridge.setMode("remaining");

  // act
  const toggled = bridge.toggleTrackLock();
  const toggledBack = bridge.toggleTrackLock();

  // assert
  expect(toggled).toBe(true);
  expect(toggledBack).toBe(false);
  expect(emitSpy).toHaveBeenCalled();
  expect(onState).toHaveBeenCalled();
});

it("applies a pending selected track when unlocking", async () => {
  // arrange
  const { bridge } = await createBridge();
  bridge.trackLocked = true;
  bridge.pendingSelectedTrack = PENDING_TRACK_INDEX;
  const applySpy = vi
    .spyOn(bridge, "applySelectedTrack")
    .mockImplementation(() => resolved());

  // act
  bridge.setTrackLocked(false);

  // assert
  expect(applySpy).toHaveBeenCalledWith(PENDING_TRACK_INDEX);
  expect(bridge.pendingSelectedTrack).toBeUndefined();
});
