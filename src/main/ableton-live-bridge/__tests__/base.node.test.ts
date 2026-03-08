import {
  createBridge,
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
  const { bridge } = await createBridge();
  const successfulCleanup = vi.fn(() => Promise.resolve());
  const failingCleanup = vi.fn(() => rejected(new Error("cleanup-failed")));
  const cleanups = [successfulCleanup, failingCleanup];

  // act
  bridge.clearObserverGroup(cleanups);
  await flushMicrotasks();

  // assert
  expect(successfulCleanup).toHaveBeenCalledTimes(1);
  expect(failingCleanup).toHaveBeenCalledTimes(1);
  expect(cleanups).toEqual([]);
});
