import type { HudMode, HudState } from "@shared/types";
import type { CSSProperties } from "react";

import { cn } from "@renderer/lib/utilities";

const BYTE_MASK = 0xff;
const CONTRAST_OFFSET = 0.05;
const DARK_TEXT_COLOR = "#101216";
const DARK_TEXT_COLOR_RGB = 0x10_12_16;
const GREEN_CHANNEL_SHIFT = 8;
const HEX_PAD_LENGTH = 6;
const HEX_RADIX = 16;
const PLACEHOLDER_LABEL = "-";
const RED_CHANNEL_SHIFT = 16;
const RELATIVE_LUMINANCE_BLUE_WEIGHT = 0.0722;
const RELATIVE_LUMINANCE_GREEN_WEIGHT = 0.7152;
const RELATIVE_LUMINANCE_RED_WEIGHT = 0.2126;
const SRGB_CHANNEL_DIVISOR = 255;
const SRGB_GAMMA = 2.4;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_SCALE = 1.055;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_LINEAR_THRESHOLD = 0.040_45;
const WHITE_TEXT_COLOR = "#ffffff";

/**
 *
 */
export type StatusKind = "disconnected" | "playing" | "stopped";

/**
 * Builds the counter panel classes for the current display state.
 * @param state - Current HUD state.
 * @param isCompactView - Whether compact mode is enabled.
 * @param isFlashActive - Whether beat-flash styling is currently active.
 * @returns The counter panel class string.
 */
export function counterPanelClassName(
  state: HudState,
  isCompactView: boolean,
  isFlashActive: boolean,
): string {
  const status = statusKind(state);
  const isDisconnected = status === "disconnected";

  return cn(
    "relative rounded-sm border border-ableton-border bg-ableton-panel px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-100",
    isCompactView ? "self-center border-0 shadow-none" : "w-full",
    isDisconnected &&
      "border-[#565c66] bg-[#171b22] shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]",
    state.isLastBar &&
      !isCompactView &&
      !isDisconnected &&
      "border-[#705858] bg-zinc-900/95",
    panelFlashClass(state, isFlashActive, isCompactView),
  );
}

/**
 * Builds the counter text classes for the current state.
 * @param state - Current HUD state.
 * @param isCompactView - Whether compact mode is enabled.
 * @returns The counter text class string.
 */
export function counterTextClassName(
  state: HudState,
  isCompactView: boolean,
): string {
  const isDisconnected = statusKind(state) === "disconnected";
  return cn(
    "pr-10 font-mono text-[48px] font-semibold leading-none tracking-tight sm:text-[56px]",
    isDisconnected ? "text-zinc-500" : "text-ableton-success",
    state.isLastBar &&
      !isDisconnected &&
      !isCompactView &&
      "text-ableton-warning",
  );
}

/**
 * Normalizes optional metadata labels for UI display.
 * @param value - Optional name value from HUD state.
 * @returns A trimmed display string, or a minimal placeholder when absent.
 */
