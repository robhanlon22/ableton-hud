import { defaultPayloadNormalizers } from "@main/ableton-live-bridge";
import {
  createCleanupMock,
  createLiveClip,
  createLiveClipSlot,
  createLiveScene,
  createLiveTrack,
  rejected,
  resetBridgeTestEnvironment,
  resolved,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { LiveBridgeAccess } from "@main/ableton-live-bridge/live-access";
import { beforeEach, expect, it, vi } from "vitest";

const CLIP_SLOT_INDEX = 4;
const MATCHED_TRACK_ID = 42;
const MATCHED_TRACK_INDEX = 6;
const MATCHED_TRACK_PATH = "live_set tracks 6";
const RAW_TRACK_ID = 77;
const RAW_TRACK_INDEX = 8;
const RAW_TRACK_PATH = "live_set tracks 8";
const FALLBACK_TRACK_ID = 99;
const DIRECT_PATH_INDEX = 3;
const DIRECT_PATH = "live_set tracks 3";
const INVALID_PATH = "devices 2";
const CLIP_COLOR = 255;
const SONG_SCENE_INDEX = 2;

beforeEach(() => {
  resetBridgeTestEnvironment();
});

interface InvalidAccessOptions {
  access: LiveBridgeAccess;
  invalidClip: ReturnType<typeof createLiveClip>;
  invalidClipSlot: ReturnType<typeof createLiveClipSlot>;
  invalidScene: ReturnType<typeof createLiveScene>;
  invalidTrack: ReturnType<typeof createLiveTrack>;
}

/**
 * Resolves the invalid-access probe results used by the rejection-path test.
 * @param options - The access runtime and invalid Live surface fixtures.
 * @returns The normalized results for all guarded access calls.
 */
async function resolveInvalidAccessResults(options: InvalidAccessOptions) {
  const { access, invalidClip, invalidClipSlot, invalidScene, invalidTrack } =
    options;

  return {
    clipCleanup: await access.safeClipObserve(invalidClip, "name", vi.fn()),
    clipSlotValue: await access.safeClipSlotGet(invalidClipSlot, "has_clip"),
    clipValue: await access.safeClipGet(invalidClip, "color"),
    clipValueFromSlot: await access.safeClipSlotClip(invalidClipSlot),
    missingScene: await access.safeSongSceneChild(SONG_SCENE_INDEX),
    missingTrack: await access.getTrack(1),
    sceneCleanup: await access.safeSceneObserve(invalidScene, "name", vi.fn()),
    sceneValue: await access.safeSceneGet(invalidScene, "name"),
    songCleanup: await access.safeSongObserve("is_playing", vi.fn()),
    songValue: await access.safeSongGet("is_playing"),
    songViewCleanup: await access.safeSongViewObserve(
      "selected_track",
      vi.fn(),
    ),
    songViewValue: await access.safeSongViewGet("selected_track"),
    trackChild: await access.safeTrackChild(invalidTrack, CLIP_SLOT_INDEX),
    trackCleanup: await access.safeTrackObserve(invalidTrack, "name", vi.fn()),
    trackList: await access.safeSongTracks(),
    trackValue: await access.safeTrackGet(invalidTrack, "name"),
  };
}

it("returns typed Live surfaces and values from valid accessors", async () => {
  // arrange
  const cleanup = createCleanupMock();
  const clip = createLiveClip({
    get: vi.fn(() => resolved(CLIP_COLOR)),
    observe: vi.fn(() => resolved(cleanup)),
  });
  const clipSlot = createLiveClipSlot({
    clip: vi.fn(() => resolved(clip)),
    get: vi.fn(() => resolved(true)),
  });
  const scene = createLiveScene({
    get: vi.fn(() => resolved("Scene A")),
    observe: vi.fn(() => resolved(cleanup)),
  });
  const track = createLiveTrack({
    child: vi.fn(() => resolved(clipSlot)),
    get: vi.fn(() => resolved("Track A")),
    observe: vi.fn(() => resolved(cleanup)),
  });
  const song = {
    child: vi.fn((child: "scenes" | "tracks") => {
      return resolved(child === "tracks" ? track : scene);
    }),
    children: vi.fn(() => resolved([track, { bad: true }])),
    get: vi.fn(() => resolved("true")),
    observe: vi.fn(() => resolved(cleanup)),
  };
  const songView = {
    get: vi.fn(() => resolved({ path: DIRECT_PATH })),
    observe: vi.fn(() => resolved(cleanup)),
  };
  const access = new LiveBridgeAccess(
    song,
    songView,
    defaultPayloadNormalizers,
  );

  // act
  const resolvedTrack = await access.getTrack(1);
  const resolvedClipSlot = await access.safeTrackChild(track, CLIP_SLOT_INDEX);
  const resolvedClip = await access.safeClipSlotClip(clipSlot);
  const resolvedScene = await access.safeSongSceneChild(SONG_SCENE_INDEX);
  const resolvedTracks = await access.safeSongTracks();
  const trackValue = await access.safeTrackGet(track, "name");
  const clipValue = await access.safeClipGet(clip, "color");
  const sceneValue = await access.safeSceneGet(scene, "name");
  const songValue = await access.safeSongGet("is_playing");
  const songViewValue = await access.safeSongViewGet("selected_track");
  const clipCleanup = await access.safeClipObserve(clip, "name", vi.fn());
  const sceneCleanup = await access.safeSceneObserve(scene, "name", vi.fn());
  const songCleanup = await access.safeSongObserve("is_playing", vi.fn());
  const songViewCleanup = await access.safeSongViewObserve(
    "selected_track",
    vi.fn(),
  );
  const trackCleanup = await access.safeTrackObserve(track, "name", vi.fn());

  // assert
  expect(resolvedTrack).toBe(track);
  expect(resolvedClipSlot).toBe(clipSlot);
  expect(resolvedClip).toBe(clip);
  expect(resolvedScene).toBe(scene);
  expect(resolvedTracks).toEqual([track]);
  expect(trackValue).toBe("Track A");
  expect(clipValue).toBe(CLIP_COLOR);
  expect(sceneValue).toBe("Scene A");
  expect(songValue).toBe("true");
  expect(songViewValue).toEqual({ path: DIRECT_PATH });
  expect(clipCleanup).toBe(cleanup);
  expect(sceneCleanup).toBe(cleanup);
  expect(songCleanup).toBe(cleanup);
  expect(songViewCleanup).toBe(cleanup);
  expect(trackCleanup).toBe(cleanup);
});

it("normalizes invalid payloads to undefined or empty collections", async () => {
  // arrange
  const invalidTrack = createLiveTrack({
    child: vi.fn(() => resolved({ bad: true })),
    get: vi.fn(() => resolved("Track B")),
    observe: vi.fn(() => resolved("noop")),
  });
  const invalidClip = createLiveClip({
    get: vi.fn(() => resolved("invalid")),
    observe: vi.fn(() => resolved("noop")),
  });
  const invalidScene = createLiveScene({
    get: vi.fn(() => resolved("Scene B")),
    observe: vi.fn(() => resolved("noop")),
  });
  const invalidClipSlot = createLiveClipSlot({
    clip: vi.fn(() => resolved({ bad: true })),
    get: vi.fn(() => resolved("invalid")),
  });
  const song = {
    child: vi.fn(() => resolved({ bad: true })),
    children: vi.fn(() => resolved("not-an-array")),
    get: vi.fn(() => resolved("true")),
    observe: vi.fn(() => resolved("noop")),
  };
  const songView = {
    get: vi.fn(() => resolved({ bad: true })),
    observe: vi.fn(() => resolved("noop")),
  };
  const access = new LiveBridgeAccess(
    song,
    songView,
    defaultPayloadNormalizers,
  );

  // act
  const {
    clipCleanup,
    clipSlotValue,
    clipValue,
    clipValueFromSlot,
    missingScene,
    missingTrack,
    sceneCleanup,
    sceneValue,
    songCleanup,
    songValue,
    songViewCleanup,
    songViewValue,
    trackChild,
    trackCleanup,
    trackList,
    trackValue,
  } = await resolveInvalidAccessResults({
    access,
    invalidClip,
    invalidClipSlot,
    invalidScene,
    invalidTrack,
  });

  // assert
  expect(missingTrack).toBeUndefined();
  expect(missingScene).toBeUndefined();
  expect(trackList).toEqual([]);
  expect(clipCleanup).toBeUndefined();
  expect(clipValueFromSlot).toBeUndefined();
  expect(sceneCleanup).toBeUndefined();
  expect(songCleanup).toBeUndefined();
  expect(songViewCleanup).toBeUndefined();
  expect(trackChild).toBeUndefined();
  expect(trackCleanup).toBeUndefined();
  expect(clipValue).toBe("invalid");
  expect(clipSlotValue).toBe("invalid");
  expect(sceneValue).toBe("Scene B");
  expect(songValue).toBe("true");
  expect(songViewValue).toEqual({ bad: true });
  expect(trackValue).toBe("Track B");
});

it("normalizes rejected accessors to undefined", async () => {
  // arrange
  const rejectedTrack = createLiveTrack({
    child: vi.fn(() => rejected(new Error("track-child"))),
    get: vi.fn(() => rejected(new Error("track-get"))),
    observe: vi.fn(() => rejected(new Error("track-observe"))),
  });
  const rejectedClip = createLiveClip({
    get: vi.fn(() => rejected(new Error("clip-get"))),
    observe: vi.fn(() => rejected(new Error("clip-observe"))),
  });
  const rejectedScene = createLiveScene({
    get: vi.fn(() => rejected(new Error("scene-get"))),
    observe: vi.fn(() => rejected(new Error("scene-observe"))),
  });
  const rejectedClipSlot = createLiveClipSlot({
    clip: vi.fn(() => rejected(new Error("clip-slot"))),
    get: vi.fn(() => rejected(new Error("clip-slot-get"))),
  });
  const song = {
    child: vi.fn(() => rejected(new Error("song-child"))),
    children: vi.fn(() => rejected(new Error("song-children"))),
    get: vi.fn(() => rejected(new Error("song-get"))),
    observe: vi.fn(() => rejected(new Error("song-observe"))),
  };
  const songView = {
    get: vi.fn(() => rejected(new Error("song-view-get"))),
    observe: vi.fn(() => rejected(new Error("song-view-observe"))),
  };
  const access = new LiveBridgeAccess(
    song,
    songView,
    defaultPayloadNormalizers,
  );

  // act
  const {
    clipCleanup,
    clipSlotValue,
    clipValue,
    clipValueFromSlot,
    missingScene,
    missingTrack,
    sceneCleanup,
    sceneValue,
    songCleanup,
    songValue,
    songViewCleanup,
    songViewValue,
    trackChild,
    trackCleanup,
    trackList,
    trackValue,
  } = await resolveInvalidAccessResults({
    access,
    invalidClip: rejectedClip,
    invalidClipSlot: rejectedClipSlot,
    invalidScene: rejectedScene,
    invalidTrack: rejectedTrack,
  });

  // assert
  expect(missingTrack).toBeUndefined();
  expect(missingScene).toBeUndefined();
  expect(trackList).toEqual([]);
  expect(clipValue).toBeUndefined();
  expect(clipCleanup).toBeUndefined();
  expect(clipSlotValue).toBeUndefined();
  expect(clipValueFromSlot).toBeUndefined();
  expect(sceneValue).toBeUndefined();
  expect(sceneCleanup).toBeUndefined();
  expect(songValue).toBeUndefined();
  expect(songCleanup).toBeUndefined();
  expect(songViewValue).toBeUndefined();
  expect(songViewCleanup).toBeUndefined();
  expect(trackChild).toBeUndefined();
  expect(trackValue).toBeUndefined();
  expect(trackCleanup).toBeUndefined();
});

it("resolves direct ids, raw ids, parsed paths, and fallbacks", async () => {
  // arrange
  const matchedTrack = createLiveTrack({
    id: MATCHED_TRACK_ID,
    path: MATCHED_TRACK_PATH,
  });
  const rawTrack = createLiveTrack({
    raw: {
      id: String(RAW_TRACK_ID),
      path: RAW_TRACK_PATH,
    },
  });
  const unmatchedTrack = createLiveTrack({
    id: FALLBACK_TRACK_ID,
    path: INVALID_PATH,
  });
  const song = {
    child: vi.fn(() => Promise.resolve()),
    children: vi.fn(() => resolved([matchedTrack, rawTrack, unmatchedTrack])),
    get: vi.fn(() => Promise.resolve()),
    observe: vi.fn(() => Promise.resolve()),
  };
  const songView = {
    get: vi.fn(() => Promise.resolve()),
    observe: vi.fn(() => Promise.resolve()),
  };
  const access = new LiveBridgeAccess(
    song,
    songView,
    defaultPayloadNormalizers,
  );

  // act
  const matchedTrackIndex = await access.resolveTrackIndex(MATCHED_TRACK_ID);
  const rawTrackIndex = await access.resolveTrackIndex(RAW_TRACK_ID);
  const unmatchedTrackIndex = await access.resolveTrackIndex(FALLBACK_TRACK_ID);
  const directPathIndex = await access.resolveTrackIndex({ path: DIRECT_PATH });
  const invalidPathIndex = await access.resolveTrackIndex({
    path: INVALID_PATH,
  });

  // assert
  expect(matchedTrackIndex).toBe(MATCHED_TRACK_INDEX);
  expect(rawTrackIndex).toBe(RAW_TRACK_INDEX);
  expect(unmatchedTrackIndex).toBe(FALLBACK_TRACK_ID);
  expect(directPathIndex).toBe(DIRECT_PATH_INDEX);
  expect(invalidPathIndex).toBe(-1);
});
