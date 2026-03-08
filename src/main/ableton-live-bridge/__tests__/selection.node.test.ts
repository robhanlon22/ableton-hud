import type { TrackProperty } from "@main/ableton-live-bridge";
import type { Observer } from "@main/ableton-live-bridge/__tests__/test-types";

import {
  createBridge,
  createCleanupMock,
  createLiveTrack,
  resetBridgeTestEnvironment,
  resolved,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { MAX_RGB_COLOR } from "@main/ableton-live-bridge/types";
import { beforeEach, expect, it, vi } from "vitest";

const CURRENT_TRACK_INDEX = 12;
const INITIAL_PLAYING_SLOT_INDEX = 3;
const INITIAL_TRACK_COLOR = 255;
const LOCKED_SELECTED_TRACK_INDEX = 2;
const MISSING_TRACK_INDEX = 4;
const NEXT_PLAYING_SLOT_INDEX = 5;
const OBSERVER_IGNORED_SLOT_INDEX = 8;
const OBSERVER_IGNORED_TRACK_INDEX = 7;
const OBSERVER_NAME_VALUE = 9876;
const PATH_TRACK_ID = 42;
const PATH_TRACK_INDEX = 3;
const PENDING_TRACK_INDEX = 4;
const RAW_PATH_TRACK_ID = 77;
const RAW_PATH_TRACK_INDEX = 11;
const SECONDARY_PATH_TRACK_INDEX = 5;
const SECONDARY_RAW_PATH_TRACK_INDEX = 6;
const SLOT_LOOKUP_TRACK_INDEX = 6;
const UPDATED_TRACK_INDEX = 1;
const UNKNOWN_TRACK_ID = 19;

beforeEach(() => {
  resetBridgeTestEnvironment();
});

it("resolves track indexes from ids and path payloads", async () => {
  // arrange
  const { bridge } = await createBridge();
  bridge.access.safeSongTracks = vi.fn(() =>
    resolved([
      createLiveTrack({ id: PATH_TRACK_ID, path: "live_set tracks 3" }),
      createLiveTrack({ raw: { id: "77", path: "live_set tracks 11" } }),
    ]),
  );

  // act
  const directIdIndex = await bridge.resolveTrackIndex(PATH_TRACK_ID);
  const rawIdIndex = await bridge.resolveTrackIndex(RAW_PATH_TRACK_ID);
  const missingIdIndex = await bridge.resolveTrackIndex(UNKNOWN_TRACK_ID);
  const directPathIndex = await bridge.resolveTrackIndex({
    path: "live_set tracks 5",
  });
  const rawPathIndex = await bridge.resolveTrackIndex({
    raw: { path: "live_set tracks 6" },
  });
  const invalidPathIndex = await bridge.resolveTrackIndex({ path: "x y z" });

  // assert
  expect(directIdIndex).toBe(PATH_TRACK_INDEX);
  expect(rawIdIndex).toBe(RAW_PATH_TRACK_INDEX);
  expect(missingIdIndex).toBe(UNKNOWN_TRACK_ID);
  expect(directPathIndex).toBe(SECONDARY_PATH_TRACK_INDEX);
  expect(rawPathIndex).toBe(SECONDARY_RAW_PATH_TRACK_INDEX);
  expect(invalidPathIndex).toBe(-1);
});

it("tracks pending selection while locked and applies matching selections", async () => {
  // arrange
  const { bridge } = await createBridge();
  const applySpy = vi
    .spyOn(bridge, "applySelectedTrack")
    .mockImplementation(() => resolved());
  bridge.selectedTrack = LOCKED_SELECTED_TRACK_INDEX;
  bridge.trackLocked = true;

  // act
  bridge.handleSelectedTrack(-1);
  bridge.handleSelectedTrack(LOCKED_SELECTED_TRACK_INDEX);
  bridge.handleSelectedTrack(PENDING_TRACK_INDEX);

  // assert
  expect(applySpy).toHaveBeenCalledWith(LOCKED_SELECTED_TRACK_INDEX);
  expect(bridge.pendingSelectedTrack).toBe(PENDING_TRACK_INDEX);
});

it("applies the selected track and wires observer updates", async () => {
  // arrange
  const { bridge } = await createBridge();
  const listeners = new Map<TrackProperty, Observer>();
  const track = createLiveTrack({
    get: vi.fn((property: TrackProperty) => {
      if (property === "name") {
        return resolved("Bass");
      }

      if (property === "color") {
        return resolved(INITIAL_TRACK_COLOR);
      }

      return resolved(INITIAL_PLAYING_SLOT_INDEX);
    }),
    observe: vi.fn((property: TrackProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  bridge.access.getTrack = vi.fn(() => resolved(track));
  const slotSpy = vi
    .spyOn(bridge, "handlePlayingSlot")
    .mockImplementation(() => resolved());

  // act
  await bridge.applySelectedTrack(UPDATED_TRACK_INDEX);
  listeners.get("name")?.("Lead");
  listeners.get("color")?.(MAX_RGB_COLOR);
  listeners.get("playing_slot_index")?.(NEXT_PLAYING_SLOT_INDEX);

  // assert
  expect(bridge.selectedTrack).toBe(UPDATED_TRACK_INDEX);
  expect(bridge.trackName).toBe("Lead");
  expect(bridge.trackColor).toBe(MAX_RGB_COLOR);
  expect(slotSpy).toHaveBeenCalledWith(INITIAL_PLAYING_SLOT_INDEX);
  expect(slotSpy).toHaveBeenCalledWith(NEXT_PLAYING_SLOT_INDEX);
  expect(bridge.trackObserverCleanups).toHaveLength(INITIAL_PLAYING_SLOT_INDEX);
});

it("returns early when applySelectedTrack receives the current selection", async () => {
  // arrange
  const { bridge } = await createBridge();
  const getTrackSpy = vi.spyOn(bridge.access, "getTrack");
  bridge.selectedTrack = CURRENT_TRACK_INDEX;

  // act
  await bridge.applySelectedTrack(CURRENT_TRACK_INDEX);

  // assert
  expect(getTrackSpy).not.toHaveBeenCalled();
});

it("returns early when the track token changes before the track resolves", async () => {
  // arrange
  const { bridge } = await createBridge();
  const track = createLiveTrack();
  const syncTrackStateSpy = vi.spyOn(bridge.subscriptions, "syncTrackState");
  bridge.access.getTrack = vi.fn(() => {
    bridge.selectedTrackToken += 1;
    return resolved(track);
  });

  // act
  await bridge.applySelectedTrack(LOCKED_SELECTED_TRACK_INDEX);

  // assert
  expect(syncTrackStateSpy).not.toHaveBeenCalled();
});

it("keeps the selected track when the resolved track is missing", async () => {
  // arrange
  const { bridge } = await createBridge();
  bridge.access.getTrack = vi.fn(() => resolved());

  // act
  await bridge.applySelectedTrack(MISSING_TRACK_INDEX);

  // assert
  expect(bridge.selectedTrack).toBe(MISSING_TRACK_INDEX);
});

it("returns early when the token changes after the slot lookup", async () => {
  // arrange
  const { bridge } = await createBridge();
  const slotSpy = vi
    .spyOn(bridge, "handlePlayingSlot")
    .mockImplementation(() => resolved());
  const track = createLiveTrack({
    get: vi.fn((property: TrackProperty) => {
      if (property === "playing_slot_index") {
        bridge.selectedTrackToken += 1;
      }

      return resolved(
        property === "playing_slot_index" ? SLOT_LOOKUP_TRACK_INDEX : 1,
      );
    }),
    observe: vi.fn(() => resolved(createCleanupMock())),
  });
  bridge.access.getTrack = vi.fn(() => resolved(track));

  // act
  await bridge.applySelectedTrack(SLOT_LOOKUP_TRACK_INDEX);

  // assert
  expect(slotSpy).not.toHaveBeenCalled();
});

it("ignores observer callbacks after the selection changes", async () => {
  // arrange
  const { bridge } = await createBridge();
  const listeners = new Map<TrackProperty, Observer>();
  const track = createLiveTrack({
    get: vi.fn(() => resolved(1)),
    observe: vi.fn((property: TrackProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  bridge.access.getTrack = vi.fn(() => resolved(track));
  const slotSpy = vi
    .spyOn(bridge, "handlePlayingSlot")
    .mockImplementation(() => resolved());
  await bridge.applySelectedTrack(0);
  bridge.selectedTrack = OBSERVER_IGNORED_TRACK_INDEX;

  // act
  listeners.get("playing_slot_index")?.(OBSERVER_IGNORED_SLOT_INDEX);
  listeners.get("name")?.(OBSERVER_NAME_VALUE);
  listeners.get("color")?.("not-a-number");

  // assert
  expect(slotSpy).toHaveBeenCalledTimes(1);
  expect(bridge.trackName).toBe("1");
  expect(bridge.trackColor).toBe(1);
});
