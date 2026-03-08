import {
  createBridge,
  createLiveClipSlot,
  createLiveTrack,
  flushMicrotasks,
  rejected,
  resetBridgeTestEnvironment,
  resolved,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { beforeEach, expect, it, vi } from "vitest";

const ACTIVE_TRACK_INDEX = 3;
const MISSING_CLIP = undefined;
const SLOT_INDEX = 4;
const TRACK_TOKEN = 10;

beforeEach(() => {
  resetBridgeTestEnvironment();
});

it("swallows observer cleanup failures during teardown", async () => {
  // arrange
  const { bridge } = await createBridge();
  const cleanupGroup = [() => rejected(new Error("cleanup failed"))];

  // act
  bridge.clearObserverGroup(cleanupGroup);
  await flushMicrotasks();

  // assert
  expect(cleanupGroup).toHaveLength(0);
});

it("returns early when the resolved clip slot has no clip instance", async () => {
  // arrange
  const { bridge } = await createBridge();
  bridge.selectedTrack = ACTIVE_TRACK_INDEX;
  bridge.selectedTrackToken = TRACK_TOKEN;
  bridge.subscribeScene = vi.fn(() => Promise.resolve());
  bridge.access.getTrack = vi.fn(() => resolved(createLiveTrack()));
  bridge.access.safeTrackChild = vi.fn(() => resolved(createLiveClipSlot()));
  bridge.access.safeClipSlotGet = vi.fn(() => resolved(true));
  bridge.access.safeClipSlotClip = vi.fn(() => resolved(MISSING_CLIP));
  const subscribeClipSpy = vi.spyOn(bridge, "subscribeClip");

  // act
  await bridge.handlePlayingSlot(SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});
