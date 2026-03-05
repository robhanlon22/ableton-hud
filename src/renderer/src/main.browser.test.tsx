import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

vi.mock("./app/hud-app", () => ({
  HudApp: () => <div data-testid="mock-hud-app" />,
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
    await expect(import("./main?case=no-root")).rejects.toThrow(
      "Root element not found",
    );
  });

  it("mounts HudApp into root", async () => {
    // arrange
    document.body.innerHTML = '<div id="root"></div>';

    // act
    await import("./main?case=with-root");

    // assert
    await expect.element(page.getByTestId("mock-hud-app")).toBeInTheDocument();
  });
});
