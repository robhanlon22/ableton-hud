import {
  installRejectedHudApiMock,
  installResolvedHudApiMock,
  makeHudState,
} from "@renderer/app/hud/__tests__/application-browser-support";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudApp } from "..";

const MEASURED_COMPACT_PANEL_HEIGHT = 20;
const MEASURED_COMPACT_PANEL_WIDTH = 200;

it("hydrates from hudApi and forwards toggle commands", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({
      alwaysOnTop: false,
      counterText: "3:2:1",
      mode: "remaining",
    }),
  );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "3:2:1",
    );
  });
  await page.getByTestId("mode-toggle").click();
  await page.getByTestId("topmost-toggle").click();
  await page.getByTestId("track-lock-toggle").click();

  // assert
  expect(page.getByTestId("mode-toggle").element().textContent).toContain(
    "Remaining",
  );
  expect(hudApi.setMode).toHaveBeenCalledWith("elapsed");
  expect(hudApi.toggleTrackLock).toHaveBeenCalledTimes(1);
  expect(hudApi.toggleTopmost).toHaveBeenCalledTimes(1);
});

it("toggles mode from elapsed to remaining", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(makeHudState({ mode: "elapsed" }));

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("mode-toggle").element().textContent).toBe(
      "Elapsed",
    );
  });
  await page.getByTestId("mode-toggle").click();

  // assert
  expect(hudApi.setMode).toHaveBeenCalledWith("remaining");
});

it("toggles compact view and forwards window resize requests", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6", mode: "elapsed" }),
  );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "6:6:6",
    );
  });
  await page.getByTestId("compact-toggle").click();
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      }),
    );
  });
  await expect.element(page.getByTestId("mode-toggle")).not.toBeInTheDocument();
  await page.getByTestId("compact-toggle").click();

  // assert
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({ enabled: false });
  });
  await vi.waitFor(() => {
    expect(page.getByTestId("mode-toggle").element().textContent).toBe(
      "Elapsed",
    );
  });
});

it("restores full view when compact resize request fails", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6", mode: "elapsed" }),
  );
  hudApi.setCompactView.mockRejectedValueOnce(new Error("failed"));

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "6:6:6",
    );
  });
  await page.getByTestId("compact-toggle").click();

  // assert
  await vi.waitFor(() => {
    expect(page.getByTestId("mode-toggle").element().textContent).toBe(
      "Elapsed",
    );
  });
});

it("uses minimal compact dimensions when panel ref reports zero size", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6" }),
  );
  const getBoundingClientRectSpy = vi
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => new DOMRect());

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "6:6:6",
    );
  });
  await page.getByTestId("compact-toggle").click();

  // assert
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 4,
      width: 320,
    });
  });
  getBoundingClientRectSpy.mockRestore();
});

it("does not resend compact resize for same-width compact counter updates", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6", mode: "elapsed" }),
  );
  const getBoundingClientRectSpy = vi
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockImplementation(
      () =>
        new DOMRect(
          0,
          0,
          MEASURED_COMPACT_PANEL_WIDTH,
          MEASURED_COMPACT_PANEL_HEIGHT,
        ),
    );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "6:6:6",
    );
  });
  await page.getByTestId("compact-toggle").click();
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 24,
      width: 320,
    });
  });
  hudApi.setCompactView.mockClear();
  hudApi.emit(makeHudState({ compactView: true, counterText: "7:7:7" }));
  await new Promise<void>((resolve) => {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        resolve();
      });
    });
  });

  // assert
  expect(page.getByTestId("counter-text").element().textContent).toBe("7:7:7");
  expect(hudApi.setCompactView).not.toHaveBeenCalled();
  getBoundingClientRectSpy.mockRestore();
});

it("resends compact resize when compact counter text changes the computed width", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6", mode: "elapsed" }),
  );
  const getBoundingClientRectSpy = vi
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockImplementation(
      () =>
        new DOMRect(
          0,
          0,
          MEASURED_COMPACT_PANEL_WIDTH,
          MEASURED_COMPACT_PANEL_HEIGHT,
        ),
    );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "6:6:6",
    );
  });
  await page.getByTestId("compact-toggle").click();
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 24,
      width: 320,
    });
  });
  hudApi.setCompactView.mockClear();
  hudApi.emit(makeHudState({ compactView: true, counterText: "12:3:4" }));

  // assert
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledTimes(1);
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 24,
      width: 364,
    });
  });
  getBoundingClientRectSpy.mockRestore();
});

it("falls back to default hud state when initial load fails", async () => {
  // arrange
  installRejectedHudApiMock();

  // act
  await render(<HudApp />);

  // assert
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "0:0:0",
    );
  });
  expect(page.getByTestId("mode-toggle").element().textContent).toContain(
    "Elapsed",
  );
  expect(page.getByTestId("topmost-toggle").element()).toBeInstanceOf(
    HTMLElement,
  );
});
