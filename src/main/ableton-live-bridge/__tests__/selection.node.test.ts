import type { TrackProperty } from "@main/ableton-live-bridge";
import type { Observer } from "@main/ableton-live-bridge/__tests__/test-types";

import {
  createCleanupMock,
  createLiveTrack,
  createSession,
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
  const { session } = await createSession();
  session.access.safeSongTracks = vi.fn(() =>
    resolved([
      createLiveTrack({ id: PATH_TRACK_ID, path: "live_set tracks 3" }),
      createLiveTrack({ raw: { id: "77", path: "live_set tracks 11" } }),
    ]),
  );

  // act
  const directIdIndex = await session.resolveTrackIndex(PATH_TRACK_ID);
  const rawIdIndex = await session.resolveTrackIndex(RAW_PATH_TRACK_ID);
  const missingIdIndex = await session.resolveTrackIndex(UNKNOWN_TRACK_ID);
  const directPathIndex = await session.resolveTrackIndex({
    path: "live_set tracks 5",
  });
  const rawPathIndex = await session.resolveTrackIndex({
    raw: { path: "live_set tracks 6" },
  });
  const invalidPathIndex = await session.resolveTrackIndex({ path: "x y z" });

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
  const { session } = await createSession();
  const applySpy = vi
    .spyOn(session, "applySelectedTrack")
    .mockImplementation(() => resolved());
  session.selectedTrack = LOCKED_SELECTED_TRACK_INDEX;
  session.trackLocked = true;

  // act
  session.handleSelectedTrack(-1);
  session.handleSelectedTrack(LOCKED_SELECTED_TRACK_INDEX);
  session.handleSelectedTrack(PENDING_TRACK_INDEX);

  // assert
  expect(applySpy).toHaveBeenCalledWith(LOCKED_SELECTED_TRACK_INDEX);
  expect(session.pendingSelectedTrack).toBe(PENDING_TRACK_INDEX);
});

it("applies the selected track and wires observer updates", async () => {
  // arrange
  const { session } = await createSession();
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
  session.access.getTrack = vi.fn(() => resolved(track));
  const slotSpy = vi
    .spyOn(session, "handlePlayingSlot")
    .mockImplementation(() => resolved());

  // act
  await session.applySelectedTrack(UPDATED_TRACK_INDEX);
  listeners.get("name")?.("Lead");
  listeners.get("color")?.(MAX_RGB_COLOR);
  listeners.get("playing_slot_index")?.(NEXT_PLAYING_SLOT_INDEX);

  // assert
  expect(session.selectedTrack).toBe(UPDATED_TRACK_INDEX);
  expect(session.trackName).toBe("Lead");
  expect(session.trackColor).toBe(MAX_RGB_COLOR);
  expect(slotSpy).toHaveBeenCalledWith(INITIAL_PLAYING_SLOT_INDEX);
  expect(slotSpy).toHaveBeenCalledWith(NEXT_PLAYING_SLOT_INDEX);
  expect(session.trackObserverCleanups).toHaveLength(
    INITIAL_PLAYING_SLOT_INDEX,
  );
});

it("returns early when applySelectedTrack receives the current selection", async () => {
  // arrange
  const { session } = await createSession();
  const getTrackSpy = vi.spyOn(session.access, "getTrack");
  session.selectedTrack = CURRENT_TRACK_INDEX;

  // act
  await session.applySelectedTrack(CURRENT_TRACK_INDEX);

  // assert
  expect(getTrackSpy).not.toHaveBeenCalled();
});

it("returns early when the track token changes before the track resolves", async () => {
  // arrange
  const { session } = await createSession();
  const track = createLiveTrack();
  const trackGetSpy = vi.spyOn(session.access, "safeTrackGet");
  session.access.getTrack = vi.fn(() => {
    session.selectedTrackToken += 1;
    return resolved(track);
  });

  // act
  await session.applySelectedTrack(LOCKED_SELECTED_TRACK_INDEX);

  // assert
  expect(trackGetSpy).not.toHaveBeenCalled();
});

