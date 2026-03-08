import {
  createSession,
  flushMicrotasks,
  rejected,
  resetBridgeTestEnvironment,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  resetBridgeTestEnvironment();
});

it("swallows rejected cleanup callbacks while clearing observer groups", async () => {
  // arrange
  const { session } = await createSession();
  const successfulCleanup = vi.fn(() => Promise.resolve());
  const failingCleanup = vi.fn(() => rejected(new Error("cleanup-failed")));
  const cleanups = [successfulCleanup, failingCleanup];

  // act
  session.clearObserverGroup(cleanups);
  await flushMicrotasks();

  // assert
  expect(successfulCleanup).toHaveBeenCalledTimes(1);
  expect(failingCleanup).toHaveBeenCalledTimes(1);
  expect(cleanups).toEqual([]);
});

it("swallows live disconnect failures during stop", async () => {
  // arrange
  const { harness, session } = await createSession();
  const disconnectError = new Error("not-connected");
  harness.instance.disconnect.mockImplementation(() => {
    throw disconnectError;
  });

  // act
  const stopBridge = session.stop.bind(session);

  // assert
  expect(stopBridge).not.toThrow();
  expect(harness.instance.disconnect).toHaveBeenCalledTimes(1);
});
