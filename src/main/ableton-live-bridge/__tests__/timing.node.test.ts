import type { SongProperty } from "@main/ableton-live-bridge";
import type { Observer } from "@main/ableton-live-bridge/__tests__/test-types";

import {
  createCleanupMock,
  createSession,
  flushMicrotasks,
  resetBridgeTestEnvironment,
  resolved,
} from "@main/ableton-live-bridge/__tests__/test-support";
import { beforeEach, expect, it, vi } from "vitest";

const ACTIVE_TRACK_INDEX = 3;
const BOOTSTRAP_DENOMINATOR = 8;
const BOOTSTRAP_EPOCH_AFTER_LOOKUP = 4;
const BOOTSTRAP_EPOCH_AFTER_RESOLUTION = 8;
const BOOTSTRAP_NUMERATOR = 7;
const CLIP_LENGTH = 16;
const CURRENT_POSITION = 3.5;
const FIRST_SONG_TIME = 0.2;
const FOLLOW_UP_SONG_TIME = 14.2;
const INITIAL_CLIP_LENGTH = 8;
const INITIAL_SELECTED_TRACK = 2;
const LOOP_END = 4;
const LOOP_START = 2;
const NEXT_SONG_TIME = 0.4;
const NON_NATURAL_RESET_POSITION = 0.1;
const SECOND_BOOTSTRAP_TRACK = 5;
const SECOND_CLIP_LOOP_END = 8;
const SECOND_LOOP_POSITION = 1.2;
const SMALL_CLIP_END = 2;
const THIRD_SONG_TIME = 1.05;
const TRACKING_SONG_TIME = 12.2;
const UNCHANGED_BEAT_SONG_TIME = 1.2;
const UPDATED_DENOMINATOR = 16;
const UPDATED_NUMERATOR = 9;

beforeEach(() => {
  resetBridgeTestEnvironment();
});

it("tracks song time and clip position through natural and non-natural wraps", async () => {
  // arrange
  const { session: bridge } = await createSession();

  // act
  const firstSongTimeChanged = bridge.handleSongTime(FIRST_SONG_TIME);
  const nextSongTimeChanged = bridge.handleSongTime(NEXT_SONG_TIME);
  const thirdSongTimeChanged = bridge.handleSongTime(THIRD_SONG_TIME);
  bridge.clipMeta = {
    length: INITIAL_CLIP_LENGTH,
    loopEnd: LOOP_END,
    looping: true,
    loopStart: 1,
  };
  bridge.handlePlayingPosition(ACTIVE_TRACK_INDEX);
  bridge.handlePlayingPosition(SECOND_LOOP_POSITION);
  bridge.handlePlayingPosition(NON_NATURAL_RESET_POSITION);
  bridge.clipMeta = {
    length: INITIAL_CLIP_LENGTH,
    loopEnd: 1,
    looping: false,
    loopStart: 1,
  };

  // assert
  expect(firstSongTimeChanged).toBe(false);
  expect(nextSongTimeChanged).toBe(false);
  expect(thirdSongTimeChanged).toBe(true);
  expect(bridge.beatCounter).toBe(1);
  expect(bridge.beatFlashToken).toBe(1);
  expect(bridge.loopWrapCount).toBe(0);
  expect(bridge.isNaturalLoopWrap(ACTIVE_TRACK_INDEX, 1)).toBe(false);
});

