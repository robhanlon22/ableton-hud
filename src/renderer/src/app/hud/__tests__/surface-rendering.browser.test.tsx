import {
  makeHudSurfaceProperties,
  makeMetadataPlaceholderHudState,
  makeNamedHudState,
} from "@renderer/app/hud/__tests__/surface-browser-support";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudSurface } from "../surface";

it("renders clip and counter text", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(makeNamedHudState());

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect.element(page.getByTestId("clip-pill")).toHaveTextContent("Clip");
  await expect
    .element(page.getByTestId("track-pill"))
    .toHaveTextContent("Kick");
  await expect
    .element(page.getByTestId("scene-pill"))
    .toHaveTextContent("Drop");
  await expect
    .element(page.getByTestId("counter-text"))
    .toHaveTextContent("2:3:4");
});

it("uses metadata colors as pill backgrounds with contrasting text", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({
      clipColor: 0xff_d0_00,
      sceneColor: 0x00_8c_66,
      trackColor: 0x33_44_ff,
    }),
  );

  // act
  await render(<HudSurface {...properties} />);
  const clipPill = page.getByTestId("clip-pill").element();
  const trackPill = page.getByTestId("track-pill").element();
  const scenePill = page.getByTestId("scene-pill").element();

  // assert
  expect(clipPill.style.backgroundColor).toBe("rgb(255, 208, 0)");
  expect(clipPill.style.color).toBe("rgb(16, 18, 22)");
  expect(trackPill.style.backgroundColor).toBe("rgb(51, 68, 255)");
  expect(scenePill.style.backgroundColor).toBe("rgb(0, 140, 102)");
});

it("renders dash placeholders when metadata names are missing", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeMetadataPlaceholderHudState(),
  );

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect.element(page.getByTestId("clip-pill")).toHaveTextContent("-");
  await expect.element(page.getByTestId("track-pill")).toHaveTextContent("-");
  await expect.element(page.getByTestId("scene-pill")).toHaveTextContent("-");
});

it("renders dash placeholders for whitespace-only metadata names", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({
      clipName: "   ",
      sceneName: "\n",
      trackName: "\t",
    }),
  );

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect.element(page.getByTestId("clip-pill")).toHaveTextContent("-");
  await expect.element(page.getByTestId("track-pill")).toHaveTextContent("-");
  await expect.element(page.getByTestId("scene-pill")).toHaveTextContent("-");
});
