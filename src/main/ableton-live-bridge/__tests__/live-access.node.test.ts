import type { BridgeAccessRuntime } from "@main/ableton-live-bridge/__tests__/test-types";

import {
  createBridge,
  createCleanupMock,
  createLiveClip,
  createLiveClipSlot,
  createLiveScene,
  createLiveTrack,
  rejected,
  resetBridgeTestEnvironment,
  resolved,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { beforeEach, expect, it, vi } from "vitest";

const DIRECT_TRACK_ID = 42;
const DIRECT_TRACK_INDEX = 3;
const FALLBACK_TRACK_INDEX = 19;
const RAW_PATH_TRACK_INDEX = 6;
const RAW_TRACK_ID = 77;
const RAW_TRACK_INDEX = 11;
const SCENE_INDEX = 1;
const TRACK_INDEX = 5;
const TRACK_SLOT_INDEX = 4;

beforeEach(() => {
  resetBridgeTestEnvironment();
});

/**
 * Bundles invalid Live surfaces for guarded bridge-access assertions.
 */
interface RejectedAccessOptions {
  /** Guarded bridge access runtime under test. */
  access: BridgeAccessRuntime;
  /** Invalid clip surface used to probe guard behavior. */
  invalidClip: ReturnType<typeof createLiveClip>;
  /** Invalid clip-slot surface used to probe guard behavior. */
  invalidClipSlot: ReturnType<typeof createLiveClipSlot>;
  /** Invalid scene surface used to probe guard behavior. */
  invalidScene: ReturnType<typeof createLiveScene>;
  /** Invalid track surface used to probe guard behavior. */
  invalidTrack: ReturnType<typeof createLiveTrack>;
}

/**
 * Resolves the rejection-path access results used by the guarded Live-access test.
 * @param options - The access runtime and invalid Live surface fixtures.
 * @returns The normalized results for all guarded access calls.
 */
async function resolveRejectedAccessResults(options: RejectedAccessOptions) {
  const { access, invalidClip, invalidClipSlot, invalidScene, invalidTrack } =
    options;

  return {
    clipCleanup: await access.safeClipObserve(invalidClip, "name", vi.fn()),
    clipSlotClip: await access.safeClipSlotClip(invalidClipSlot),
    clipSlotValue: await access.safeClipSlotGet(invalidClipSlot, "has_clip"),
    clipValue: await access.safeClipGet(invalidClip, "name"),
    sceneCleanup: await access.safeSceneObserve(invalidScene, "name", vi.fn()),
    sceneValue: await access.safeSceneGet(invalidScene, "name"),
    songCleanup: await access.safeSongObserve("is_playing", vi.fn()),
    songScene: await access.safeSongSceneChild(SCENE_INDEX),
    songValue: await access.safeSongGet("is_playing"),
    songViewCleanup: await access.safeSongViewObserve(
      "selected_track",
      vi.fn(),
    ),
    songViewValue: await access.safeSongViewGet("selected_track"),
    track: await access.getTrack(TRACK_SLOT_INDEX),
    trackChild: await access.safeTrackChild(invalidTrack, TRACK_SLOT_INDEX),
    trackCleanup: await access.safeTrackObserve(invalidTrack, "name", vi.fn()),
    trackValue: await access.safeTrackGet(invalidTrack, "name"),
  };
}

it("resolves track references from ids and paths", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  harness.instance.song.children = vi.fn(() => {
    return resolved([
      createLiveTrack({
        id: DIRECT_TRACK_ID,
        path: "live_set tracks 3",
      }),
      createLiveTrack({
        raw: {
          id: String(RAW_TRACK_ID),
          path: "live_set tracks 11",
        },
      }),
    ]);
  });

  // act
  const directIdIndex = await bridge.access.resolveTrackIndex(DIRECT_TRACK_ID);
  const rawIdIndex = await bridge.access.resolveTrackIndex(RAW_TRACK_ID);
  const fallbackIndex =
    await bridge.access.resolveTrackIndex(FALLBACK_TRACK_INDEX);
  const directPathIndex = await bridge.access.resolveTrackIndex({
    path: "live_set tracks 5",
  });
  const rawPathIndex = await bridge.access.resolveTrackIndex({
    raw: { path: "live_set tracks 6" },
  });
  const invalidPathIndex = await bridge.access.resolveTrackIndex({
    path: "x y z",
  });

  // assert
  expect(directIdIndex).toBe(DIRECT_TRACK_INDEX);
  expect(rawIdIndex).toBe(RAW_TRACK_INDEX);
  expect(fallbackIndex).toBe(FALLBACK_TRACK_INDEX);
  expect(directPathIndex).toBe(TRACK_INDEX);
  expect(rawPathIndex).toBe(RAW_PATH_TRACK_INDEX);
  expect(invalidPathIndex).toBe(-1);
});

