import {
  makeHudSurfaceProperties,
  makeNamedHudState,
} from "@renderer/app/hud/__tests__/surface-browser-support";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudSurface } from "../surface";

it("triggers mode toggle callback", async () => {
  // arrange
  const onToggleMode = vi.fn();
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ mode: "elapsed" }),
    { onToggleMode },
  );

  // act
  await render(<HudSurface {...properties} />);
  await page.getByTestId("mode-toggle").click();

  // assert
  expect(onToggleMode).toHaveBeenCalledTimes(1);
});

it("renders topmost toggle metadata when always-on-top is enabled", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ alwaysOnTop: true }),
  );

  // act
  await render(<HudSurface {...properties} />);
  await page.getByTestId("topmost-toggle").hover();

  // assert
  await expect.element(page.getByText("Allow normal stacking")).toBeVisible();
  await page.getByTestId("counter-text").hover();
});

it("renders track lock metadata and triggers toggle callback", async () => {
  // arrange
  const onToggleTrackLock = vi.fn();
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ trackLocked: true }),
    { onToggleTrackLock },
  );

  // act
  await render(<HudSurface {...properties} />);
  await page.getByTestId("track-lock-toggle").hover();
  await expect.element(page.getByText("Follow selected track")).toBeVisible();
  await page.getByTestId("track-lock-toggle").click();

  // assert
  expect(onToggleTrackLock).toHaveBeenCalledTimes(1);
  await page.getByTestId("counter-text").hover();
});

it("renders remaining mode label", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ mode: "remaining" }),
  );

  // act
  await render(<HudSurface {...properties} />);
  await page.getByTestId("mode-toggle").hover();

  // assert
  await expect
    .element(page.getByTestId("mode-toggle"))
    .toHaveTextContent("Remaining");
  await expect
    .element(page.getByTestId("mode-toggle"))
    .not.toHaveClass(/uppercase/);
  await expect.element(page.getByText("Show elapsed time")).toBeVisible();
  await page.getByTestId("counter-text").hover();
});