it("keeps the selected track when the resolved track is missing", async () => {
  // arrange
  const { session } = await createSession();
  session.access.getTrack = vi.fn(() => resolved());

  // act
  await session.applySelectedTrack(MISSING_TRACK_INDEX);

  // assert
  expect(session.selectedTrack).toBe(MISSING_TRACK_INDEX);
});

it("returns early when the token changes after the slot lookup", async () => {
  // arrange
  const { session } = await createSession();
  const slotSpy = vi
    .spyOn(session, "handlePlayingSlot")
    .mockImplementation(() => resolved());
  const track = createLiveTrack({
    get: vi.fn((property: TrackProperty) => {
      if (property === "playing_slot_index") {
        session.selectedTrackToken += 1;
      }

      return resolved(
        property === "playing_slot_index" ? SLOT_LOOKUP_TRACK_INDEX : 1,
      );
    }),
    observe: vi.fn(() => resolved(createCleanupMock())),
  });
  session.access.getTrack = vi.fn(() => resolved(track));

  // act
  await session.applySelectedTrack(SLOT_LOOKUP_TRACK_INDEX);

  // assert
  expect(slotSpy).not.toHaveBeenCalled();
});

it("returns early when the token changes during selected-track snapshot sync", async () => {
  // arrange
  const { session } = await createSession();
  const track = createLiveTrack({
    get: vi.fn((property: TrackProperty) => {
      if (property === "name") {
        session.selectedTrackToken += 1;
      }

      return resolved(
        property === "playing_slot_index" ? SLOT_LOOKUP_TRACK_INDEX : 1,
      );
    }),
    observe: vi.fn(() => resolved(createCleanupMock())),
  });
  session.access.getTrack = vi.fn(() => resolved(track));
  const observeSpy = vi.spyOn(session.access, "safeTrackObserve");
  const slotSpy = vi
    .spyOn(session, "handlePlayingSlot")
    .mockImplementation(() => resolved());

  // act
  await session.applySelectedTrack(UPDATED_TRACK_INDEX);

  // assert
  expect(observeSpy).not.toHaveBeenCalled();
  expect(slotSpy).not.toHaveBeenCalled();
});

it("returns early when the token changes during track observer registration", async () => {
  // arrange
  const { session } = await createSession();
  const track = createLiveTrack({
    get: vi.fn((property: TrackProperty) =>
      resolved(property === "playing_slot_index" ? SLOT_LOOKUP_TRACK_INDEX : 1),
    ),
    observe: vi.fn((property: TrackProperty) => {
      if (property === "color") {
        session.selectedTrackToken += 1;
      }

      return resolved(createCleanupMock());
    }),
  });
  session.access.getTrack = vi.fn(() => resolved(track));
  const slotSpy = vi
    .spyOn(session, "handlePlayingSlot")
    .mockImplementation(() => resolved());

  // act
  await session.applySelectedTrack(UPDATED_TRACK_INDEX);

  // assert
  expect(slotSpy).not.toHaveBeenCalled();
});

it("ignores observer callbacks after the selection changes", async () => {
  // arrange
  const { session } = await createSession();
  const listeners = new Map<TrackProperty, Observer>();
  const track = createLiveTrack({
    get: vi.fn(() => resolved(1)),
    observe: vi.fn((property: TrackProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  session.access.getTrack = vi.fn(() => resolved(track));
  const slotSpy = vi
    .spyOn(session, "handlePlayingSlot")
    .mockImplementation(() => resolved());
  await session.applySelectedTrack(0);
  session.selectedTrack = OBSERVER_IGNORED_TRACK_INDEX;

  // act
  listeners.get("playing_slot_index")?.(OBSERVER_IGNORED_SLOT_INDEX);
  listeners.get("name")?.(OBSERVER_NAME_VALUE);
  listeners.get("color")?.("not-a-number");

  // assert
  expect(slotSpy).toHaveBeenCalledTimes(1);
  expect(session.trackName).toBe("1");
  expect(session.trackColor).toBe(1);
});