it("filters invalid Live surface shapes and non-function cleanups", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  harness.instance.song.child = vi.fn((child: "scenes" | "tracks") => {
    if (child === "tracks") {
      return resolved({ bad: true });
    }

    return resolved({ get: vi.fn(() => resolved("x")) });
  });
  harness.instance.song.children = vi.fn(() => {
    return resolved([createLiveTrack(), { bad: true }]);
  });
  const invalidClip = createLiveClip({
    observe: vi.fn(() => resolved("noop")),
  });
  const invalidClipSlot = createLiveClipSlot({
    clip: vi.fn(() => resolved({ bad: true })),
  });
  const invalidScene = createLiveScene({
    observe: vi.fn(() => resolved("noop")),
  });
  const invalidTrack = createLiveTrack({
    child: vi.fn(() => resolved({ bad: true })),
    observe: vi.fn(() => resolved("noop")),
  });

  // act
  const track = await bridge.access.getTrack(TRACK_SLOT_INDEX);
  const clipCleanup = await bridge.access.safeClipObserve(
    invalidClip,
    "name",
    vi.fn(),
  );
  const clipSlotClip = await bridge.access.safeClipSlotClip(invalidClipSlot);
  const sceneCleanup = await bridge.access.safeSceneObserve(
    invalidScene,
    "name",
    vi.fn(),
  );
  const songScene = await bridge.access.safeSongSceneChild(SCENE_INDEX);
  const songTracks = await bridge.access.safeSongTracks();
  const trackChild = await bridge.access.safeTrackChild(
    invalidTrack,
    TRACK_SLOT_INDEX,
  );
  const trackCleanup = await bridge.access.safeTrackObserve(
    invalidTrack,
    "name",
    vi.fn(),
  );

  // assert
  expect(track).toBeUndefined();
  expect(clipCleanup).toBeUndefined();
  expect(clipSlotClip).toBeUndefined();
  expect(sceneCleanup).toBeUndefined();
  expect(songScene).toBeUndefined();
  expect(songTracks).toHaveLength(1);
  expect(trackChild).toBeUndefined();
  expect(trackCleanup).toBeUndefined();
});

it("returns undefined when song-level Live calls reject", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  harness.instance.song.child = vi.fn((child: "scenes" | "tracks") => {
    return rejected(
      new Error(child === "tracks" ? "track failure" : "scene failure"),
    );
  });
  harness.instance.song.get = vi.fn(() =>
    rejected(new Error("song-get failure")),
  );
  harness.instance.song.observe = vi.fn(() =>
    rejected(new Error("song-observe failure")),
  );
  harness.instance.songView.get = vi.fn(() =>
    rejected(new Error("song-view-get failure")),
  );
  harness.instance.songView.observe = vi.fn(() => {
    return rejected(new Error("song-view-observe failure"));
  });
  const invalidTrack = createLiveTrack();

  // act
  const track = await bridge.access.getTrack(TRACK_SLOT_INDEX);
  const songCleanup = await bridge.access.safeSongObserve(
    "is_playing",
    vi.fn(),
  );
  const songScene = await bridge.access.safeSongSceneChild(SCENE_INDEX);
  const songValue = await bridge.access.safeSongGet("is_playing");
  const songViewCleanup = await bridge.access.safeSongViewObserve(
    "selected_track",
    vi.fn(),
  );
  const songViewValue = await bridge.access.safeSongViewGet("selected_track");
  const trackChild = await bridge.access.safeTrackChild(
    invalidTrack,
    TRACK_SLOT_INDEX,
  );

  // assert
  expect(track).toBeUndefined();
  expect(songCleanup).toBeUndefined();
  expect(songScene).toBeUndefined();
  expect(songValue).toBeUndefined();
  expect(songViewCleanup).toBeUndefined();
  expect(songViewValue).toBeUndefined();
  expect(trackChild).toBeUndefined();
});

