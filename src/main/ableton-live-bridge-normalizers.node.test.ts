import { afterEach, beforeEach, expect, it, vi } from "vitest";

const CUSTOM_PORT = 4242;
const DEFAULT_PORT = 9001;
const INVALID_PORT = "99999";
const NAN_COLOR = Number.NaN;
const MASKED_COLOR = 0xff_ff_ff;
const RAW_TRACK_ID = 42;
const TRACK_INDEX = 7;
const TRACK_PATH = "live_set tracks 7";
const UNSET_PATH: string | undefined = undefined;
const UNSET_PORT: string | undefined = undefined;

const loadNormalizersModule = async () => {
  vi.doMock("ableton-live", () => ({
    AbletonLive: vi.fn(() => ({
      song: {},
      songView: {},
    })),
  }));

  return import("@main/ableton-live-bridge-normalizers");
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("ableton-live");
});

it("normalizes track-path parsing, ports, and booleans", async () => {
  // arrange
  const module = await loadNormalizersModule();

  // act
  const invalidTrackIndex = module.parseTrackIndexFromPath(UNSET_PATH);
  const parsedTrackIndex = module.parseTrackIndexFromPath(TRACK_PATH);
  const defaultPort = module.resolveLivePort(UNSET_PORT);
  const invalidPort = module.resolveLivePort(INVALID_PORT);
  const customPort = module.resolveLivePort(String(CUSTOM_PORT));
  const falseBoolean = module.toBoolean({});
  const trueBoolean = module.toBoolean("1");

  // assert
  expect(invalidTrackIndex).toBe(-1);
  expect(parsedTrackIndex).toBe(TRACK_INDEX);
  expect(defaultPort).toBe(DEFAULT_PORT);
  expect(invalidPort).toBe(DEFAULT_PORT);
  expect(customPort).toBe(CUSTOM_PORT);
  expect(falseBoolean).toBe(false);
  expect(trueBoolean).toBe(true);
});

it("normalizes colors, numbers, and strings", async () => {
  // arrange
  const module = await loadNormalizersModule();

  // act
  const invalidColor = module.toColorValue(NAN_COLOR);
  const maskedColor = module.toColorValue(MASKED_COLOR);
  const fallbackNumber = module.toNumber("nope", CUSTOM_PORT);
  const sceneColor = module.toSceneColorValue(0);
  const stringValue = module.toStringValue(Symbol.for("bridge"));
  const emptyString = module.toStringValue({ bad: true });

  // assert
  expect(invalidColor).toBeUndefined();
  expect(maskedColor).toBe(MASKED_COLOR);
  expect(fallbackNumber).toBe(CUSTOM_PORT);
  expect(sceneColor).toBeUndefined();
  expect(stringValue).toBe("Symbol(bridge)");
  expect(emptyString).toBe("");
});

it("normalizes payload helper objects", async () => {
  // arrange
  const module = await loadNormalizersModule();

  // act
  const normalizedCleanup =
    module.defaultPayloadNormalizers.normalizeCleanup("noop");
  const selectedTrackPayload =
    module.defaultPayloadNormalizers.normalizeSelectedTrackPayload({
      raw: { path: TRACK_PATH },
    });
  const normalizedTrack = module.defaultPayloadNormalizers.normalizeTrackRef({
    raw: {
      id: "42",
      path: TRACK_PATH,
    },
  });

  // assert
  expect(normalizedCleanup).toBeUndefined();
  expect(selectedTrackPayload).toEqual({
    directId: undefined,
    path: undefined,
    rawPath: TRACK_PATH,
  });
  expect(normalizedTrack).toEqual({
    id: undefined,
    path: undefined,
    rawId: RAW_TRACK_ID,
    rawPath: TRACK_PATH,
  });
});

it("creates a live client when the constructor exposes song surfaces", async () => {
  // arrange
  const liveClient = {
    song: {},
    songView: {},
  };
  vi.doMock("ableton-live", () => ({
    AbletonLive: vi.fn(function ctor() {
      return liveClient;
    }),
  }));
  const module = await import("@main/ableton-live-bridge-normalizers");

  // act
  const createdClient = module.defaultLiveFactory.create({
    host: "127.0.0.1",
    port: CUSTOM_PORT,
  });

  // assert
  expect(createdClient).toBe(liveClient);
});

it("throws when the live client constructor omits song surfaces", async () => {
  // arrange
  vi.doMock("ableton-live", () => ({
    AbletonLive: vi.fn(function ctor() {
      return {
        song: undefined,
        songView: undefined,
      };
    }),
  }));
  const module = await import("@main/ableton-live-bridge-normalizers");

  // act
  const createClient = (): unknown => {
    return module.defaultLiveFactory.create({
      host: "127.0.0.1",
      port: CUSTOM_PORT,
    });
  };

  // assert
  expect(createClient).toThrow(
    "Ableton Live client did not expose song surfaces.",
  );
});
