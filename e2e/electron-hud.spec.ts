import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";

import type { HudState } from "../src/shared/types";

import { createDefaultHudState, HUD_CHANNELS } from "../src/shared/ipc";

const MAIN_ENTRY = resolve(process.cwd(), "out/main/index.js");

interface EvaluateElectronContext {
  BrowserWindow: {
    getAllWindows: () => {
      webContents: {
        send: (channel: string, payload: HudState) => void;
      };
    }[];
  };
}

interface HudStateEvent {
  channel: string;
  state: HudState;
}

interface RunningHudApp {
  electronApp: ElectronApplication;
  page: Page;
  tempHome: string;
}

/**
 * Closes the Electron app and removes temporary profile state.
 * @param app - Running app handles produced by {@link launchHudApp}.
 */
async function closeHudApp(app: RunningHudApp): Promise<void> {
  try {
    await app.electronApp.close();
  } finally {
    await rm(app.tempHome, { force: true, recursive: true });
  }
}

/**
 * Pushes a HUD state directly into the renderer IPC subscription channel.
 * @param electronApp - Electron application handle for main-process evaluation.
 * @param payload - HUD state payload to inject.
 */
async function injectHudState(
  electronApp: ElectronApplication,
  payload: HudState,
): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, event) => {
      const context = { BrowserWindow } as EvaluateElectronContext;
      const firstWindow = context.BrowserWindow.getAllWindows().at(0);
      if (!firstWindow) {
        throw new Error("Expected a BrowserWindow instance for HUD injection.");
      }
      firstWindow.webContents.send(event.channel, event.state);
    },
    {
      channel: HUD_CHANNELS.state,
      state: payload,
    } satisfies HudStateEvent,
  );
}

/**
 * Re-sends HUD state until the renderer reflects the expected counter text.
 * @param app - Running app handles used for injection and DOM assertions.
 * @param payload - HUD state payload to inject.
 */
async function injectHudStateUntilRendered(
  app: RunningHudApp,
  payload: HudState,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await injectHudState(app.electronApp, payload);
        return app.page.getByTestId("counter-text").textContent();
      },
      {
        intervals: [100, 200, 300],
        timeout: 8_000,
      },
    )
    .toBe(payload.counterText);
}

/**
 * Launches the compiled Electron app with isolated user data for deterministic tests.
 * @returns Running Electron app handles for each test case.
 */
async function launchHudApp(): Promise<RunningHudApp> {
  const tempHome = await mkdtemp(
    join(tmpdir(), "ableton-hud-playwright-home-"),
  );

  const electronApp = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
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

test.describe("Electron HUD", () => {
  test("launches a window and renders default counter", async () => {
    const app = await launchHudApp();

    try {
      await expect(app.page.getByTestId("hud-root")).toBeVisible();
      await expect(app.page.getByTestId("counter-text")).toHaveText("0:0:0");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles counter mode from elapsed to remaining", async () => {
    const app = await launchHudApp();

    try {
      const modeToggle = app.page.getByTestId("mode-toggle");
      await expect(modeToggle).toHaveText("Elapsed");

      await modeToggle.click();
      await expect(modeToggle).toHaveText("Remaining");
    } finally {
      await closeHudApp(app);
    }
  });

  test("toggles always-on-top button title", async () => {
    const app = await launchHudApp();

    try {
      await expect(app.page.getByTestId("hud-root")).toBeVisible();
      const toggleButton = app.page.getByRole("button", {
        name: /Set window (normal|floating)/,
      });
      const initialTitle = await toggleButton.getAttribute("title");
      const expectedInitialTitle =
        initialTitle === "FLOAT" ? "FLOAT" : "NORMAL";
      await expect(toggleButton).toHaveAttribute("title", expectedInitialTitle);

      await toggleButton.click();

      const expectedAfterToggle =
        expectedInitialTitle === "FLOAT" ? "NORMAL" : "FLOAT";
      await expect(toggleButton).toHaveAttribute("title", expectedAfterToggle);
    } finally {
      await closeHudApp(app);
    }
  });

  test("renders injected hud state payload", async () => {
    const app = await launchHudApp();

    try {
      await expect(app.page.getByTestId("hud-root")).toBeVisible();
      const injectedState: HudState = {
        ...createDefaultHudState("remaining", true),
        beatFlashToken: 7,
        clipColor: 0x7f00ff,
        clipIndex: 5,
        clipName: "Lead",
        connected: true,
        counterParts: {
          bar: 7,
          beat: 2,
          sixteenth: 3,
        },
        counterText: "7:2:3",
        isDownbeat: false,
        isLastBar: false,
        isPlaying: true,
        mode: "remaining",
        sceneColor: 0x00aa66,
        sceneName: "Hook",
        trackColor: 0xff8800,
        trackIndex: 2,
        trackName: "Bass",
      };

      await injectHudStateUntilRendered(app, injectedState);

      await expect(app.page.getByTestId("counter-text")).toHaveText("7:2:3");
      await expect(app.page.getByTestId("mode-toggle")).toHaveText("Remaining");
      await expect(app.page.getByTestId("clip-pill")).toContainText("Lead");
      await expect(app.page.getByTestId("track-pill")).toContainText("Bass");
      await expect(app.page.getByTestId("scene-pill")).toContainText("Hook");
    } finally {
      await closeHudApp(app);
    }
  });
});
