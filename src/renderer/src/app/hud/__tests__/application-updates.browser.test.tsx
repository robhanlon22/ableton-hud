import {
  installResolvedHudApiMock,
  makeHudState,
  makeMetadataPlaceholderHudState,
} from "@renderer/app/hud/__tests__/application-browser-support";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { HudApp } from "..";
import { STANDARD_FLASH_MS } from "../timing";

afterEach(() => {
  vi.useRealTimers();
});

it("applies incoming state updates immediately", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "1:1:1" }),
  );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "1:1:1",
    );
  });
  hudApi.emit(
    makeHudState({
      clipColor: 0xaa_bb_cc,
      clipIndex: 4,
      clipName: "Lead",
      counterText: "5:5:5",
      trackIndex: 1,
    }),
  );

  // assert
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "5:5:5",
    );
    expect(page.getByTestId("clip-pill").element().textContent).toBe("Lead");
  });
});

it("clears clip color immediately when incoming clip color is absent", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ clipColor: 0x11_22_33, counterText: "2:2:2" }),
  );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "2:2:2",
    );
  });
  await vi.waitFor(() => {
    expect(page.getByTestId("clip-pill").element().style.backgroundColor).toBe(
      "rgb(17, 34, 51)",
    );
  });
  hudApi.emit(makeMetadataPlaceholderHudState({ counterText: "2:2:3" }));

  // assert
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "2:2:3",
    );
    expect(page.getByTestId("clip-pill").element().style.backgroundColor).toBe(
      "",
    );
  });
});

it("turns off flash state after the duration window", async () => {
  // arrange
  vi.useFakeTimers();
  const hudApi = installResolvedHudApiMock(
    makeHudState({
      beatFlashToken: 5,
      counterText: "4:1:1",
      isDownbeat: false,
      isLastBar: false,
    }),
  );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "4:1:1",
    );
  });
  const counterPanelClassNameBefore =
    page.getByTestId("counter-panel").element().getAttribute("class") ?? "";
  await vi.advanceTimersByTimeAsync(STANDARD_FLASH_MS);
  hudApi.emit(
    makeHudState({
      beatFlashToken: 5,
      counterText: "4:1:2",
      isDownbeat: false,
      isLastBar: false,
    }),
  );

  // assert
  expect(counterPanelClassNameBefore).toContain("border-[#4a5a45]");
  await vi.waitFor(() => {
    const counterPanelClassNameAfter =
      page.getByTestId("counter-panel").element().getAttribute("class") ?? "";
    expect(counterPanelClassNameAfter).not.toContain("border-[#4a5a45]");
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "4:1:2",
    );
  });
});

it("transitions status and metadata through disconnect and reconnect updates", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({
      clipName: "Clip A",
      connected: true,
      counterText: "3:2:1",
      isPlaying: true,
      sceneName: "Scene A",
      trackName: "Track A",
    }),
  );

  // act
  await render(<HudApp />);
  await vi.waitFor(() => {
    expect(page.getByLabelText("Playing").element()).toBeInstanceOf(
      HTMLElement,
    );
    expect(page.getByTestId("track-pill").element().textContent).toContain(
      "Track A",
    );
  });
  hudApi.emit(
    makeMetadataPlaceholderHudState({
      connected: false,
      counterText: "0:0:0",
      isPlaying: false,
    }),
  );
  await vi.waitFor(() => {
    expect(page.getByLabelText("Disconnected").element()).toBeInstanceOf(
      HTMLElement,
    );
    expect(page.getByTestId("status-badge").element().textContent).toContain(
      "Disconnected",
    );
    expect(page.getByTestId("clip-pill").element().textContent).toBe("-");
    expect(page.getByTestId("track-pill").element().textContent).toBe("-");
    expect(page.getByTestId("scene-pill").element().textContent).toBe("-");
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "0:0:0",
    );
    expect(
      page.getByTestId("counter-text").element().getAttribute("class"),
    ).toContain("text-zinc-500");
  });
  hudApi.emit(
    makeHudState({
      clipName: "Clip B",
      connected: true,
      counterText: "9:1:2",
      isPlaying: true,
      sceneName: "Scene B",
      trackName: "Track B",
    }),
  );

  // assert
  await vi.waitFor(() => {
    expect(page.getByLabelText("Playing").element()).toBeInstanceOf(
      HTMLElement,
    );
    expect(page.getByTestId("track-pill").element().textContent).toContain(
      "Track B",
    );
    expect(page.getByTestId("scene-pill").element().textContent).toContain(
      "Scene B",
    );
    expect(page.getByTestId("clip-pill").element().textContent).toContain(
      "Clip B",
    );
    expect(page.getByTestId("counter-text").element().textContent).toBe(
      "9:1:2",
    );
  });
});
