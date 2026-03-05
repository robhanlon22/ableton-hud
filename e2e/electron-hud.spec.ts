import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";

import { FakeAbletonLiveServer } from "./fake-ableton-live-server";

const MAIN_ENTRY = resolve(process.cwd(), "out/main/index.js");

interface LaunchHudAppOptions {
  existingTempHome?: string;
  livePort: number;
}

interface PersistedPrefs {
  alwaysOnTop?: boolean;
  compactMode: boolean;
  windowBounds?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
}

interface RunningHudApp {
  electronApp: ElectronApplication;
  page: Page;
  tempHome: string;
}

interface WindowContentSize {
  height: number;
  width: number;
}

interface WindowOverlayState {
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
}

/**
 * Closes the Electron app and removes temporary profile state.
 * @param app - Running app handles produced by {@link launchHudApp}.
 * @param removeProfile - Whether to remove the temporary profile directory.
 */
async function closeHudApp(
  app: RunningHudApp,
  removeProfile = true,
): Promise<void> {
  try {
    await app.electronApp.close();
  } finally {
    if (removeProfile) {
      await rm(app.tempHome, { force: true, recursive: true });
    }
  }
}

/**
 * Launches the compiled Electron app with isolated user data for deterministic tests.
 * @param options - Launch options for profile reuse and transport configuration.
 * @returns Running Electron app handles for each test case.
 */
async function launchHudApp(
  options: LaunchHudAppOptions,
): Promise<RunningHudApp> {
  const { existingTempHome, livePort } = options;
  const tempHome =
    existingTempHome ??
    (await mkdtemp(join(tmpdir(), "ableton-hud-playwright-home-")));

  const electronApp = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      AOSC_E2E_USER_DATA: tempHome,
      AOSC_LIVE_HOST: "127.0.0.1",
      AOSC_LIVE_PORT: String(livePort),
      HOME: tempHome,
      USERPROFILE: tempHome,
      XDG_CACHE_HOME: join(tempHome, ".cache"),
      XDG_CONFIG_HOME: join(tempHome, ".config"),
      XDG_DATA_HOME: join(tempHome, ".local/share"),
    },
  });

  const page = await electronApp.firstWindow();
  return {
    electronApp,
    page,
    tempHome,
  };
}

/**
 * Reads persisted HUD preferences from the isolated user-data directory.
 * @param tempHome - Temporary profile directory used for the test app launch.
 * @returns Parsed persisted preferences payload.
 */
async function readPersistedPrefs(tempHome: string): Promise<PersistedPrefs> {
  const raw = await readFile(join(tempHome, "hud-preferences.json"), "utf8");
  return JSON.parse(raw) as PersistedPrefs;
}

/**
 * Reads the content size of the active main window.
 * @param app - Running app handles.
 * @returns Current content width and height.
 */
async function readWindowContentSize(
  app: RunningHudApp,
): Promise<WindowContentSize> {
  return app.electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const [width, height] = mainWindow.getContentSize();
    return { height, width };
  });
}

/**
 * Reads topmost/workspace visibility state from the active main window.
 * @param app - Running app handles.
 * @returns Overlay policy flags from BrowserWindow.
 */
async function readWindowOverlayState(
  app: RunningHudApp,
): Promise<WindowOverlayState> {
  return app.electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return {
      alwaysOnTop: mainWindow.isAlwaysOnTop(),
      visibleOnAllWorkspaces: mainWindow.isVisibleOnAllWorkspaces(),
    };
  });
}

/**
 * Waits for the renderer to finish mounting subscriptions before event assertions.
 * @param app - Running app handles.
 */
async function waitForHudBootstrap(app: RunningHudApp): Promise<void> {
  await expect(app.page.getByTestId("hud-root")).toBeVisible();
  await app.page.waitForTimeout(300);
}

