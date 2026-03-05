import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdirMock = vi.fn(() => Promise.resolve(undefined));
const readFileMock = vi.fn(() => Promise.resolve(""));
const writeFileMock = vi.fn(() => Promise.resolve(undefined));
const getPathMock = vi.fn(() => "/tmp/userdata");

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

describe("PrefStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AOSC_E2E_USER_DATA;
  });

  it("loads defaults when file read fails", async () => {
    readFileMock.mockRejectedValueOnce(new Error("missing"));
    const { PrefStore } = await import("./prefs");

    const store = new PrefStore();
    const prefs = await store.load();

    expect(prefs).toEqual({
      alwaysOnTop: true,
      compactMode: false,
      mode: "elapsed",
      trackLocked: false,
    });
  });

  it("loads parsed preferences when file is valid", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        alwaysOnTop: false,
        compactMode: true,
        mode: "remaining",
        trackLocked: true,
        windowBounds: {
          height: 200,
          width: 400,
          x: 10,
          y: 20,
        },
      }),
    );
    const { PrefStore } = await import("./prefs");

    const store = new PrefStore();
    const prefs = await store.load();

    expect(prefs).toEqual({
      alwaysOnTop: false,
      compactMode: true,
      mode: "remaining",
      trackLocked: true,
      windowBounds: {
        height: 200,
        width: 400,
        x: 10,
        y: 20,
      },
    });
  });

  it("returns defaults when schema parse fails", async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ mode: "bad" }));
    const { PrefStore } = await import("./prefs");

    const store = new PrefStore();
    const prefs = await store.load();

    expect(prefs.mode).toBe("elapsed");
    expect(prefs.alwaysOnTop).toBe(true);
  });

  it("uses e2e override path and writes file", async () => {
    process.env.AOSC_E2E_USER_DATA = "/tmp/e2e-home";
    const { PrefStore } = await import("./prefs");

    const store = new PrefStore();
    await store.save({
      alwaysOnTop: false,
      compactMode: true,
      mode: "remaining",
      trackLocked: true,
      windowBounds: {
        height: 222,
        width: 333,
        x: 1,
        y: 2,
      },
    });

    expect(getPathMock).not.toHaveBeenCalled();
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/e2e-home/hud-preferences.json",
      expect.stringContaining('"mode": "remaining"'),
      "utf8",
    );
  });
});
