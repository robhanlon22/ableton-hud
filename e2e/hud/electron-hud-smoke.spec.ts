import { expect, test } from "@playwright/test";

import { FakeAbletonLiveServer } from "../fake-ableton-live/index";
import {
  closeHudApp,
  launchHudApp,
  type RunningHudApp,
  waitForHudBootstrap,
  waitForStableWindowContentSize,
} from "./harness";

const COMPACT_CLIP_COLOR = 0xff_88_00;
const DISCONNECTED_SNAPSHOT_HOLD_MS = 600;
const PLAYING_POSITION_BEATS = 9.5;
const REMAINING_CLIP_COLOR = 0x00_aa_66;
const SMOKE_CLIP_LENGTH_BEATS = 32;
const SMOKE_TRACK_COLOR = 0x7f_00_ff;

let fakeServer: FakeAbletonLiveServer;

/**
 * Closes the HUD app and attaches the smoke-state screenshot for the current test.
 * @param app - Running Electron app handles to close.
 */
async function closeCurrentHudApp(app: RunningHudApp): Promise<void> {
  await closeHudApp(app, {
    testInfo: test.info(),
  });
}

/**
 * Launches the HUD app against the active fake Ableton Live server.
 * @returns Running Electron app handles for the smoke test.
 */
async function launchCurrentHudApp(): Promise<RunningHudApp> {
  return launchHudApp({
    livePort: fakeServer.port,
  });
}

/**
 * Pushes the HUD into its disconnected fallback state after showing live data.
 * @param app - Running Electron app handles.
 */
async function renderDisconnectedHudState(app: RunningHudApp): Promise<void> {
  await renderPlayingHudState(app);

  fakeServer.crashConnections();

  await expect(app.page.locator("[aria-label='Disconnected']")).toBeVisible();
  await expect(app.page.getByTestId("status-badge")).toContainText(
    "Disconnected",
  );
  await expect(app.page.getByTestId("track-pill")).toContainText("-");
  await expect(app.page.getByTestId("scene-pill")).toContainText("-");
  await expect(app.page.getByTestId("clip-pill")).toContainText("-");

  await fakeServer.stop();
  await app.page.waitForTimeout(DISCONNECTED_SNAPSHOT_HOLD_MS);
  await expect(app.page.locator("[aria-label='Disconnected']")).toBeVisible();
  await expect(app.page.getByTestId("status-badge")).toContainText(
    "Disconnected",
  );
}

/**
 * Pushes a fully populated playing state into the HUD.
 * @param app - Running Electron app handles.
 */
async function renderPlayingHudState(app: RunningHudApp): Promise<void> {
  fakeServer.setTrack({
    color: SMOKE_TRACK_COLOR,
    name: "Bass",
  });
  fakeServer.setScene({
    color: REMAINING_CLIP_COLOR,
    name: "Hook",
  });
  fakeServer.setClip({
    color: COMPACT_CLIP_COLOR,
    length: SMOKE_CLIP_LENGTH_BEATS,
    loopEnd: SMOKE_CLIP_LENGTH_BEATS,
    loopStart: 0,
    name: "Lead",
    playingPosition: PLAYING_POSITION_BEATS,
  });
  fakeServer.setSong({
    currentSongTime: PLAYING_POSITION_BEATS,
    isPlaying: true,
  });
  await fakeServer.stabilize();

  await expect(app.page.locator("[aria-label='Playing']")).toBeVisible();
  await expect(app.page.getByTestId("track-pill")).toContainText("Bass");
  await expect(app.page.getByTestId("scene-pill")).toContainText("Hook");
  await expect(app.page.getByTestId("clip-pill")).toContainText("Lead");
}

/**
 * Pushes a populated stopped state into the HUD while keeping metadata visible.
 * @param app - Running Electron app handles.
 */
async function renderStoppedHudState(app: RunningHudApp): Promise<void> {
  fakeServer.setTrack({
    color: SMOKE_TRACK_COLOR,
    name: "Bass",
  });
  fakeServer.setScene({
    color: REMAINING_CLIP_COLOR,
    name: "Hook",
  });
  fakeServer.setClip({
    color: COMPACT_CLIP_COLOR,
    length: SMOKE_CLIP_LENGTH_BEATS,
    loopEnd: SMOKE_CLIP_LENGTH_BEATS,
    loopStart: 0,
    name: "Lead",
    playingPosition: PLAYING_POSITION_BEATS,
  });
  fakeServer.setSong({
    currentSongTime: PLAYING_POSITION_BEATS,
    isPlaying: false,
  });
  await fakeServer.stabilize();

  await expect(app.page.locator("[aria-label='Stopped']")).toBeVisible();
  await expect(app.page.getByTestId("track-pill")).toContainText("Bass");
  await expect(app.page.getByTestId("scene-pill")).toContainText("Hook");
  await expect(app.page.getByTestId("clip-pill")).toContainText("Lead");
}

test.beforeEach(async () => {
  fakeServer = await FakeAbletonLiveServer.start();
});

test.afterEach(async () => {
  await fakeServer.stop();
});

test.describe("HUD screenshot smoke states", () => {
  test("renders playing state", async () => {
    // arrange
    const app = await launchCurrentHudApp();

    // act
    await waitForHudBootstrap(app);
    await renderPlayingHudState(app);

    // assert
    try {
      await expect(app.page.getByTestId("counter-text")).not.toHaveText(
        "0:0:0",
      );
    } finally {
      await closeCurrentHudApp(app);
    }
  });

  test("renders stopped state", async () => {
    // arrange
    const app = await launchCurrentHudApp();

    // act
    await waitForHudBootstrap(app);
    await renderStoppedHudState(app);

    // assert
    try {
      await expect(app.page.locator("[aria-label='Stopped']")).toBeVisible();
    } finally {
      await closeCurrentHudApp(app);
    }
  });

  test("renders disconnected state", async () => {
    // arrange
    const app = await launchCurrentHudApp();

    // act
    await waitForHudBootstrap(app);
    await renderDisconnectedHudState(app);

    // assert
    try {
      await expect(app.page.getByTestId("counter-text")).toHaveText("0:0:0");
    } finally {
      await closeCurrentHudApp(app);
    }
  });

  test("renders remaining mode state", async () => {
    // arrange
    const app = await launchCurrentHudApp();

    // act
    await waitForHudBootstrap(app);
    await renderPlayingHudState(app);
    const modeToggle = app.page.getByTestId("mode-toggle");
    await modeToggle.click();

    // assert
    try {
      await expect(modeToggle).toHaveText("Remaining");
    } finally {
      await closeCurrentHudApp(app);
    }
  });

  test("renders compact state", async () => {
    // arrange
    const app = await launchCurrentHudApp();

    // act
    await waitForHudBootstrap(app);
    await renderPlayingHudState(app);
    const initialSize = await waitForStableWindowContentSize(app);
    const compactToggle = app.page.getByTestId("compact-toggle");
    await compactToggle.click();
    const compactSize = await waitForStableWindowContentSize(app);

    // assert
    try {
      expect(compactSize).not.toEqual(initialSize);
      await compactToggle.hover();
      await expect(app.page.getByText("Show full HUD")).toBeVisible();
      await expect(app.page.getByTestId("mode-toggle")).toHaveCount(0);
    } finally {
      await closeCurrentHudApp(app);
    }
  });
});
