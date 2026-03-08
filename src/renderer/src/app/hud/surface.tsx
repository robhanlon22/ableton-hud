import type { HudState } from "@shared/types";
import type { RefObject } from "react";

import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@renderer/components/ui/card";
import { Separator } from "@renderer/components/ui/separator";
import { Tooltip } from "@renderer/components/ui/tooltip";
import {
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Play,
  Square,
  WifiOff,
} from "lucide-react";

import {
  counterPanelClassName,
  counterTextClassName,
  displayName,
  frameClassName,
  metadataPillStyle,
  modeLabel,
  statusKind,
  type StatusKind,
  statusLabel,
  statusVariant,
} from "./surface-helpers";

/**
 * Props for the top-level HUD surface component.
 */
export interface HudSurfaceProperties {
  /** Ref used to measure the compact counter panel. */
  compactPanelRef: RefObject<HTMLDivElement | null>;
  /** Whether the HUD is currently rendering its compact layout. */
  isCompactView: boolean;
  /** Whether the beat flash accent should be active. */
  isFlashActive: boolean;
  /** Toggles compact mode. */
  onToggleCompactView: () => void;
  /** Toggles between elapsed and remaining counter modes. */
  onToggleMode: () => void;
  /** Toggles the always-on-top preference. */
  onToggleTopmost: () => void;
  /** Toggles track-lock state. */
  onToggleTrackLock: () => void;
  /** Current validated HUD state. */
  state: HudState;
}

/**
 * Props for the counter panel rendered in full and compact layouts.
 */
interface CounterPanelProperties {
  /** Ref used to measure the compact counter panel. */
  compactPanelRef: RefObject<HTMLDivElement | null>;
  /** Whether the HUD is currently rendering its compact layout. */
  isCompactView: boolean;
  /** Whether the beat flash accent should be active. */
  isFlashActive: boolean;
  /** Toggles compact mode. */
  onToggleCompactView: () => void;
  /** Current validated HUD state. */
  state: HudState;
}

/**
 * Props for the HUD control button row.
 */
interface HudControlsProperties {
  /** Toggles between elapsed and remaining counter modes. */
  onToggleMode: () => void;
  /** Toggles the always-on-top preference. */
  onToggleTopmost: () => void;
  /** Toggles track-lock state. */
  onToggleTrackLock: () => void;
  /** Current validated HUD state. */
  state: HudState;
}

/**
 * Props for a metadata pill showing clip, track, or scene information.
 */
interface MetadataPillProperties {
  /** Color swatch rendered beside the metadata label. */
  color: HudState["clipColor"];
  /** Text label rendered inside the pill. */
  label: HudState["clipName"];
  /** Test id used to target the pill in browser tests. */
  testId: string;
}

/**
 * Resolved copy and styling for the mode toggle control.
 */
interface ModeControlProperties {
  /** Button classes for the current mode state. */
  buttonClassName: string;
  /** Tooltip copy describing the mode toggle action. */
  tooltipContent: string;
}

/**
 * Props for the transport-status badge rendered in the HUD header.
 */
interface StatusBadgeProperties {
  /** Current validated HUD state. */
  state: HudState;
}

/**
 * Renders the HUD shell around the current transport and metadata state.
 * @param properties - HUD callbacks, refs, and state.
 * @returns The HUD surface.
 */
