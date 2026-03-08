import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

/**
 * Renders the mocked HUD app used by the renderer entry tests.
 * @returns The mocked HUD root element.
 */
function MockHudApp() {
  return <div data-testid="mock-hud-app" />;
}

vi.mock("../app/hud", () => ({
  HudApp: MockHudApp,
}));

describe("renderer entry", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  it("throws when root element is missing", async () => {
    // arrange
    // act
    // assert
    await expect(import("../main?case=no-root")).rejects.toThrow(
      "Root element not found",
    );
  });

  it("mounts HudApp into root", async () => {
    // arrange
    document.body.innerHTML = '<div id="root"></div>';

    // act
    await import("../main?case=with-root");

    // assert
    await expect.element(page.getByTestId("mock-hud-app")).toBeInTheDocument();
  });
});
