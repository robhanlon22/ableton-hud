import type { HudMode, HudState } from "@shared/types";
import type { RefObject } from "react";

import { createDefaultHudState } from "@shared/ipc";
import { useEffect, useRef, useState } from "react";

import { getHudApi, type HudApi } from "./api";
import { flashDuration } from "./timing";

const COMPACT_FALLBACK_HEIGHT = 1;
const COMPACT_HEIGHT_PADDING = 4;
const COMPACT_MAX_WIDTH = 370;
const COMPACT_MIN_WIDTH = 320;
const COUNTER_CHARACTER_WIDTH = 52;

/**
 * Aggregates renderer HUD state, refs, and UI event handlers for the app shell.
 */
interface HudAppState {
  /** Ref for measuring the compact counter panel. */
  compactPanelRef: RefObject<HTMLDivElement | null>;
  /** Whether the HUD is currently rendering its compact layout. */
  isCompactView: boolean;
  /** Whether the transient beat flash is active. */
  isFlashActive: boolean;
  /** Toggles compact mode and requests the matching resize. */
  onToggleCompactView: () => void;
  /** Switches between elapsed and remaining counter modes. */
  onToggleMode: () => void;
  /** Toggles the always-on-top window preference. */
  onToggleTopmost: () => void;
  /** Toggles track-lock state for the selected track. */
  onToggleTrackLock: () => void;
  /** Current validated HUD state. */
  state: HudState;
}

/**
 * Builds the renderer-side HUD state model and toggle handlers.
 * @returns The current HUD state and UI callbacks.
 */
export const useHudAppState = (): HudAppState => {
  // eslint-disable-next-line unicorn/prevent-abbreviations -- React ref identifiers should end in `Ref`.
  const compactPanelElementRef = useRef<HTMLDivElement>(null);
  const [hudState, setHudState] = useState<HudState>(() =>
    createDefaultHudState(),
  );
  const [isCompactView, setIsCompactView] = useState(false);
  const [isFlashActive, setIsFlashActive] = useState(false);
  // eslint-disable-next-line unicorn/prevent-abbreviations -- React ref identifiers must end in `Ref`.
  const lastFlashTokenReferenceRef = useRef(-1);

  useBeatFlashLifecycle(hudState, lastFlashTokenReferenceRef, setIsFlashActive);
  useCompactResizeLifecycle(
    compactPanelElementRef,
    hudState.counterText,
    isCompactView,
    setIsCompactView,
  );
  useHudStateSubscription(setHudState, setIsCompactView);

  /**
   * Toggles compact mode and requests the matching window resize.
   */
  const onToggleCompactView = (): void => {
    if (isCompactView) {
      disableCompactView(setIsCompactView);
      void getHudApi().setCompactView({ enabled: false });
      return;
    }

    setIsCompactView(true);
  };

  /**
   * Switches the counter between elapsed and remaining time modes.
   */
  const onToggleMode = (): void => {
    const nextMode: HudMode =
      hudState.mode === "elapsed" ? "remaining" : "elapsed";
    void getHudApi().setMode(nextMode);
  };

  return {
    compactPanelRef: compactPanelElementRef,
    isCompactView,
    isFlashActive,
    onToggleCompactView,
    onToggleMode,
    onToggleTopmost: toggleTopmost,
    onToggleTrackLock: toggleTrackLock,
    state: hudState,
  };
};

/**
 * Enables the transient beat flash state.
 * @param setIsFlashActive - React state setter for flash visibility.
 */
const activateFlash = (setIsFlashActive: (enabled: boolean) => void): void => {
  setIsFlashActive(true);
};

/**
 * Applies a newly received HUD state snapshot to local React state.
 * @param nextState - The validated HUD state from preload.
 * @param setHudState - React state setter for the HUD snapshot.
 * @param setIsCompactView - React state setter for compact-mode visibility.
 */
const applyIncomingState = (
  nextState: HudState,
  setHudState: (nextState: HudState) => void,
  setIsCompactView: (enabled: boolean) => void,
): void => {
  setIsCompactView(nextState.compactView);
  setHudState(nextState);
};

/**
 * Clears local compact-mode state after a failed or explicit exit transition.
 * @param setIsCompactView - React state setter for compact-mode visibility.
 */
const disableCompactView = (
  setIsCompactView: (enabled: boolean) => void,
): void => {
  setIsCompactView(false);
};

/**
 * Loads the initial HUD state from the preload API with a local fallback.
 * @param hudApi - The validated preload API surface.
 * @returns The initial HUD state snapshot for the renderer.
 */
const loadInitialHudState = async (hudApi: HudApi): Promise<HudState> => {
  try {
    return await hudApi.getInitialState();
  } catch {
    return createDefaultHudState();
  }
};