export const HudSurface = (
  properties: Readonly<HudSurfaceProperties>,
): React.JSX.Element => {
  const {
    compactPanelRef,
    isCompactView,
    isFlashActive,
    onToggleCompactView,
    onToggleMode,
    onToggleTopmost,
    onToggleTrackLock,
    state,
  } = properties;
  const counterPanel = (
    <CounterPanel
      compactPanelRef={compactPanelRef}
      isCompactView={isCompactView}
      isFlashActive={isFlashActive}
      onToggleCompactView={onToggleCompactView}
      state={state}
    />
  );

  return (
    <div
      className={frameClassName(state, isCompactView)}
      data-testid="hud-root"
    >
      <Card
        className={
          isCompactView
            ? "flex h-full flex-col rounded-sm border-transparent bg-ableton-panelAlt/95 shadow-none"
            : "flex h-full flex-col rounded-sm border-[#3a4049] bg-ableton-panelAlt/95"
        }
      >
        {isCompactView ? (
          <CardContent className="p-0">{counterPanel}</CardContent>
        ) : (
          <>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1.5">
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
                  <MetadataPill
                    color={state.clipColor}
                    label={state.clipName}
                    testId="clip-pill"
                  />
                  <MetadataPill
                    color={state.trackColor}
                    label={state.trackName}
                    testId="track-pill"
                  />
                  <MetadataPill
                    color={state.sceneColor}
                    label={state.sceneName}
                    testId="scene-pill"
                  />
                </div>
                <StatusBadge state={state} />
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-1 flex-col justify-center pb-2 pt-2">
              {counterPanel}
            </CardContent>
            <CardFooter className="pt-1">
              <HudControls
                onToggleMode={onToggleMode}
                onToggleTopmost={onToggleTopmost}
                onToggleTrackLock={onToggleTrackLock}
                state={state}
              />
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
};

/**
 * Renders the counter panel for compact and expanded HUD layouts.
 * @param properties - Counter panel state and compact-mode controls.
 * @returns The counter panel.
 */
const CounterPanel = (
  properties: Readonly<CounterPanelProperties>,
): React.JSX.Element => {
  const {
    compactPanelRef,
    isCompactView,
    isFlashActive,
    onToggleCompactView,
    state,
  } = properties;

  return (
    <div
      className={counterPanelClassName(state, isCompactView, isFlashActive)}
      data-testid="counter-panel"
      ref={compactPanelRef}
    >
      <Tooltip
        align="end"
        className="absolute right-2 top-2 z-10"
        content={isCompactView ? "Show full HUD" : "Switch to compact view"}
        side="bottom"
      >
        <Button
          aria-label={
            isCompactView ? "Show full HUD" : "Switch to compact view"
          }
          className="h-6 w-6 rounded-full border border-ableton-border bg-transparent p-0 text-ableton-muted transition-colors hover:border-zinc-500 hover:bg-transparent hover:text-ableton-text"
          data-testid="compact-toggle"
          onClick={onToggleCompactView}
          variant="ghost"
        >
          {isCompactView ? (
            <Maximize2 className="h-3.5 w-3.5" />
          ) : (
            <Minimize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </Tooltip>
      <div
        className={counterTextClassName(state, isCompactView)}
        data-testid="counter-text"
      >
        {state.counterText}
      </div>
    </div>
  );
};

/**
 * Resolves the current mode toggle copy and styling.
 * @param mode - The current counter display mode.
 * @returns The mode button styling and tooltip copy.
 */
const modeControlProperties = (
  mode: HudState["mode"],
): ModeControlProperties => {
  if (mode === "elapsed") {
    return {
      buttonClassName:
        "h-8 w-full rounded-sm border border-ableton-accent bg-zinc-900 text-[10px] uppercase tracking-[0.08em] text-ableton-accent transition-colors hover:bg-zinc-800",
      tooltipContent: "Show remaining time",
    };
  }

  return {
    buttonClassName:
      "h-8 w-full rounded-sm border border-emerald-400/75 bg-emerald-400/18 text-[10px] uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/28",
    tooltipContent: "Show elapsed time",
  };
};

/**
 * Renders the footer controls for mode, track lock, and topmost state.
 * @param properties - Control callbacks and the current HUD state.
 * @returns The HUD footer controls.
 */
const HudControls = (
  properties: Readonly<HudControlsProperties>,
): React.JSX.Element => {
  const { onToggleMode, onToggleTopmost, onToggleTrackLock, state } =
    properties;
  const modeControl = modeControlProperties(state.mode);

  return (
    <div className="flex w-full items-center gap-2">
      <Tooltip className="flex-1" content={modeControl.tooltipContent}>
        <Button
          className={modeControl.buttonClassName}
          data-testid="mode-toggle"
          onClick={onToggleMode}
          variant="ghost"
        >
          {modeLabel(state.mode)}
        </Button>
      </Tooltip>
      <Tooltip
        content={
          state.trackLocked ? "Follow selected track" : "Lock to current track"
        }
      >
        <Button
          aria-label={
            state.trackLocked
              ? "Follow selected track"
              : "Lock to current track"
          }
          className={
            state.trackLocked
              ? "h-7 w-7 rounded-full border border-amber-400/80 bg-amber-400/20 p-0 text-amber-300 transition-colors hover:bg-amber-400/30"
              : "h-7 w-7 rounded-full border border-ableton-border bg-transparent p-0 text-ableton-muted transition-colors hover:border-zinc-500 hover:bg-transparent hover:text-ableton-text"
          }
          data-testid="track-lock-toggle"
          onClick={onToggleTrackLock}
          variant="ghost"
        >
          {state.trackLocked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <LockOpen className="h-3.5 w-3.5" />
          )}
        </Button>
      </Tooltip>
      <Tooltip
        content={state.alwaysOnTop ? "Allow normal stacking" : "Keep on top"}
      >
        <Button
          aria-label={
            state.alwaysOnTop ? "Allow normal stacking" : "Keep on top"
          }
          className={
            state.alwaysOnTop
              ? "h-7 w-7 rounded-full border border-cyan-400/80 bg-cyan-400/20 p-0 text-cyan-300 transition-colors hover:bg-cyan-400/30"
              : "h-7 w-7 rounded-full border border-ableton-border bg-transparent p-0 text-ableton-muted transition-colors hover:border-zinc-500 hover:bg-transparent hover:text-ableton-text"
          }
          data-testid="topmost-toggle"
          onClick={onToggleTopmost}
          variant="ghost"
        >
          {state.alwaysOnTop ? (
            <Pin className="h-3.5 w-3.5" />
          ) : (
            <PinOff className="h-3.5 w-3.5" />
          )}
        </Button>
      </Tooltip>
    </div>
  );
};

/**
 * Renders a metadata pill for clip, track, or scene details.
 * @param properties - Metadata label, color, and test identifier.
 * @returns The metadata pill.
 */
const MetadataPill = (
  properties: Readonly<MetadataPillProperties>,
): React.JSX.Element => {
  const { color, label, testId } = properties;
  const hasColor = typeof color === "number";

  return (
    <div
      className={
        hasColor
          ? "flex h-6 min-w-0 items-center justify-center rounded-[4px] border border-transparent px-1 font-ui text-[11px] font-medium leading-none"
          : "flex h-6 min-w-0 items-center justify-center rounded-[4px] border border-[#5a616d] bg-[#2a3037] px-1 font-ui text-[11px] font-medium leading-none text-ableton-text"
      }
      data-testid={testId}
      style={metadataPillStyle(color)}
    >
      <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center">
        {displayName(label)}
      </span>
    </div>
  );
};

/**
 * Renders the current playback and connection status badge.
 * @param properties - The HUD state used to derive badge status.
 * @returns The status badge.
 */
const StatusBadge = (
  properties: Readonly<StatusBadgeProperties>,
): React.JSX.Element => {
  const { state } = properties;
  const status = statusKind(state);
  const disconnected = status === "disconnected";

  return (
    <div className="flex items-center">
      <Badge
        aria-label={statusLabel(status)}
        className={
          disconnected
            ? "h-6 gap-1.5 px-2.5"
            : "h-6 w-6 justify-center px-0 py-0"
        }
        data-testid="status-badge"
        variant={statusVariant(state)}
      >
        {statusIcon(status)}
        {disconnected && <span>Disconnected</span>}
      </Badge>
    </div>
  );
};

/**
 * Resolves the icon for the current status badge variant.
 * @param status - The derived HUD status kind.
 * @returns The matching status icon.
 */
const statusIcon = (status: StatusKind): React.JSX.Element => {
  if (status === "playing") {
    return <Play aria-hidden className="h-3.5 w-3.5 fill-current" />;
  }
  if (status === "stopped") {
    return <Square aria-hidden className="h-3 w-3 fill-current" />;
  }

  return <WifiOff aria-hidden className="h-3.5 w-3.5" />;
};
