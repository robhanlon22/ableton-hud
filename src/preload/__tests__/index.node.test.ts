import { beforeEach, expect, it, vi } from "vitest";

const exposeHudApiMock = vi.fn<() => void>();

beforeEach(() => {
  vi.resetModules();
  exposeHudApiMock.mockReset();
  vi.doMock("@preload/hud-api", () => ({
    exposeHudApi: exposeHudApiMock,
  }));
});

it("exposes hudApi from the root preload entrypoint", async () => {
  // arrange

  // act
  await import("@preload/index");

  // assert
  expect(exposeHudApiMock).toHaveBeenCalledTimes(1);
});