it("emits song-time updates only when the beat-derived HUD state changes", async () => {
  // arrange
  const { onState, session: bridge } = await createSession();
  const songListeners = new Map<SongProperty, Observer>();
  bridge.access.safeSongObserve = vi.fn(
    (property: SongProperty, listener: Observer) => {
      songListeners.set(property, listener);
      return resolved(createCleanupMock());
    },
  );
  bridge.access.safeSongViewObserve = vi.fn(() =>
    resolved(createCleanupMock()),
  );
  bridge.access.safeSongGet = vi.fn((property: SongProperty) => {
    if (property === "signature_numerator") {
      return resolved(BOOTSTRAP_NUMERATOR);
    }

    if (property === "signature_denominator") {
      return resolved(BOOTSTRAP_DENOMINATOR);
    }

    if (property === "is_playing") {
      return resolved(true);
    }

    return resolved(FIRST_SONG_TIME);
  });
  bridge.access.safeSongViewGet = vi.fn(() => resolved(INITIAL_SELECTED_TRACK));
  vi.spyOn(bridge, "handleSelectedTrack").mockImplementation(
    /**
     *
     */
    function noop() {
      return;
    },
  );
  bridge.started = true;

  // act
  await bridge.bootstrap();
  onState.mockClear();
  songListeners.get("current_song_time")?.(NEXT_SONG_TIME);
  songListeners.get("current_song_time")?.(THIRD_SONG_TIME);
  songListeners.get("current_song_time")?.(UNCHANGED_BEAT_SONG_TIME);

  // assert
  expect(onState).toHaveBeenCalledTimes(1);
  expect(bridge.beatCounter).toBe(1);
  expect(bridge.beatFlashToken).toBe(1);
});

it("skips emit while a transition is in progress", async () => {
  // arrange
  const { onState, session: bridge } = await createSession();
  bridge.transitionInProgress = true;

  // act
  bridge.emit();

  // assert
  expect(onState).not.toHaveBeenCalled();
});

it("reports loop-end and clip-end HUD state", async () => {
  // arrange
  const { onState, session: bridge } = await createSession();
  bridge.connected = true;
  bridge.isPlaying = true;
  bridge.sceneColor = 0;
  bridge.sceneName = "Scene";
  bridge.trackName = "Track";
  bridge.trackColor = 123;
  bridge.activeClip = { clip: 1, track: INITIAL_SELECTED_TRACK };
  bridge.clipName = "Clip";
  bridge.clipColor = 456;
  bridge.currentPosition = CURRENT_POSITION;
  bridge.launchPosition = 0;
  bridge.mode = "elapsed";
  bridge.clipMeta = {
    length: CLIP_LENGTH,
    loopEnd: LOOP_END,
    looping: true,
    loopStart: LOOP_START,
  };

  // act
  bridge.emit();
  bridge.mode = "remaining";
  bridge.clipMeta.loopEnd = SECOND_CLIP_LOOP_END;
  bridge.currentPosition = 1.5;
  bridge.launchPosition = undefined;
  bridge.emit();
  bridge.clipMeta = {
    length: LOOP_END,
    loopEnd: SMALL_CLIP_END,
    looping: true,
    loopStart: SMALL_CLIP_END,
  };
  bridge.currentPosition = 3.25;
  bridge.emit();

  // assert
  expect(onState.mock.lastCall?.[0].lastBarSource).toBe("clip_end");
  expect(onState.mock.lastCall?.[0].sceneColor).toBeUndefined();
  expect(onState.mock.lastCall?.[0].trackIndex).toBe(INITIAL_SELECTED_TRACK);
});

