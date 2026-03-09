import { expect, test } from "@playwright/test";

import { FakeAbletonLiveServer } from "../fake-ableton-live/index";
import {
  closeHudApp,
  launchHudApp,
  readPersistedPrefs,
  readWindowOverlayState,
  type RunningHudApp,
  setWindowContentSize,
  waitForHudBootstrap,
  waitForStableWindowContentSize,
} from "./harness";

const FULL_DETAILS_WINDOW_SIZE = {
  height: 260,
  width: 540,
};
const RELAUNCH_WINDOW_SIZE_STABILITY_ATTEMPTS = 50;
const TRACK_COLOR = 0xff_88_00;
const SCENE_COLOR = 0x00_aa_66;
const CLIP_COLOR = 0x7f_00_ff;
const CLIP_LENGTH_BEATS = 32;
const CLIP_PLAYING_POSITION_BEATS = 9.5;
const CLIP_A_PLAYING_POSITION_BEATS = 2.5;
const CLIP_B_PLAYING_POSITION_BEATS = 9.75;

let fakeServer: FakeAbletonLiveServer;

/**
 * Closes the HUD app and attaches a CI screenshot artifact for the current test.
 * @param app - Running Electron app handles to close.
 * @param removeProfile - Whether to delete the temporary profile directory.
 * @param screenshotLabel - Optional screenshot label when a test closes multiple app instances.
 */
async function closeCurrentHudApp(
  app: RunningHudApp,
  removeProfile = true,
  screenshotLabel?: string,
): Promise<void> {
  await closeHudApp(app, {
    removeProfile,
    screenshotLabel,
    testInfo: test.info(),
  });
}

/**
 * Launches the HUD app against the current fake Ableton server.
 * @param existingTemporaryHome - Optional prior profile directory to reuse.
 * @returns Running Electron app handles.
 */
async function launchCurrentHudApp(
  existingTemporaryHome?: string,
): Promise<RunningHudApp> {
  return launchHudApp({
    existingTempHome: existingTemporaryHome,
    livePort: fakeServer.port,
  });
}

/**
 * Switches between the two tooltip labels used by binary HUD toggles.
 * @param currentLabel - Current user-facing action label.
 * @param firstLabel - First label in the toggle pair.
 * @param secondLabel - Second label in the toggle pair.
 * @returns The opposite label for the toggled state.
 */
function oppositeToggleLabel(
  currentLabel: string,
  firstLabel: string,
  secondLabel: string,
): string {
  return currentLabel === firstLabel ? secondLabel : firstLabel;
}

test.beforeEach(async () => {
  fakeServer = await FakeAbletonLiveServer.start();
});

test.afterEach(async () => {
  await fakeServer.stop();
});

test("launches a window and renders default counter", async () => {
  // arrange
  // act
  const app = await launchCurrentHudApp();

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
    await closeCurrentHudApp(app);
  }
});

test("toggles counter mode from elapsed to remaining", async () => {
  // arrange
  // act
  const app = await launchCurrentHudApp();

  // assert
  try {
    await waitForHudBootstrap(app);
    const modeToggle = app.page.getByTestId("mode-toggle");
    await expect(modeToggle).toHaveText("Elapsed");

    await modeToggle.click();
    await expect(modeToggle).toHaveText("Remaining");
  } finally {
    await closeCurrentHudApp(app);
  }
});

test("toggles always-on-top control copy", async () => {
  // arrange
  // act
  const app = await launchCurrentHudApp();

  // assert
  try {
    await waitForHudBootstrap(app);
    const toggleButton = app.page.getByTestId("topmost-toggle");
    const initialLabel = await toggleButton.getAttribute("aria-label");
    expect(initialLabel).toBeTruthy();
    const nextLabel = oppositeToggleLabel(
      initialLabel ?? "Allow normal stacking",
      "Allow normal stacking",
      "Keep on top",
    );

    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute("aria-label", nextLabel);
  } finally {
    await closeCurrentHudApp(app);
  }
});

