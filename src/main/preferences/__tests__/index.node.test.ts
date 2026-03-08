import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdirMock = vi.fn(() => Promise.resolve());
const readFileMock = vi.fn(() => Promise.resolve(""));
const writeFileMock = vi.fn(() => Promise.resolve());
const TEST_E2E_HOME = "/Users/test/e2e-home";
const TEST_USER_DATA = "/Users/test/userdata";

const getPathMock = vi.fn(() => TEST_USER_DATA);

const WINDOW_HEIGHT = 200;
const WINDOW_WIDTH = 400;
const WINDOW_X = 10;
const WINDOW_Y = 20;
const SAVED_WINDOW_HEIGHT = 222;
const SAVED_WINDOW_WIDTH = 333;
const SAVED_WINDOW_X = 1;
const SAVED_WINDOW_Y = 2;

vi.mock("electron", () => ({
  app: {
    getPath: getPathMock,
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

describe("PrefStore load", () => {
  beforeEach(() => {
    delete process.env.AOSC_E2E_USER_DATA;
    mkdirMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    getPathMock.mockClear();
  });

  it("loads defaults when file read fails", async () => {
    // arrange
    readFileMock.mockRejectedValueOnce(new Error("missing"));
    const { PrefStore } = await import("../index");
    const store = new PrefStore();

    // act
    const prefs = await store.load();

    // assert
    expect(prefs).toEqual({
      alwaysOnTop: true,
      compactMode: false,
      mode: "elapsed",
      trackLocked: false,
    });
  });

  it("loads parsed preferences when file is valid", async () => {
    // arrange
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        alwaysOnTop: false,
        compactMode: true,
        mode: "remaining",
        trackLocked: true,
        windowBounds: {
          height: WINDOW_HEIGHT,
          width: WINDOW_WIDTH,
          x: WINDOW_X,
          y: WINDOW_Y,
        },
      }),
    );
    const { PrefStore } = await import("../index");
    const store = new PrefStore();

    // act
    const prefs = await store.load();

    // assert
    expect(prefs).toEqual({
      alwaysOnTop: false,
      compactMode: true,
      mode: "remaining",
      trackLocked: true,
      windowBounds: {
        height: WINDOW_HEIGHT,
        width: WINDOW_WIDTH,
        x: WINDOW_X,
        y: WINDOW_Y,
      },
    });
  });

  it("returns defaults when schema parse fails", async () => {
    // arrange
    readFileMock.mockResolvedValueOnce(JSON.stringify({ mode: "bad" }));
    const { PrefStore } = await import("../index");
    const store = new PrefStore();

    // act
    const prefs = await store.load();

    // assert
    expect(prefs.mode).toBe("elapsed");
    expect(prefs.alwaysOnTop).toBe(true);
  });
});

describe("PrefStore save", () => {
  beforeEach(() => {
    process.env.AOSC_E2E_USER_DATA = TEST_E2E_HOME;
    mkdirMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    getPathMock.mockClear();
  });

  it("uses e2e override path and writes file", async () => {
    // arrange
    const { PrefStore } = await import("../index");
    const getPathCallCountBeforeSave = getPathMock.mock.calls.length;
    const store = new PrefStore();

    // act
    await store.save({
      alwaysOnTop: false,
      compactMode: true,
      mode: "remaining",
      trackLocked: true,
      windowBounds: {
        height: SAVED_WINDOW_HEIGHT,
        width: SAVED_WINDOW_WIDTH,
        x: SAVED_WINDOW_X,
        y: SAVED_WINDOW_Y,
      },
    });

    // assert
    expect(getPathMock.mock.calls.length).toBe(getPathCallCountBeforeSave);
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join(TEST_E2E_HOME, "hud-preferences.json"),
      expect.stringContaining('"mode": "remaining"'),
      "utf8",
    );
  });
});