/**
 * Schedules a compact-mode resize request after the next layout frame.
 * @param compactPanelReference - Ref for the compact counter panel element.
 * @param counterText - The current counter string used to estimate width.
 * @param setIsCompactView - React state setter for compact-mode visibility.
 */
const requestCompactResize = (
  compactPanelReference: RefObject<HTMLDivElement | null>,
  counterText: string,
  setIsCompactView: (enabled: boolean) => void,
): void => {
  globalThis.requestAnimationFrame(() => {
    const compactHeight = resolveCompactHeight(compactPanelReference.current);
    const compactWidth = resolveCompactWidth(counterText);

    void getHudApi()
      .setCompactView({
        enabled: true,
        height: compactHeight,
        width: compactWidth,
      })
      .catch(() => {
        disableCompactView(setIsCompactView);
      });
  });
};

/**
 * Resolves the compact panel height from the measured element bounds.
 * @param panelElement - The compact panel element, if currently mounted.
 * @returns The compact panel height to send to the main process.
 */
const resolveCompactHeight = (panelElement: HTMLDivElement | null): number => {
  const panelRect = panelElement?.getBoundingClientRect();
  return Math.max(
    COMPACT_FALLBACK_HEIGHT,
    Math.ceil(
      (panelRect?.height ?? COMPACT_FALLBACK_HEIGHT) + COMPACT_HEIGHT_PADDING,
    ),
  );
};

/**
 * Resolves the compact panel width from the counter text length.
 * @param counterText - The visible counter text.
 * @returns The compact panel width to send to the main process.
 */
const resolveCompactWidth = (counterText: string): number => {
  return Math.min(
    COMPACT_MAX_WIDTH,
    Math.max(
      COMPACT_MIN_WIDTH,
      Math.ceil((counterText.length + 1) * COUNTER_CHARACTER_WIDTH),
    ),
  );
};

/**
 * Forwards the topmost toggle request to the preload API.
 */
const toggleTopmost = (): void => {
  void getHudApi().toggleTopmost();
};

/**
 * Forwards the track-lock toggle request to the preload API.
 */
const toggleTrackLock = (): void => {
  void getHudApi().toggleTrackLock();
};

/**
 * Tracks beat-flash tokens and clears the flash after the computed duration.
 * @param hudState - The latest HUD state snapshot.
 * @param lastFlashTokenReference - Ref holding the previous beat flash token.
 * @param setIsFlashActive - React state setter for flash visibility.
 */
const useBeatFlashLifecycle = (
  hudState: HudState,
  lastFlashTokenReference: RefObject<number>,
  setIsFlashActive: (enabled: boolean) => void,
): void => {
  useEffect(() => {
    if (hudState.beatFlashToken === lastFlashTokenReference.current) {
      return;
    }

    lastFlashTokenReference.current = hudState.beatFlashToken;
    activateFlash(setIsFlashActive);

    const timer = globalThis.setTimeout(() => {
      setIsFlashActive(false);
    }, flashDuration(hudState));

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [hudState, lastFlashTokenReference, setIsFlashActive]);
};

/**
 * Recomputes compact-mode bounds whenever the compact counter content changes.
 * @param compactPanelReference - Ref for the compact counter panel element.
 * @param counterText - The visible counter text.
 * @param isCompactView - Whether compact mode is active.
 * @param setIsCompactView - React state setter for compact-mode visibility.
 */
const useCompactResizeLifecycle = (
  compactPanelReference: RefObject<HTMLDivElement | null>,
  counterText: string,
  isCompactView: boolean,
  setIsCompactView: (enabled: boolean) => void,
): void => {
  useEffect(() => {
    if (!isCompactView) {
      return;
    }

    requestCompactResize(compactPanelReference, counterText, setIsCompactView);
  }, [compactPanelReference, counterText, isCompactView, setIsCompactView]);
};

/**
 * Subscribes the renderer to HUD state pushes from the preload API.
 * @param setHudState - React state setter for the HUD snapshot.
 * @param setIsCompactView - React state setter for compact-mode visibility.
 */
const useHudStateSubscription = (
  setHudState: (nextState: HudState) => void,
  setIsCompactView: (enabled: boolean) => void,
): void => {
  useEffect(() => {
    const hudApi = getHudApi();
    let isMounted = true;

    /**
     * Applies pushed HUD state only while the subscription is mounted.
     * @param nextState - The next HUD state snapshot from preload.
     */
    const updateState = (nextState: HudState): void => {
      if (!isMounted) {
        return;
      }

      applyIncomingState(nextState, setHudState, setIsCompactView);
    };

    void loadInitialHudState(hudApi).then(updateState);
    const unsubscribe = hudApi.onHudState(updateState);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [setHudState, setIsCompactView]);
};