test.describe("Electron HUD", () => {
  let fakeServer: FakeAbletonLiveServer;

  test.beforeEach(async () => {
    fakeServer = await FakeAbletonLiveServer.start();
  });

  test.afterEach(async () => {
    await fakeServer.stop();
  });

  test("launches a window and renders default counter", async () => {
    // arrange
    // act
    const app = await launchHudApp({ livePort: fakeServer.port });

    // assert
    try {
      await expect(app.page.getByTestId("hud-root")).toBeVisible();
      await expect(app.page.getByTestId("counter-text")).toBeVisible();
      await expect(
        app.page.locator(
          "[aria-label='Disconnected'], [aria-label='Playing'], [aria-label='Stopped']",
        ),
      ).toBeVisible();
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles counter mode from elapsed to remaining", async () => {
    // arrange
    // act
    const app = await launchHudApp({ livePort: fakeServer.port });

    // assert
    try {
      await waitForHudBootstrap(app);
      const modeToggle = app.page.getByTestId("mode-toggle");
      await expect(modeToggle).toHaveText("Elapsed");

      await modeToggle.click();
      await expect(modeToggle).toHaveText("Remaining");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles always-on-top button title", async () => {
    // arrange
    // act
    const app = await launchHudApp({ livePort: fakeServer.port });

    // assert
    try {
      await waitForHudBootstrap(app);
      const toggleButton = app.page.getByRole("button", {
        name: /Set window (normal|floating)/,
      });
      await expect(toggleButton).toHaveAttribute("title", "FLOAT");

      await toggleButton.click();

      await expect(toggleButton).toHaveAttribute("title", "NORMAL");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles track lock button title", async () => {
    // arrange
    // act
    const app = await launchHudApp({ livePort: fakeServer.port });

    // assert
    try {
      await waitForHudBootstrap(app);
      const lockButton = app.page.getByTestId("track-lock-toggle");
      await expect(lockButton).toHaveAttribute("title", "UNLOCKED");

      await lockButton.click();
      await expect(lockButton).toHaveAttribute("title", "LOCKED");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles compact mode and resizes window to counter panel", async () => {
    // arrange
    // act
    const app = await launchHudApp({ livePort: fakeServer.port });

    // assert
    try {
      await waitForHudBootstrap(app);
      const initialSize = await readWindowContentSize(app);
      const compactToggle = app.page.getByTestId("compact-toggle");
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");

      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "EXPAND DETAILS");
      await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);

      await expect
        .poll(async () => {
          return readWindowContentSize(app);
        })
        .toEqual({
          height: expect.any(Number),
          width: expect.any(Number),
        });
      const compactSize = await readWindowContentSize(app);
      expect(compactSize.width).toBeLessThanOrEqual(initialSize.width);
      expect(compactSize.height).toBeLessThanOrEqual(initialSize.height);

      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");
      await expect(app.page.getByTestId("mode-toggle")).toHaveText("Elapsed");
      await expect
        .poll(async () => readWindowContentSize(app))
        .toEqual(initialSize);
    } finally {
      await closeHudApp(app);
    }
  });

  test("restores full size after compact relaunch cycle", async () => {
    // arrange
    const app = await launchHudApp({ livePort: fakeServer.port });
    // act
    const stableHome = app.tempHome;

    // assert
    try {
      await waitForHudBootstrap(app);
      await app.electronApp.evaluate(({ BrowserWindow }) => {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        mainWindow.setContentSize(540, 260);
      });
      const fullSize = await readWindowContentSize(app);
      expect(fullSize).toEqual({ height: 260, width: 540 });
      const compactToggle = app.page.getByTestId("compact-toggle");
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");
      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "EXPAND DETAILS");
      await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);
      await expect
        .poll(async () => {
          return readPersistedPrefs(stableHome);
        })
        .toMatchObject({
          compactMode: true,
        });
    } finally {
      await closeHudApp(app, false);
    }

    const relaunchedApp = await launchHudApp({
      existingTempHome: stableHome,
      livePort: fakeServer.port,
    });
    try {
      await waitForHudBootstrap(relaunchedApp);
      const compactToggle = relaunchedApp.page.getByTestId("compact-toggle");
      await expect(compactToggle).toHaveAttribute("title", "EXPAND DETAILS");

      await compactToggle.click();
      await expect(compactToggle).toHaveAttribute("title", "COLLAPSE DETAILS");
      await expect(relaunchedApp.page.getByTestId("mode-toggle")).toBeVisible();

      await expect
        .poll(async () => {
          return readWindowContentSize(relaunchedApp);
        })
        .toEqual({ height: 260, width: 540 });
    } finally {
      await closeHudApp(relaunchedApp);
    }
  });

  test("renders fake transport payload from websocket server", async () => {
    // arrange
    // act
    const app = await launchHudApp({ livePort: fakeServer.port });

    // assert
    try {
      await waitForHudBootstrap(app);

      fakeServer.setTrack({
        color: 0xff8800,
        name: "Bass",
      });
      fakeServer.setScene({
        color: 0x00aa66,
        name: "Hook",
      });
      fakeServer.setClip({
        color: 0x7f00ff,
        length: 32,
        loopEnd: 32,
        loopStart: 0,
        name: "Lead",
        playingPosition: 9.5,
      });
      fakeServer.setSong({
        currentSongTime: 9.5,
        isPlaying: true,
      });
      await fakeServer.stabilize();

      await expect(app.page.getByTestId("counter-text")).not.toHaveText(
        "0:0:0",
      );
      await expect(app.page.getByTestId("clip-pill")).toContainText("Lead");
      await expect(app.page.getByTestId("track-pill")).toContainText("Bass");
      await expect(app.page.getByTestId("scene-pill")).toContainText("Hook");
    } finally {
      await closeHudApp(app);
    }
  });

  test("automatically reconnects after an unexpected live socket drop", async () => {
    // arrange
    const initialPort = fakeServer.port;
    // act
    const app = await launchHudApp({ livePort: initialPort });

    // assert
    try {
      await waitForHudBootstrap(app);
      await app.page.locator("[aria-label='Playing']").waitFor();

      fakeServer.setTrack({ name: "Track A" });
      fakeServer.setScene({ name: "Scene A" });
      fakeServer.setClip({ name: "Clip A", playingPosition: 2.5 });
      fakeServer.setSong({ currentSongTime: 2.5, isPlaying: true });
      await fakeServer.stabilize();
      await app.page.getByTestId("track-pill").waitFor();

      fakeServer.crashConnections();
      await app.page.locator("[aria-label='Disconnected']").waitFor();

      await fakeServer.stop();
      fakeServer = await FakeAbletonLiveServer.start({ port: initialPort });
      await fakeServer.stabilize();

      fakeServer.setTrack({ name: "Track B" });
      fakeServer.setScene({ name: "Scene B" });
      fakeServer.setClip({ name: "Clip B", playingPosition: 9.75 });
      fakeServer.setSong({ currentSongTime: 9.75, isPlaying: true });
      await fakeServer.stabilize();
      await app.page.locator("[aria-label='Playing']").waitFor();
      const reconnectStatus = app.page.locator("[aria-label='Playing']");
      await expect(reconnectStatus).toBeVisible();
      await expect(app.page.getByTestId("track-pill")).toContainText("Track B");
      await expect(app.page.getByTestId("scene-pill")).toContainText("Scene B");
      await expect(app.page.getByTestId("clip-pill")).toContainText("Clip B");
      await expect(app.page.getByTestId("counter-text")).not.toHaveText(
        "0:0:0",
      );
    } finally {
      await closeHudApp(app);
    }
  });

  test.describe("Fullscreen overlay policy", () => {
    test.skip(
      process.platform !== "darwin",
      "Fullscreen workspace policy is macOS-specific.",
    );

    test("applies fullscreen overlay policy from persisted alwaysOnTop on launch", async () => {
      // arrange
      // act
      const app = await launchHudApp({ livePort: fakeServer.port });

      // assert
      try {
        await waitForHudBootstrap(app);
        await expect
          .poll(async () => readWindowOverlayState(app))
          .toEqual({
            alwaysOnTop: true,
            visibleOnAllWorkspaces: true,
          });
      } finally {
        await closeHudApp(app);
      }
    });

    test("applies and clears fullscreen overlay policy via hud:toggle-topmost IPC", async () => {
      // arrange
      // act
      const app = await launchHudApp({ livePort: fakeServer.port });

      // assert
      try {
        await waitForHudBootstrap(app);
        const toggleButton = app.page.getByRole("button", {
          name: /Set window (normal|floating)/,
        });
        await expect(toggleButton).toHaveAttribute("title", "FLOAT");

        await toggleButton.click();
        await expect(toggleButton).toHaveAttribute("title", "NORMAL");
        await expect
          .poll(async () => readWindowOverlayState(app))
          .toEqual({
            alwaysOnTop: false,
            visibleOnAllWorkspaces: false,
          });
        await expect
          .poll(async () => readPersistedPrefs(app.tempHome))
          .toMatchObject({
            alwaysOnTop: false,
          });

        await toggleButton.click();
        await expect(toggleButton).toHaveAttribute("title", "FLOAT");
        await expect
          .poll(async () => readWindowOverlayState(app))
          .toEqual({
            alwaysOnTop: true,
            visibleOnAllWorkspaces: true,
          });
        await expect
          .poll(async () => readPersistedPrefs(app.tempHome))
          .toMatchObject({
            alwaysOnTop: true,
          });
      } finally {
        await closeHudApp(app);
      }
    });
  });
});