it("bootstraps observers and applies callback updates", async () => {
  // arrange
  const { session: bridge } = await createSession();
  const songListeners = new Map<SongProperty, Observer>();
  let selectedTrackListener: Observer | undefined;
  bridge.access.safeSongObserve = vi.fn(
    (property: SongProperty, listener: Observer) => {
      songListeners.set(property, listener);
      return resolved(createCleanupMock());
    },
  );
  bridge.access.safeSongViewObserve = vi.fn((_, listener: Observer) => {
    selectedTrackListener = listener;
    return resolved(createCleanupMock());
  });
  bridge.access.safeSongGet = vi.fn((property: SongProperty) => {
    if (property === "signature_numerator") {
      return resolved(BOOTSTRAP_NUMERATOR);
    }

    if (property === "signature_denominator") {
      return resolved(BOOTSTRAP_DENOMINATOR);
    }

    if (property === "is_playing") {
      return resolved("true");
    }

    return resolved(TRACKING_SONG_TIME);
  });
  bridge.access.safeSongViewGet = vi.fn(() =>
    resolved({ path: "live_set tracks 2" }),
  );
  bridge.started = true;
  const selectedTrackSpy = vi.spyOn(bridge, "handleSelectedTrack");

  // act
  await bridge.bootstrap();
  selectedTrackListener?.({ path: "live_set tracks 5" });
  await flushMicrotasks();
  songListeners.get("signature_numerator")?.(UPDATED_NUMERATOR);
  songListeners.get("signature_denominator")?.(UPDATED_DENOMINATOR);
  songListeners.get("is_playing")?.("1");
  songListeners.get("current_song_time")?.(FOLLOW_UP_SONG_TIME);

  // assert
  expect(selectedTrackSpy).toHaveBeenCalledWith(INITIAL_SELECTED_TRACK);
  expect(selectedTrackSpy).toHaveBeenCalledWith(SECOND_BOOTSTRAP_TRACK);
  expect(bridge.signatureNumerator).toBe(UPDATED_NUMERATOR);
  expect(bridge.signatureDenominator).toBe(UPDATED_DENOMINATOR);
  expect(bridge.isPlaying).toBe(true);
});

it("returns early from bootstrap when the epoch changes after selected-track lookup", async () => {
  // arrange
  const { session: bridge } = await createSession();
  bridge.started = true;
  bridge.connectionEpoch = BOOTSTRAP_EPOCH_AFTER_LOOKUP;
  bridge.access.safeSongGet = vi.fn((property: SongProperty) => {
    if (property === "signature_numerator") {
      return resolved(BOOTSTRAP_NUMERATOR);
    }

    if (property === "signature_denominator") {
      return resolved(BOOTSTRAP_DENOMINATOR);
    }

    if (property === "is_playing") {
      return resolved(true);
    }

    return resolved(TRACKING_SONG_TIME);
  });
  bridge.access.safeSongViewGet = vi.fn(() => {
    bridge.connectionEpoch += 1;
    return resolved({ path: "live_set tracks 2" });
  });
  const selectedTrackSpy = vi.spyOn(bridge, "handleSelectedTrack");

  // act
  await bridge.bootstrap(BOOTSTRAP_EPOCH_AFTER_LOOKUP);

  // assert
  expect(selectedTrackSpy).not.toHaveBeenCalled();
});

it("returns early from bootstrap when the epoch changes during selected-track resolution", async () => {
  // arrange
  const { session: bridge } = await createSession();
  bridge.started = true;
  bridge.connectionEpoch = BOOTSTRAP_EPOCH_AFTER_RESOLUTION;
  bridge.access.safeSongGet = vi.fn((property: SongProperty) => {
    if (property === "signature_numerator") {
      return resolved(BOOTSTRAP_NUMERATOR);
    }

    if (property === "signature_denominator") {
      return resolved(BOOTSTRAP_DENOMINATOR);
    }

    if (property === "is_playing") {
      return resolved(true);
    }

    return resolved(TRACKING_SONG_TIME);
  });
  bridge.access.safeSongViewGet = vi.fn(() =>
    resolved({ path: "live_set tracks 2" }),
  );
  const resolveTrackIndexSpy = vi
    .spyOn(bridge, "resolveTrackIndex")
    .mockImplementation((selectedTrack: unknown) => {
      bridge.connectionEpoch += 1;
      return resolved(
        typeof selectedTrack === "object" ? INITIAL_SELECTED_TRACK : -1,
      );
    });
  const selectedTrackSpy = vi.spyOn(bridge, "handleSelectedTrack");

  // act
  await bridge.bootstrap(BOOTSTRAP_EPOCH_AFTER_RESOLUTION);

  // assert
  expect(resolveTrackIndexSpy).toHaveBeenCalledTimes(1);
  expect(selectedTrackSpy).not.toHaveBeenCalled();
});
