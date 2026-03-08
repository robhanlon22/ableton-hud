import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@renderer/lib/utilities";
import * as React from "react";

/**
 * Props for the shared Radix-backed tooltip wrapper.
 */
export interface TooltipProperties {
  /** Horizontal alignment for the tooltip relative to its trigger. */
  align?: TooltipAlign;
  /** Trigger content rendered inside the tooltip wrapper. */
  children: React.ReactElement;
  /** Optional classes for the tooltip trigger wrapper. */
  className?: string;
  /** Tooltip copy shown on hover and keyboard focus. */
  content: string;
  /** Vertical placement for the tooltip bubble. */
  side?: TooltipSide;
}

/**
 * Horizontal alignment options for the tooltip bubble.
 */
type TooltipAlign = "center" | "end" | "start";

/**
 * Vertical placement options for the tooltip bubble.
 */
type TooltipSide = "bottom" | "top";

/**
 * Renders an in-window tooltip so HUD help text does not rely on native
 * window-manager tooltips.
 * @param properties - Wrapper classes, placement, content, and trigger node.
 * @returns The trigger with a Radix tooltip bubble.
 */
export function Tooltip(
  properties: Readonly<TooltipProperties>,
): React.JSX.Element {
  const {
    align = "center",
    children,
    className,
    content,
    side = "top",
  } = properties;

  return (
    <TooltipPrimitive.Provider
      delayDuration={1000}
      disableHoverableContent
      skipDelayDuration={0}
    >
      <TooltipPrimitive.Root>
        <span className={cn("inline-flex", className)}>
          <TooltipPrimitive.Trigger asChild>
            {children}
          </TooltipPrimitive.Trigger>
        </span>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            align={align}
            className={cn(
              "pointer-events-none z-[2147483647] whitespace-nowrap rounded-sm border border-ableton-border bg-[#141821]/95 px-2 py-1 text-[10px] font-medium leading-none text-ableton-text",
            )}
            collisionPadding={8}
            side={side}
            sideOffset={8}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
