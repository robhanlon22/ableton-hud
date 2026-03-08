import {
  makeHudSurfaceProperties,
  makeNamedHudState,
} from "@renderer/app/__tests__/hud-surface-browser-support";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudSurface } from "./hud-surface";

it("renders status labels for disconnected and stopped states", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ connected: false, isPlaying: false }),
  );

  // act
  const view = await render(<HudSurface {...properties} />);

  // assert
  await expect.element(page.getByLabelText("Disconnected")).toBeInTheDocument();
  await expect
    .element(page.getByTestId("status-badge"))
    .toHaveTextContent("Disconnected");
  expect(
    page.getByTestId("counter-panel").element().getAttribute("class") ?? "",
  ).toContain("bg-[#171b22]");
  await expect
    .element(page.getByTestId("counter-text"))
    .toHaveClass("text-zinc-500");

  await view.rerender(
    <HudSurface
      {...makeHudSurfaceProperties(
        makeNamedHudState({
          connected: true,
          isLastBar: false,
          isPlaying: false,
        }),
      )}
    />,
  );
  await expect.element(page.getByLabelText("Stopped")).toBeInTheDocument();
});

it("uses muted counter styling for disconnected compact view", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ connected: false, isPlaying: false }),
    { isCompactView: true },
  );

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect
    .element(page.getByTestId("counter-panel"))
    .toHaveClass("bg-[#171b22]");
  await expect
    .element(page.getByTestId("counter-text"))
    .toHaveClass("text-zinc-500");
});

it("applies warning styling when in last bar", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ isLastBar: true }),
    { isFlashActive: true },
  );

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect
    .element(page.getByTestId("counter-text"))
    .toHaveClass("text-ableton-warning");
});
