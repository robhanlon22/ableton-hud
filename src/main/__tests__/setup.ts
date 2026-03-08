import { restoreProcessPlatform } from "@main/app/__tests__/utilities";
import { afterEach, vi } from "vitest";

const MICROTASK_FLUSH_COUNT = 8;

/**
 * Drains pending microtasks between node tests.
 * @returns A promise that resolves after the queued ticks settle.
 */
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
