import {
  createLiveClipSlot,
  createLiveTrack,
  createSession,
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
  const { session } = await createSession();
  const cleanupGroup = [() => rejected(new Error("cleanup failed"))];

  // act
  session.clearObserverGroup(cleanupGroup);
  await flushMicrotasks();

  // assert
  expect(cleanupGroup).toHaveLength(0);
});

it("returns early when the resolved clip slot has no clip instance", async () => {
  // arrange
  const { session } = await createSession();
  session.selectedTrack = ACTIVE_TRACK_INDEX;
  session.selectedTrackToken = TRACK_TOKEN;
  session.subscribeScene = vi.fn(() => Promise.resolve());
  session.access.getTrack = vi.fn(() => resolved(createLiveTrack()));
  session.access.safeTrackChild = vi.fn(() => resolved(createLiveClipSlot()));
  session.access.safeClipSlotGet = vi.fn(() => resolved(true));
  session.access.safeClipSlotClip = vi.fn(() => resolved(MISSING_CLIP));
  const subscribeClipSpy = vi.spyOn(session, "subscribeClip");

  // act
  await session.handlePlayingSlot(SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});
