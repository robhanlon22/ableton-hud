import "vitest-browser-react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
});
