import { Pin, PinOff, Play, Square, WifiOff } from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { HudMode, HudState } from "../../../shared/types";

import { createDefaultHudState } from "../../../shared/ipc";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { cn } from "../lib/utils";
import { flashDuration } from "./hud-timing";

const CLIP_HANDOFF_HOLD_MS = 90;

export interface HudSurfaceProps {
  isFlashActive: boolean;
  onToggleMode: () => void;
  onToggleTopmost: () => void;
  state: HudState;
}

type ClipColorState = Pick<
  HudState,
  "clipColor" | "clipIndex" | "isPlaying" | "trackIndex"
>;

type StatusKind = "disconnected" | "playing" | "stopped";

/**
 * Connects the HUD surface to window APIs and local view state.
 * @returns The live HUD application element.
 */
export function HudApp(): React.JSX.Element {
  const [hudState, setHudState] = useState<HudState>(() =>
    createDefaultHudState(),
  );
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [heldClipColor, setHeldClipColor] = useState<null | number>(null);
  const lastFlashToken = useRef(-1);
  const latestHudStateRef = useRef<HudState>(hudState);
  const pendingNullClipStateRef = useRef<HudState>(hudState);
  const pendingNullClipTimerRef = useRef<null | number>(null);

  useEffect(() => {
    setHeldClipColor((previousHeldColor) =>
      resolveHeldClipColor(previousHeldColor, hudState),
    );
  }, [
    hudState.isPlaying,
    hudState.trackIndex,
    hudState.clipIndex,
    hudState.clipColor,
  ]);

  useEffect(() => {
    latestHudStateRef.current = hudState;
  }, [hudState]);

  useEffect(() => {
    let mounted = true;

    const applyIncomingState = (nextState: HudState): void => {
      const previousState = latestHudStateRef.current;

      if (shouldHoldNullClipTransition(previousState, nextState)) {
        pendingNullClipStateRef.current = nextState;
        pendingNullClipTimerRef.current ??= window.setTimeout(() => {
          const pendingState = pendingNullClipStateRef.current;
          latestHudStateRef.current = pendingState;
          setHudState(pendingState);

          pendingNullClipStateRef.current = pendingState;
          pendingNullClipTimerRef.current = null;
        }, CLIP_HANDOFF_HOLD_MS);
        return;
      }

      if (pendingNullClipTimerRef.current !== null) {
        window.clearTimeout(pendingNullClipTimerRef.current);
        pendingNullClipTimerRef.current = null;
      }
      pendingNullClipStateRef.current = nextState;

      latestHudStateRef.current = nextState;
      setHudState(nextState);
    };

    void window.hudApi
      .getInitialState()
      .then((initialState) => {
        if (mounted) {
          latestHudStateRef.current = initialState;
          setHudState(initialState);
        }
      })
      .catch(() => {
        if (mounted) {
          const fallbackState = createDefaultHudState();
          latestHudStateRef.current = fallbackState;
          setHudState(fallbackState);
        }
      });

    const unsubscribe = window.hudApi.onHudState((state) => {
      if (mounted) {
        applyIncomingState(state);
      }
    });

    return () => {
      mounted = false;
      if (pendingNullClipTimerRef.current !== null) {
        window.clearTimeout(pendingNullClipTimerRef.current);
        pendingNullClipTimerRef.current = null;
      }
      pendingNullClipStateRef.current = latestHudStateRef.current;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (hudState.beatFlashToken === lastFlashToken.current) {
      return;
    }

    lastFlashToken.current = hudState.beatFlashToken;
    setIsFlashActive(true);

    const timer = window.setTimeout(() => {
      setIsFlashActive(false);
    }, flashDuration(hudState));

    return () => {
      window.clearTimeout(timer);
    };
  }, [hudState]);

  const onToggleMode = (): void => {
    const nextMode: HudMode =
      hudState.mode === "elapsed" ? "remaining" : "elapsed";
    void window.hudApi.setMode(nextMode);
  };

  const onToggleTopmost = (): void => {
    void window.hudApi.toggleTopmost();
  };

  const renderState = useMemo(() => {
    const hasActiveClip =
      hudState.trackIndex !== null && hudState.clipIndex !== null;
    const clipColor = hasActiveClip
      ? (hudState.clipColor ?? heldClipColor)
      : null;

    if (clipColor === hudState.clipColor) {
      return hudState;
    }
    return {
      ...hudState,
      clipColor,
    };
  }, [hudState, heldClipColor]);

  return (
    <HudSurface
      isFlashActive={isFlashActive}
      onToggleMode={onToggleMode}
      onToggleTopmost={onToggleTopmost}
      state={renderState}
    />
  );
}

/**
 * Renders the presentational HUD surface for a single state snapshot.
 * @param props - HUD render props including state and action handlers.
 * @returns The HUD surface element.
 */
export function HudSurface(props: HudSurfaceProps): React.JSX.Element {
  const { isFlashActive, onToggleMode, onToggleTopmost, state } = props;
  const status = statusKind(state);
  const clipStyle = metadataPillStyle(state.clipColor);
  const trackStyle = metadataPillStyle(state.trackColor);
  const sceneStyle = metadataPillStyle(state.sceneColor);

  const frameClass = useMemo(() => {
    return cn(
      "h-full w-full overflow-hidden border border-[#4c525c] bg-ableton-bg text-ableton-text",
      "bg-[linear-gradient(180deg,#2b3038_0%,#232830_20%,#1a1e26_100%)]",
      state.isLastBar && "text-ableton-warning",
    );
  }, [state.isLastBar]);

  const flashClass = useMemo(
    () => panelFlashClass(state, isFlashActive),
    [state, isFlashActive],
  );

  return (
    <div className={frameClass} data-testid="hud-root">
      <Card className="flex h-full flex-col rounded-sm border-[#3a4049] bg-ableton-panelAlt/95">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
              <div
                className={cn(
                  "flex h-6 min-w-0 items-center justify-center rounded-[4px] border px-1 font-ui text-[11px] font-medium leading-none",
                  state.clipColor === null
                    ? "border-[#5a616d] bg-[#2a3037] text-ableton-text"
                    : "border-transparent",
                )}
                data-testid="clip-pill"
                style={clipStyle}
              >
                <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center">
                  {displayName(state.clipName)}
                </span>
              </div>
              <div
                className={cn(
                  "flex h-6 min-w-0 items-center justify-center rounded-[4px] border px-1 font-ui text-[11px] font-medium leading-none",
                  state.trackColor === null
                    ? "border-[#5a616d] bg-[#2a3037] text-ableton-text"
                    : "border-transparent",
                )}
                data-testid="track-pill"
                style={trackStyle}
              >
                <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center">
                  {displayName(state.trackName)}
                </span>
              </div>
              <div
                className={cn(
                  "flex h-6 min-w-0 items-center justify-center rounded-[4px] border px-1 font-ui text-[11px] font-medium leading-none",
                  state.sceneColor === null
                    ? "border-[#5a616d] bg-[#2a3037] text-ableton-text"
                    : "border-transparent",
                )}
                data-testid="scene-pill"
                style={sceneStyle}
              >
                <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center">
                  {displayName(state.sceneName)}
                </span>
              </div>
            </div>
            <div className="flex items-center">
              <Badge
                aria-label={statusLabel(status)}
                className="h-6 w-6 justify-center px-0 py-0"
                title={statusLabel(status)}
                variant={statusVariant(state)}
              >
                {statusIcon(status)}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex flex-1 flex-col justify-center pb-2 pt-2">
          <div
            className={cn(
              "rounded-sm border border-ableton-border bg-ableton-panel px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-100",
              state.isLastBar && "border-[#705858] bg-zinc-900/95",
              flashClass,
            )}
          >
            <div
              className={cn(
                "font-mono text-[48px] font-semibold leading-none tracking-tight text-ableton-success sm:text-[56px]",
                state.isLastBar && "text-ableton-warning",
              )}
              data-testid="counter-text"
            >
              {state.counterText}
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-1">
          <div className="flex w-full items-center gap-2">
            <Button
              className={cn(
                "h-8 flex-1 rounded-sm border text-[10px] uppercase tracking-[0.08em] transition-colors",
                state.mode === "elapsed"
                  ? "border-ableton-accent bg-zinc-900 text-ableton-accent hover:bg-zinc-800"
                  : "border-emerald-400/75 bg-emerald-400/18 text-emerald-200 hover:bg-emerald-400/28",
              )}
              data-testid="mode-toggle"
              onClick={onToggleMode}
              variant="ghost"
            >
              {modeLabel(state.mode)}
            </Button>
            <Button
              aria-label={
                state.alwaysOnTop ? "Set window normal" : "Set window floating"
              }
              className={cn(
                "h-7 w-7 rounded-full border p-0 transition-colors",
                state.alwaysOnTop
                  ? "border-cyan-400/80 bg-cyan-400/20 text-cyan-300 hover:bg-cyan-400/30"
                  : "border-ableton-border bg-transparent text-ableton-muted hover:border-zinc-500 hover:bg-transparent hover:text-ableton-text",
              )}
              onClick={onToggleTopmost}
              title={state.alwaysOnTop ? "FLOAT" : "NORMAL"}
              variant="ghost"
            >
              {state.alwaysOnTop ? (
                <Pin className="h-3.5 w-3.5" />
              ) : (
                <PinOff className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Resolves the clip color shown during transient clip/track handoffs.
 * @param previousHeldColor - The last non-null clip color currently held.
 * @param nextState - The newest clip color-related playback state.
 * @returns The clip color to render, or `null` when nothing should be held.
 */
export function resolveHeldClipColor(
  previousHeldColor: null | number,
  nextState: ClipColorState,
): null | number {
  if (!nextState.isPlaying) {
    return null;
  }

  if (nextState.trackIndex === null || nextState.clipIndex === null) {
    return previousHeldColor;
  }

  return nextState.clipColor ?? previousHeldColor;
}

/**
 * Determines whether a null clip update should be delayed during track handoff.
 * @param previous - The previously rendered HUD state.
 * @param next - The next incoming HUD state.
 * @returns `true` when a temporary null clip should be held, otherwise `false`.
 */
export function shouldHoldNullClipTransition(
  previous: HudState,
  next: HudState,
): boolean {
  if (
    !next.isPlaying ||
    next.clipIndex !== null ||
    previous.clipIndex === null
  ) {
    return false;
  }

  if (previous.trackIndex === null || next.trackIndex === null) {
    return false;
  }

  // Only smooth across track handoffs where AbletonOSC frequently emits a brief null clip state.
  return previous.trackIndex !== next.trackIndex;
}

/**
 * Picks a readable foreground color for a metadata pill background.
 * @param color - RGB color value used for the pill background.
 * @returns A hex foreground color string with better contrast.
 */
function clipTextColor(color: number): string {
  const luminance = relativeLuminance(color);
  const whiteContrast = contrastRatio(luminance, 1);
  const darkContrast = contrastRatio(luminance, relativeLuminance(0x101216));
  return whiteContrast >= darkContrast ? "#ffffff" : "#101216";
}

/**
 * Computes WCAG-style contrast ratio from two luminance values.
 * @param l1 - First relative luminance value.
 * @param l2 - Second relative luminance value.
 * @returns The contrast ratio between the two luminance values.
 */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Normalizes nullable metadata labels for UI display.
 * @param value - Nullable name value from HUD state.
 * @returns A trimmed display string, or an empty string when absent.
 */
function displayName(value: null | string): string {
  return value?.trim() ?? "";
}

/**
 * Builds inline styles for a metadata pill from an optional clip color.
 * @param color - Nullable RGB color value from Ableton metadata.
 * @returns Inline style properties, or `undefined` when no color exists.
 */
function metadataPillStyle(color: null | number): CSSProperties | undefined {
  if (color === null) {
    return undefined;
  }

  const rgb = color >>> 0;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const hex = `#${rgb.toString(16).padStart(6, "0")}`;
  return {
    backgroundColor: hex,
    borderColor: `rgba(${String(r)}, ${String(g)}, ${String(b)}, 0.95)`,
    color: clipTextColor(rgb),
  };
}

/**
 * Converts HUD mode enum values into user-facing labels.
 * @param mode - Current HUD counter mode.
 * @returns The label to render for the mode toggle button.
 */
function modeLabel(mode: HudMode): string {
  return mode === "elapsed" ? "Elapsed" : "Remaining";
}

/**
 * Selects panel highlight classes for the active beat flash state.
 * @param state - HUD state containing downbeat/last-bar flags.
 * @param isFlashActive - Whether flash styling should currently be shown.
 * @returns A space-delimited class string for flash styling.
 */
function panelFlashClass(state: HudState, isFlashActive: boolean): string {
  if (!isFlashActive) {
    return "";
  }

  if (state.isLastBar && state.isDownbeat) {
    return "border-[#83545a] bg-[#37262b]";
  }
  if (state.isLastBar) {
    return "border-[#7a4f54] bg-[#32252a]";
  }
  if (state.isDownbeat) {
    return "border-[#546a4b] bg-[#2a3327]";
  }
  return "border-[#4a5a45] bg-[#272f25]";
}

/**
 * Converts an RGB color into a relative luminance value.
 * @param color - RGB color value encoded as a number.
 * @returns The computed relative luminance.
 */
function relativeLuminance(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/**
 * Converts an sRGB color channel to linear-light space.
 * @param channel - 8-bit sRGB channel value.
 * @returns The linearized channel value.
 */
function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

/**
 * Returns the icon used for a given transport status.
 * @param status - Transport status to visualize.
 * @returns The status icon element.
 */
function statusIcon(status: StatusKind): React.JSX.Element {
  if (status === "playing") {
    return <Play aria-hidden className="h-3.5 w-3.5 fill-current" />;
  }
  if (status === "stopped") {
    return <Square aria-hidden className="h-3 w-3 fill-current" />;
  }
  return <WifiOff aria-hidden className="h-3.5 w-3.5" />;
}

/**
 * Maps transport and connection state to a compact status kind.
 * @param state - HUD state snapshot.
 * @returns The derived status kind.
 */
function statusKind(state: HudState): StatusKind {
  if (!state.connected) {
    return "disconnected";
  }
  if (state.isPlaying) {
    return "playing";
  }
  return "stopped";
}

/**
 * Maps a status kind to the corresponding user-facing label.
 * @param status - Status kind returned by {@link statusKind}.
 * @returns A short status label for accessibility text.
 */
function statusLabel(status: StatusKind): string {
  if (status === "playing") {
    return "Playing";
  }
  if (status === "stopped") {
    return "Stopped";
  }
  return "Disconnected";
}

/**
 * Chooses badge variant colors from the current transport state.
 * @param state - HUD state used to determine visual badge variant.
 * @returns The badge variant name for the status indicator.
 */
function statusVariant(
  state: HudState,
): "neutral" | "offline" | "success" | "warning" {
  const status = statusKind(state);
  if (status === "disconnected") {
    return "offline";
  }
  if (status === "playing") {
    return state.isLastBar ? "warning" : "success";
  }
  return "neutral";
}
