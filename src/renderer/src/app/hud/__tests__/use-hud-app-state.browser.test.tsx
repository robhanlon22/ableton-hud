import {
  installResolvedHudApiMock,
  makeHudState,
} from "@renderer/app/hud/__tests__/application-browser-support";
import { useEffect } from "react";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useHudAppState } from "../use-hud-app-state";

/**
 * Triggers compact-mode activation without mounting a compact panel element.
 * @returns A minimal test harness.
 */
function CompactFallbackHarness() {
  const { onToggleCompactView } = useHudAppState();

  useEffect(() => {
    onToggleCompactView();
  }, []);

  return <div data-testid="compact-fallback-harness" />;
}

it("uses the fallback compact height when no panel element is attached", async () => {
  // arrange
  const hudApi = installResolvedHudApiMock(
    makeHudState({ counterText: "6:6:6" }),
  );

  // act
  await render(<CompactFallbackHarness />);

  // assert
  await vi.waitFor(() => {
    expect(hudApi.setCompactView).toHaveBeenCalledWith({
      enabled: true,
      height: 5,
      width: 320,
    });
  });
});