it("returns undefined when clip, scene, and track Live calls reject", async () => {
  // arrange
  const { bridge } = await createBridge();
  const invalidClip = createLiveClip({
    get: vi.fn(() => rejected(new Error("clip-get failure"))),
    observe: vi.fn(() => rejected(new Error("clip-observe failure"))),
  });
  const invalidClipSlot = createLiveClipSlot({
    clip: vi.fn(() => rejected(new Error("clip-slot-clip failure"))),
    get: vi.fn(() => rejected(new Error("clip-slot-get failure"))),
  });
  const invalidScene = createLiveScene({
    get: vi.fn(() => rejected(new Error("scene-get failure"))),
    observe: vi.fn(() => rejected(new Error("scene-observe failure"))),
  });
  const invalidTrack = createLiveTrack({
    child: vi.fn(() => rejected(new Error("track-child failure"))),
    get: vi.fn(() => rejected(new Error("track-get failure"))),
    observe: vi.fn(() => rejected(new Error("track-observe failure"))),
  });

  // act
  const {
    clipCleanup,
    clipSlotClip,
    clipSlotValue,
    clipValue,
    sceneCleanup,
    sceneValue,
    trackCleanup,
    trackValue,
  } = await resolveRejectedAccessResults({
    access: bridge.access,
    invalidClip,
    invalidClipSlot,
    invalidScene,
    invalidTrack,
  });

  // assert
  expect(clipValue).toBeUndefined();
  expect(clipCleanup).toBeUndefined();
  expect(clipSlotClip).toBeUndefined();
  expect(clipSlotValue).toBeUndefined();
  expect(sceneValue).toBeUndefined();
  expect(sceneCleanup).toBeUndefined();
  expect(trackValue).toBeUndefined();
  expect(trackCleanup).toBeUndefined();
});

it("returns valid guarded values when the Live surfaces match the expected shape", async () => {
  // arrange
  const { bridge, harness } = await createBridge();
  const cleanup = createCleanupMock();
  const clip = createLiveClip({
    get: vi.fn(() => resolved("Clip")),
    observe: vi.fn(() => resolved(cleanup)),
  });
  const clipSlot = createLiveClipSlot({
    clip: vi.fn(() => resolved(clip)),
    get: vi.fn(() => resolved(true)),
  });
  const scene = createLiveScene({
    get: vi.fn(() => resolved("Scene")),
    observe: vi.fn(() => resolved(cleanup)),
  });
  const track = createLiveTrack({
    child: vi.fn(() => resolved(clipSlot)),
    get: vi.fn(() => resolved("Track")),
    observe: vi.fn(() => resolved(cleanup)),
  });
  harness.instance.song.child = vi.fn((child: "scenes" | "tracks") => {
    return resolved(child === "scenes" ? scene : track);
  });
  harness.instance.song.children = vi.fn(() => resolved([track]));
  harness.instance.song.observe = vi.fn(() => resolved(cleanup));
  harness.instance.songView.observe = vi.fn(() => resolved(cleanup));

  // act
  const resolvedTrack = await bridge.access.getTrack(SCENE_INDEX);
  const clipCleanup = await bridge.access.safeClipObserve(
    clip,
    "name",
    vi.fn(),
  );
  const resolvedClip = await bridge.access.safeClipSlotClip(clipSlot);
  const sceneCleanup = await bridge.access.safeSceneObserve(
    scene,
    "name",
    vi.fn(),
  );
  const songCleanup = await bridge.access.safeSongObserve(
    "is_playing",
    vi.fn(),
  );
  const resolvedScene = await bridge.access.safeSongSceneChild(SCENE_INDEX);
  const resolvedTracks = await bridge.access.safeSongTracks();
  const songViewCleanup = await bridge.access.safeSongViewObserve(
    "selected_track",
    vi.fn(),
  );
  const resolvedTrackChild = await bridge.access.safeTrackChild(
    track,
    TRACK_SLOT_INDEX,
  );
  const trackCleanup = await bridge.access.safeTrackObserve(
    track,
    "name",
    vi.fn(),
  );

  // assert
  expect(resolvedTrack).toBe(track);
  expect(clipCleanup).toBe(cleanup);
  expect(resolvedClip).toBe(clip);
  expect(sceneCleanup).toBe(cleanup);
  expect(songCleanup).toBe(cleanup);
  expect(resolvedScene).toBe(scene);
  expect(resolvedTracks).toEqual([track]);
  expect(songViewCleanup).toBe(cleanup);
  expect(resolvedTrackChild).toBe(clipSlot);
  expect(trackCleanup).toBe(cleanup);
});