test("toggles track lock control copy", async () => {
  // arrange
  // act
  const app = await launchCurrentHudApp();

  // assert
  try {
    await waitForHudBootstrap(app);
    const lockButton = app.page.getByTestId("track-lock-toggle");
    const initialLabel = await lockButton.getAttribute("aria-label");
    expect(initialLabel).toBeTruthy();
    const nextLabel = oppositeToggleLabel(
      initialLabel ?? "Lock to current track",
      "Lock to current track",
      "Follow selected track",
    );

    await lockButton.click();
    await expect(lockButton).toHaveAttribute("aria-label", nextLabel);
  } finally {
    await closeCurrentHudApp(app);
  }
});

test("toggles compact mode and resizes window to counter panel", async () => {
  // arrange
  // act
  const app = await launchCurrentHudApp();

  // assert
  try {
    await waitForHudBootstrap(app);
    const initialSize = await waitForStableWindowContentSize(app);
    const compactToggle = app.page.getByTestId("compact-toggle");
    await expect(compactToggle).toHaveAttribute(
      "aria-label",
      "Switch to compact view",
    );
    await compactToggle.click();
    await expect(compactToggle).toHaveAttribute("aria-label", "Show full HUD");
    await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);
    const compactSize = await waitForStableWindowContentSize(app);
    expect(compactSize).not.toEqual(initialSize);
    expect(compactSize.width).toBeLessThanOrEqual(initialSize.width);
    expect(compactSize.height).toBeLessThanOrEqual(initialSize.height);

    await compactToggle.click();
    await expect(compactToggle).toHaveAttribute(
      "aria-label",
      "Switch to compact view",
    );
    await expect(app.page.getByTestId("mode-toggle")).toHaveText("Elapsed");
    expect(await waitForStableWindowContentSize(app, initialSize)).toEqual(
      initialSize,
    );
  } finally {
    await closeCurrentHudApp(app);
  }
});

test("restores full size after compact relaunch cycle", async () => {
  // arrange
  const app = await launchCurrentHudApp();
  const stableHome = app.tempHome;
  await waitForHudBootstrap(app);
  // act
  await setWindowContentSize(app, FULL_DETAILS_WINDOW_SIZE);

  // assert
  try {
    const fullSize = await waitForStableWindowContentSize(app);
    expect(fullSize).toEqual(FULL_DETAILS_WINDOW_SIZE);
    const compactToggle = app.page.getByTestId("compact-toggle");
    await expect(compactToggle).toHaveAttribute(
      "aria-label",
      "Switch to compact view",
    );
    await compactToggle.click();
    await expect(compactToggle).toHaveAttribute("aria-label", "Show full HUD");
    await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);
    await expect
      .poll(async () => readPersistedPrefs(stableHome))
      .toMatchObject({
        compactMode: true,
        windowBounds: expect.objectContaining(FULL_DETAILS_WINDOW_SIZE),
      });
  } finally {
    await closeCurrentHudApp(
      app,
      false,
      "restores-full-size-compact-relaunch-compact-state",
    );
  }

  await expect
    .poll(async () => readPersistedPrefs(stableHome))
    .toMatchObject({
      compactMode: true,
      windowBounds: expect.objectContaining(FULL_DETAILS_WINDOW_SIZE),
    });

  const relaunchedApp = await launchCurrentHudApp(stableHome);
  try {
    await waitForHudBootstrap(relaunchedApp);
    const compactToggle = relaunchedApp.page.getByTestId("compact-toggle");
    await expect(compactToggle).toHaveAttribute("aria-label", "Show full HUD");
    await compactToggle.click();
    await expect(compactToggle).toHaveAttribute(
      "aria-label",
      "Switch to compact view",
    );
    await expect(relaunchedApp.page.getByTestId("mode-toggle")).toBeVisible();
    expect(
      await waitForStableWindowContentSize(
        relaunchedApp,
        FULL_DETAILS_WINDOW_SIZE,
        RELAUNCH_WINDOW_SIZE_STABILITY_ATTEMPTS,
      ),
    ).toEqual(FULL_DETAILS_WINDOW_SIZE);
  } finally {
    await closeCurrentHudApp(
      relaunchedApp,
      true,
      "restores-full-size-compact-relaunch-restored-state",
    );
  }
});

