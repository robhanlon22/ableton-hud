import {
  makeHudSurfaceProperties,
  makeNamedHudState,
} from "@renderer/app/hud/__tests__/surface-browser-support";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudSurface } from "../surface";

it("applies flash panel classes for downbeat and last-bar combinations", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ isDownbeat: true, isLastBar: true }),
    { isFlashActive: true },
  );

  // act
  const view = await render(<HudSurface {...properties} />);

  // assert
  await expect
    .element(page.getByTestId("counter-panel"))
    .toHaveClass("border-[#83545a]");

  await view.rerender(
    <HudSurface
      {...makeHudSurfaceProperties(
        makeNamedHudState({ isDownbeat: false, isLastBar: true }),
        { isFlashActive: true },
      )}
    />,
  );
  await expect
    .element(page.getByTestId("counter-panel"))
    .toHaveClass("border-[#7a4f54]");

  await view.rerender(
    <HudSurface
      {...makeHudSurfaceProperties(
        makeNamedHudState({ isDownbeat: true, isLastBar: false }),
        { isFlashActive: true },
      )}
    />,
  );
  await expect
    .element(page.getByTestId("counter-panel"))
    .toHaveClass("border-[#546a4b]");

  await view.rerender(
    <HudSurface
      {...makeHudSurfaceProperties(
        makeNamedHudState({ isDownbeat: false, isLastBar: false }),
        { isFlashActive: true },
      )}
    />,
  );
  await expect
    .element(page.getByTestId("counter-panel"))
    .toHaveClass("border-[#4a5a45]");
});

it("uses compact flash styling without border classes", async () => {
  // arrange
  const properties = makeHudSurfaceProperties(
    makeNamedHudState({ isLastBar: true }),
    {
      isCompactView: true,
      isFlashActive: true,
    },
  );

  // act
  await render(<HudSurface {...properties} />);

  // assert
  await expect
    .element(page.getByTestId("counter-panel"))
    .toHaveClass("bg-[#32252a]");
  await expect
    .element(page.getByTestId("counter-panel"))
    .not.toHaveClass("border-[#7a4f54]");
});
