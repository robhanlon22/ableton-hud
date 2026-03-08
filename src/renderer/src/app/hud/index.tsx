import { HudSurface } from "./surface";
import { useHudAppState } from "./use-hud-app-state";

/**
 * Connects the HUD surface to window APIs and local view state.
 * @returns The live HUD application element.
 */
export function HudApp(): React.JSX.Element {
  return <HudSurface {...useHudAppState()} />;
}

export { HudSurface } from "./surface";