test("renders fake transport payload from websocket server", async () => {
  // arrange
  // act
  const app = await launchCurrentHudApp();

  // assert
  try {
    await waitForHudBootstrap(app);

    fakeServer.setTrack({
      color: TRACK_COLOR,
      name: "Track",
    });
    fakeServer.setScene({
      color: SCENE_COLOR,
      name: "Scene",
    });
    fakeServer.setClip({
      color: CLIP_COLOR,
      length: CLIP_LENGTH_BEATS,
      loopEnd: CLIP_LENGTH_BEATS,
      loopStart: 0,
      name: "Clip",
      playingPosition: CLIP_PLAYING_POSITION_BEATS,
    });
    fakeServer.setSong({
      currentSongTime: CLIP_PLAYING_POSITION_BEATS,
      isPlaying: true,
    });
    await fakeServer.stabilize();

    await expect(app.page.getByTestId("counter-text")).not.toHaveText("0:0:0");
    await expect(app.page.getByTestId("clip-pill")).toContainText("Clip");
    await expect(app.page.getByTestId("track-pill")).toContainText("Track");
    await expect(app.page.getByTestId("scene-pill")).toContainText("Scene");
  } finally {
    await closeCurrentHudApp(app);
  }
});

test("automatically reconnects after an unexpected live socket drop", async () => {
  // arrange
  const initialPort = fakeServer.port;
  const app = await launchCurrentHudApp();
  await waitForHudBootstrap(app);
  // act
  await app.page.locator("[aria-label='Playing']").waitFor();

  // assert
  try {
    fakeServer.setTrack({ name: "Track A" });
    fakeServer.setScene({ name: "Scene A" });
    fakeServer.setClip({
      name: "Clip A",
      playingPosition: CLIP_A_PLAYING_POSITION_BEATS,
    });
    fakeServer.setSong({
      currentSongTime: CLIP_A_PLAYING_POSITION_BEATS,
      isPlaying: true,
    });
    await fakeServer.stabilize();
    await app.page.getByTestId("track-pill").waitFor();

    fakeServer.crashConnections();
    await app.page.locator("[aria-label='Disconnected']").waitFor();
    await expect(app.page.getByTestId("status-badge")).toContainText(
      "Disconnected",
    );
    await expect(app.page.getByTestId("track-pill")).toContainText("-");
    await expect(app.page.getByTestId("scene-pill")).toContainText("-");
    await expect(app.page.getByTestId("clip-pill")).toContainText("-");
    await expect(app.page.getByTestId("counter-text")).toHaveText("0:0:0");

    await fakeServer.stop();
    fakeServer = await FakeAbletonLiveServer.start({ port: initialPort });
    await fakeServer.stabilize();

    fakeServer.setTrack({ name: "Track B" });
    fakeServer.setScene({ name: "Scene B" });
    fakeServer.setClip({
      name: "Clip B",
      playingPosition: CLIP_B_PLAYING_POSITION_BEATS,
    });
    fakeServer.setSong({
      currentSongTime: CLIP_B_PLAYING_POSITION_BEATS,
      isPlaying: true,
    });
    await fakeServer.stabilize();
    await app.page.locator("[aria-label='Playing']").waitFor();
    await expect(app.page.locator("[aria-label='Playing']")).toBeVisible();
    await expect(app.page.getByTestId("track-pill")).toContainText("Track B");
    await expect(app.page.getByTestId("scene-pill")).toContainText("Scene B");
    await expect(app.page.getByTestId("clip-pill")).toContainText("Clip B");
    await expect(app.page.getByTestId("counter-text")).not.toHaveText("0:0:0");
  } finally {
    await closeCurrentHudApp(app);
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
    const app = await launchCurrentHudApp();

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
      await closeCurrentHudApp(app);
    }
  });

  test("applies and clears fullscreen overlay policy via hud:toggle-topmost IPC", async () => {
    // arrange
    // act
    const app = await launchCurrentHudApp();

    // assert
    try {
      await waitForHudBootstrap(app);
      const toggleButton = app.page.getByTestId("topmost-toggle");
      const initialLabel = await toggleButton.getAttribute("aria-label");
      expect(initialLabel).toBeTruthy();
      const clearedLabel = oppositeToggleLabel(
        initialLabel ?? "Allow normal stacking",
        "Allow normal stacking",
        "Keep on top",
      );

      await toggleButton.click();
      await expect(toggleButton).toHaveAttribute("aria-label", clearedLabel);
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
      await expect(toggleButton).toHaveAttribute(
        "aria-label",
        initialLabel ?? clearedLabel,
      );
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
      await closeCurrentHudApp(app);
    }
  });
});
