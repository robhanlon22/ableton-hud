import {
  installRejectedHudApiMock,
  installResolvedHudApiMock,
  makeHudState,
} from "@renderer/app/hud/__tests__/application-browser-support";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudApp } from "..";

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
  await page.getByLabelText("Set window floating").click();
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
  expect(page.getByLabelText("Set window normal").element()).toBeInstanceOf(
    HTMLElement,
  );
});
