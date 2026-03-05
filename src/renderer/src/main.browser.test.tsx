import { beforeEach, describe, expect, it, vi } from "vitest";

const createRootMock = vi.fn(() => ({
  render: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("./app/hud-app", () => ({
  HudApp: () => null,
}));

describe("renderer entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(createRootMock).toHaveBeenCalledTimes(1);
  });
});
