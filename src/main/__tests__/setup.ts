import { restoreProcessPlatform } from "@main/__tests__/index-test-utilities";
import { afterEach, vi } from "vitest";

const MICROTASK_FLUSH_COUNT = 8;

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < MICROTASK_FLUSH_COUNT; index += 1) {
    await Promise.resolve();
  }
};

afterEach(async () => {
  await flushMicrotasks();
  restoreProcessPlatform();
  vi.resetModules();
});
