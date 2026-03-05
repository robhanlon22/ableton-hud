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
    await expect(import("./main?case=no-root")).rejects.toThrow(
      "Root element not found",
    );
  });

  it("mounts HudApp into root", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("./main?case=with-root");

    await expect.element(page.getByTestId("mock-hud-app")).toBeInTheDocument();
  });
});
