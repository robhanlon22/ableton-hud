import {
  makeHudSurfaceProperties,
  makeNamedHudState,
} from "@renderer/app/__tests__/hud-surface-browser-support";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudSurface } from "./hud-surface";

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
  const topmostButton = page.getByLabelText("Set window normal").element();

  // assert
  expect(topmostButton.getAttribute("title")).toBe("FLOAT");
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
  const lockButton = page.getByLabelText("Unlock track lock").element();
  await page.getByLabelText("Unlock track lock").click();

  // assert
  expect(lockButton.getAttribute("title")).toBe("LOCKED");
  expect(onToggleTrackLock).toHaveBeenCalledTimes(1);
});

it("renders remaining mode label", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ mode: "remaining" }),
  );

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect
    .element(page.getByTestId("mode-toggle"))
    .toHaveTextContent("Remaining");
});