export function displayName(value: null | string | undefined): string {
  if (typeof value !== "string") {
    return PLACEHOLDER_LABEL;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : PLACEHOLDER_LABEL;
}

/**
 * Builds the outer HUD frame classes.
 * @param state - Current HUD state.
 * @param isCompactView - Whether compact mode is enabled.
 * @returns The outer frame class string.
 */
export function frameClassName(
  state: HudState,
  isCompactView: boolean,
): string {
  const status = statusKind(state);
  return cn(
    "h-full w-full overflow-hidden bg-ableton-bg text-ableton-text",
    isCompactView ? "border border-transparent" : "border border-[#4c525c]",
    "bg-[linear-gradient(180deg,#2b3038_0%,#232830_20%,#1a1e26_100%)]",
    status === "disconnected" &&
      "bg-[linear-gradient(180deg,#262b33_0%,#1f242c_20%,#161a22_100%)]",
    state.isLastBar && status !== "disconnected" && "text-ableton-warning",
  );
}

/**
 * Builds inline styles for a metadata pill from an optional clip color.
 * @param color - Optional RGB color value from Ableton metadata.
 * @returns Inline style properties, or `undefined` when no color exists.
 */
export function metadataPillStyle(
  color: null | number | undefined,
): CSSProperties | undefined {
  if (typeof color !== "number") {
    return undefined;
  }

  const rgb = color >>> 0;
  const redChannel = (rgb >> RED_CHANNEL_SHIFT) & BYTE_MASK;
  const greenChannel = (rgb >> GREEN_CHANNEL_SHIFT) & BYTE_MASK;
  const blueChannel = rgb & BYTE_MASK;
  const hex = `#${rgb.toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, "0")}`;

  return {
    backgroundColor: hex,
    borderColor: `rgba(${String(redChannel)}, ${String(greenChannel)}, ${String(blueChannel)}, 0.95)`,
    color: clipTextColor(rgb),
  };
}

/**
 * Converts HUD mode enum values into user-facing labels.
 * @param mode - Current HUD counter mode.
 * @returns The label to render for the mode toggle button.
 */
export function modeLabel(mode: HudMode): string {
  return mode === "elapsed" ? "Elapsed" : "Remaining";
}

/**
 * Maps transport and connection state to a compact status kind.
 * @param state - HUD state snapshot.
 * @returns The derived status kind.
 */
export function statusKind(state: HudState): StatusKind {
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
export function statusLabel(status: StatusKind): string {
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
export function statusVariant(
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

/**
 * Picks a readable foreground color for a metadata pill background.
 * @param color - RGB color value used for the pill background.
 * @returns A hex foreground color string with better contrast.
 */
function clipTextColor(color: number): string {
  const luminance = relativeLuminance(color);
  const whiteContrast = contrastRatio(luminance, 1);
  const darkContrast = contrastRatio(
    luminance,
    relativeLuminance(DARK_TEXT_COLOR_RGB),
  );

  return whiteContrast >= darkContrast ? WHITE_TEXT_COLOR : DARK_TEXT_COLOR;
}

/**
 * Computes WCAG-style contrast ratio from two luminance values.
 * @param first - First relative luminance value.
 * @param second - Second relative luminance value.
 * @returns The contrast ratio between the two luminance values.
 */
function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}

/**
 * Selects panel highlight classes for the active beat flash state.
 * @param state - HUD state containing downbeat/last-bar flags.
 * @param isFlashActive - Whether flash styling should currently be shown.
 * @param isCompactView - Whether compact mode is active.
 * @returns A space-delimited class string for flash styling.
 */
function panelFlashClass(
  state: HudState,
  isFlashActive: boolean,
  isCompactView: boolean,
): string {
  if (!isFlashActive || !state.connected) {
    return "";
  }

  if (isCompactView) {
    return state.isLastBar ? "bg-[#32252a]" : "bg-[#272f25]";
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
  const redChannel = (color >> RED_CHANNEL_SHIFT) & BYTE_MASK;
  const greenChannel = (color >> GREEN_CHANNEL_SHIFT) & BYTE_MASK;
  const blueChannel = color & BYTE_MASK;

  return (
    RELATIVE_LUMINANCE_RED_WEIGHT * srgbToLinear(redChannel) +
    RELATIVE_LUMINANCE_GREEN_WEIGHT * srgbToLinear(greenChannel) +
    RELATIVE_LUMINANCE_BLUE_WEIGHT * srgbToLinear(blueChannel)
  );
}

/**
 * Converts an sRGB color channel to linear-light space.
 * @param channel - 8-bit sRGB channel value.
 * @returns The linearized channel value.
 */
function srgbToLinear(channel: number): number {
  const normalizedChannel = channel / SRGB_CHANNEL_DIVISOR;
  if (normalizedChannel <= SRGB_LINEAR_THRESHOLD) {
    return normalizedChannel / SRGB_LINEAR_DIVISOR;
  }

  return (
    ((normalizedChannel + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA
  );
}
