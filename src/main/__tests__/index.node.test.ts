import { beforeEach, expect, it, vi } from "vitest";

const queueApplicationStartMock = vi.fn<() => void>();

beforeEach(() => {
  vi.resetModules();
  queueApplicationStartMock.mockReset();
  vi.doMock("@main/app", () => ({
    queueApplicationStart: queueApplicationStartMock,
  }));
});

it("queues application startup from the root main entrypoint", async () => {
  // arrange

  // act
  await import("@main/index");

  // assert
  expect(queueApplicationStartMock).toHaveBeenCalledTimes(1);
});
