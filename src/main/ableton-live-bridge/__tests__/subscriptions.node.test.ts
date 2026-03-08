import type {
  ClipProperty,
  LiveClip,
  SceneProperty,
} from "@main/ableton-live-bridge";
import type {
  BridgeRuntime,
  Observer,
} from "@main/ableton-live-bridge/__tests__/test-types";

import {
  createBridge,
  createCleanupMock,
  createLiveClip,
  createLiveClipSlot,
  createLiveScene,
  createLiveTrack,
  resetBridgeTestEnvironment,
  resolved,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { beforeEach, expect, it, vi } from "vitest";

const ACTIVE_CLIP_INDEX = 2;
const ACTIVE_SCENE_INDEX = 5;
const ACTIVE_TRACK_INDEX = 3;
const BASE_TOKEN = 9;
const CLIP_COLOR = 2;
const CLIP_END = 14;
const CLIP_LENGTH = 16;
const CLIP_LOOP_START = 2;
const CLIP_POSITION = 3;
const INITIAL_CLIP_COLOR = 1;
const INITIAL_CLIP_LENGTH = 8;
const INITIAL_CLIP_LOOP_END = 7;
const INITIAL_CLIP_NAME = "Clip A";
const INITIAL_CLIP_POSITION = 1.25;
const INITIAL_SCENE_COLOR = 16_711_680;
const INITIAL_SLOT_INDEX = 1;
const INITIAL_TRACK_INDEX = 0;
const LOOPING_DISABLED = 0;
const LOOPING_ENABLED = true;
const MISMATCHED_TRACK_INDEX = 7;
const PLAYING_SLOT_INDEX = 4;
const SCENE_COLOR = 3_355_443;
const STARTED_SLOT_TOKEN = 10;
const TOKEN_CHANGED_SLOT_TOKEN = 41;
const TOKEN_CHANGE_SCENE_INDEX = 4;
const TOKEN_CHANGE_TOKEN = 31;
const TOKEN_SHIFTED_CLIP_INDEX = 99;
const UPDATED_SCENE_COLOR = 16_711_680;

beforeEach(() => {
  resetBridgeTestEnvironment();
});

it("returns early from handlePlayingSlot when no track is selected", async () => {
  // arrange
  const { bridge } = await createBridge();
  const clearSpy = vi.spyOn(bridge, "clearClipSubscription");

  // act
  await bridge.handlePlayingSlot(1);

  // assert
  expect(clearSpy).not.toHaveBeenCalled();
});

it("clears clip state only for inactive slots when playback has stopped", async () => {
  // arrange
  const { bridge } = await createBridge();
  const clearSpy = vi.spyOn(bridge, "clearClipSubscription");
  const emitSpy = vi.spyOn(bridge, "emit");
  bridge.selectedTrack = ACTIVE_TRACK_INDEX;
  bridge.isPlaying = true;

  // act
  await bridge.handlePlayingSlot(-1);
  bridge.isPlaying = false;
  await bridge.handlePlayingSlot(-1);

  // assert
  expect(clearSpy).toHaveBeenCalledTimes(1);
  expect(emitSpy).toHaveBeenCalledTimes(1);
});

it("returns early from handlePlayingSlot when the active clip is unchanged", async () => {
  // arrange
  const { bridge } = await createBridge();
  const subscribeClipSpy = vi.spyOn(bridge, "subscribeClip");
  bridge.selectedTrack = ACTIVE_TRACK_INDEX;
  bridge.activeClip = { clip: ACTIVE_CLIP_INDEX, track: ACTIVE_TRACK_INDEX };

  // act
  await bridge.handlePlayingSlot(ACTIVE_CLIP_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});

it("loads and subscribes the active playing slot when a clip exists", async () => {
  // arrange
  const { bridge } = await createBridge();
  const clip = createLiveClip();
  const subscribeClipSpy = vi
    .spyOn(bridge, "subscribeClip")
    .mockImplementation(() => resolved());
  stubPlayableSlot(bridge, STARTED_SLOT_TOKEN, clip);

  // act
  await bridge.handlePlayingSlot(PLAYING_SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).toHaveBeenCalledWith(
    ACTIVE_TRACK_INDEX,
    PLAYING_SLOT_INDEX,
    clip,
    STARTED_SLOT_TOKEN,
  );
});

it("returns early when slot loading changes the selected track token", async () => {
  // arrange
  const { bridge } = await createBridge();
  const subscribeClipSpy = vi.spyOn(bridge, "subscribeClip");
  stubPlayableSlot(bridge, STARTED_SLOT_TOKEN, createLiveClip());
  bridge.access.getTrack = vi.fn(() => {
    bridge.selectedTrackToken += 1;
    return resolved(createLiveTrack());
  });

  // act
  await bridge.handlePlayingSlot(INITIAL_SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});

it("returns early when slot loading changes token after clip slot lookup", async () => {
  // arrange
  const { bridge } = await createBridge();
  const subscribeClipSpy = vi.spyOn(bridge, "subscribeClip");
  stubPlayableSlot(bridge, STARTED_SLOT_TOKEN, createLiveClip());
  bridge.access.safeTrackChild = vi.fn(() => {
    bridge.selectedTrackToken += 1;
    return resolved(createLiveClipSlot());
  });

  // act
  await bridge.handlePlayingSlot(INITIAL_SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});

it("returns early when slot loading finds no clip or changes token during clip checks", async () => {
  // arrange
  const { bridge } = await createBridge();
  const subscribeClipSpy = vi.spyOn(bridge, "subscribeClip");
  stubPlayableSlot(bridge, STARTED_SLOT_TOKEN, createLiveClip());

  // act
  bridge.access.safeClipSlotGet = vi.fn(() => resolved(false));
  await bridge.handlePlayingSlot(INITIAL_SLOT_INDEX);
  bridge.selectedTrackToken = STARTED_SLOT_TOKEN;
  stubPlayableSlot(bridge, STARTED_SLOT_TOKEN, createLiveClip());
  bridge.access.safeClipSlotGet = vi.fn(() => {
    bridge.selectedTrackToken += 1;
    return resolved(true);
  });
  await bridge.handlePlayingSlot(INITIAL_SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});

it("returns early when slot loading changes token after the clip resolves", async () => {
  // arrange
  const { bridge } = await createBridge();
  const subscribeClipSpy = vi.spyOn(bridge, "subscribeClip");
  stubPlayableSlot(bridge, TOKEN_CHANGED_SLOT_TOKEN, createLiveClip());
  bridge.access.safeClipSlotClip = vi.fn(() => {
    bridge.selectedTrackToken += 1;
    return resolved(createLiveClip());
  });

  // act
  await bridge.handlePlayingSlot(INITIAL_SLOT_INDEX);

  // assert
  expect(subscribeClipSpy).not.toHaveBeenCalled();
});

it("subscribes scene observers and applies scene updates", async () => {
  // arrange
  const { bridge } = await createBridge();
  const listeners = new Map<SceneProperty, Observer>();
  const scene = createLiveScene({
    get: vi.fn((property: SceneProperty) =>
      resolved(property === "name" ? "Verse" : INITIAL_SCENE_COLOR),
    ),
    observe: vi.fn((property: SceneProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  bridge.selectedTrackToken = BASE_TOKEN;
  bridge.activeScene = ACTIVE_SCENE_INDEX;
  bridge.access.safeSongSceneChild = vi.fn(() => resolved(scene));

  // act
  await bridge.subscribeScene(ACTIVE_SCENE_INDEX, BASE_TOKEN);
  listeners.get("name")?.("Chorus");
  listeners.get("color")?.(UPDATED_SCENE_COLOR);

  // assert
  expect(bridge.sceneName).toBe("Chorus");
  expect(bridge.sceneColor).toBe(UPDATED_SCENE_COLOR);
});

it("ignores scene updates after the active scene changes or the token shifts", async () => {
  // arrange
  const { bridge } = await createBridge();
  const listeners = new Map<SceneProperty, Observer>();
  const scene = createLiveScene({
    get: vi.fn((property: SceneProperty) => {
      if (property === "color") {
        bridge.selectedTrackToken += 1;
      }

      return resolved(property === "name" ? "Refrain" : SCENE_COLOR);
    }),
    observe: vi.fn((property: SceneProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  bridge.sceneName = "Existing Scene";
  bridge.sceneColor = INITIAL_SCENE_COLOR;
  bridge.selectedTrackToken = TOKEN_CHANGE_TOKEN;
  bridge.activeScene = TOKEN_CHANGE_SCENE_INDEX;
  bridge.access.safeSongSceneChild = vi.fn(() => resolved(scene));

  // act
  await bridge.subscribeScene(TOKEN_CHANGE_SCENE_INDEX, TOKEN_CHANGE_TOKEN);
  bridge.activeScene = ACTIVE_SCENE_INDEX;
  listeners.get("name")?.({ bad: true });
  listeners.get("color")?.(UPDATED_SCENE_COLOR);

  // assert
  expect(bridge.sceneName).toBe("Existing Scene");
  expect(bridge.sceneColor).toBe(INITIAL_SCENE_COLOR);
});

it("subscribes clip observers and applies clip updates", async () => {
  // arrange
  const { bridge } = await createBridge();
  const listeners = new Map<ClipProperty, Observer>();
  const clip = createLiveClip({
    get: vi.fn((property: ClipProperty) => {
      if (property === "playing_position") {
        return resolved(INITIAL_CLIP_POSITION);
      }

      if (property === "color") {
        return resolved(INITIAL_CLIP_COLOR);
      }

      if (property === "name") {
        return resolved(INITIAL_CLIP_NAME);
      }

      if (property === "length") {
        return resolved(INITIAL_CLIP_LENGTH);
      }

      if (property === "loop_start") {
        return resolved(1);
      }

      if (property === "loop_end") {
        return resolved(INITIAL_CLIP_LOOP_END);
      }

      return resolved(LOOPING_ENABLED);
    }),
    observe: vi.fn((property: ClipProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  bridge.activeClip = { clip: INITIAL_SLOT_INDEX, track: INITIAL_TRACK_INDEX };
  bridge.selectedTrackToken = BASE_TOKEN;

  // act
  await bridge.subscribeClip(
    INITIAL_TRACK_INDEX,
    INITIAL_SLOT_INDEX,
    clip,
    BASE_TOKEN,
  );
  listeners.get("name")?.("Clip B");
  listeners.get("color")?.(CLIP_COLOR);
  listeners.get("length")?.(CLIP_LENGTH);
  listeners.get("loop_start")?.(CLIP_LOOP_START);
  listeners.get("loop_end")?.(CLIP_END);
  listeners.get("looping")?.(LOOPING_DISABLED);
  listeners.get("playing_position")?.(CLIP_POSITION);

  // assert
  expect(bridge.clipName).toBe("Clip B");
  expect(bridge.clipColor).toBe(CLIP_COLOR);
  expect(bridge.clipMeta.length).toBe(CLIP_LENGTH);
  expect(bridge.clipMeta.loopStart).toBe(CLIP_LOOP_START);
  expect(bridge.clipMeta.loopEnd).toBe(CLIP_END);
  expect(bridge.clipMeta.looping).toBe(false);
});

it("returns early from subscribeClip when there is no active clip", async () => {
  // arrange
  const { bridge } = await createBridge();
  const clip = createLiveClip();
  const observeSpy = vi.spyOn(bridge.access, "safeClipObserve");
  const getSpy = vi.spyOn(bridge.access, "safeClipGet");

  // act
  await bridge.subscribeClip(
    INITIAL_TRACK_INDEX,
    INITIAL_SLOT_INDEX,
    clip,
    BASE_TOKEN,
  );

  // assert
  expect(observeSpy).not.toHaveBeenCalled();
  expect(getSpy).not.toHaveBeenCalled();
});

it("returns early from subscribeClip when the active clip does not match", async () => {
  // arrange
  const { bridge } = await createBridge();
  const clip = createLiveClip();
  const observeSpy = vi.spyOn(bridge.access, "safeClipObserve");
  const getSpy = vi.spyOn(bridge.access, "safeClipGet");
  bridge.activeClip = {
    clip: INITIAL_SLOT_INDEX,
    track: MISMATCHED_TRACK_INDEX,
  };

  // act
  await bridge.subscribeClip(
    INITIAL_TRACK_INDEX,
    INITIAL_SLOT_INDEX,
    clip,
    BASE_TOKEN,
  );

  // assert
  expect(observeSpy).not.toHaveBeenCalled();
  expect(getSpy).not.toHaveBeenCalled();
});

it("ignores clip updates after the active clip changes or the token shifts", async () => {
  // arrange
  const { bridge } = await createBridge();
  const listeners = new Map<ClipProperty, Observer>();
  const clip = createLiveClip({
    get: vi.fn((property: ClipProperty) => {
      if (property === "playing_position") {
        bridge.selectedTrackToken += 1;
      }

      if (property === "name") {
        return resolved({ bad: true });
      }

      return resolved(1);
    }),
    observe: vi.fn((property: ClipProperty, listener: Observer) => {
      listeners.set(property, listener);
      return resolved(createCleanupMock());
    }),
  });
  bridge.clipName = "Existing Clip";
  bridge.activeClip = { clip: INITIAL_SLOT_INDEX, track: INITIAL_TRACK_INDEX };
  bridge.selectedTrackToken = TOKEN_CHANGE_TOKEN;

  // act
  await bridge.subscribeClip(
    INITIAL_TRACK_INDEX,
    INITIAL_SLOT_INDEX,
    clip,
    TOKEN_CHANGE_TOKEN,
  );
  bridge.activeClip = {
    clip: TOKEN_SHIFTED_CLIP_INDEX,
    track: INITIAL_TRACK_INDEX,
  };
  listeners.get("name")?.("ignored");
  listeners.get("playing_position")?.(TOKEN_SHIFTED_CLIP_INDEX);
  listeners.get("color")?.("hello");

  // assert
  expect(bridge.clipName).toBe("Existing Clip");
});

/**
 * Wires a selected track and clip-slot chain for `handlePlayingSlot` tests.
 * @param bridge - The bridge under test.
 * @param token - The selected-track token to preserve.
 * @param clip - The clip returned from the mocked slot.
 */
function stubPlayableSlot(
  bridge: BridgeRuntime,
  token: number,
  clip: LiveClip,
): void {
  bridge.selectedTrack = ACTIVE_TRACK_INDEX;
  bridge.selectedTrackToken = token;
  bridge.access.getTrack = vi.fn(() => resolved(createLiveTrack()));
  bridge.access.safeTrackChild = vi.fn(() => resolved(createLiveClipSlot()));
  bridge.access.safeClipSlotGet = vi.fn(() => resolved(true));
  bridge.access.safeClipSlotClip = vi.fn(() => resolved(clip));
}
