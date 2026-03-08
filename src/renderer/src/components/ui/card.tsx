import { cn } from "@renderer/lib/utilities";
import * as React from "react";

/**
 * Renders the base card container.
 * @param properties - Card container props.
 * @returns The rendered card wrapper.
 */
function Card(
  properties: Readonly<React.HTMLAttributes<HTMLDivElement>>,
): React.JSX.Element {
  const { className, ...restProperties } = properties;
  return (
    <div
      className={cn(
        "rounded-md border border-ableton-border bg-ableton-panel/90",
        className,
      )}
      {...restProperties}
    />
  );
}

/**
 * Renders the card content section.
 * @param properties - Card content props.
 * @returns The rendered card content section.
 */
function CardContent(
  properties: Readonly<React.HTMLAttributes<HTMLDivElement>>,
): React.JSX.Element {
  const { className, ...restProperties } = properties;
  return (
    <div className={cn("px-3 pb-3 pt-0", className)} {...restProperties} />
  );
}

/**
 * Renders the card footer action row.
 * @param properties - Card footer props.
 * @returns The rendered card footer section.
 */
function CardFooter(
  properties: Readonly<React.HTMLAttributes<HTMLDivElement>>,
): React.JSX.Element {
  const { className, ...restProperties } = properties;
  return (
    <div
      className={cn("flex items-center px-3 pb-3 pt-0", className)}
      {...restProperties}
    />
  );
}

/**
 * Renders the card header region.
 * @param properties - Card header props.
 * @returns The rendered card header section.
 */
function CardHeader(
  properties: Readonly<React.HTMLAttributes<HTMLDivElement>>,
): React.JSX.Element {
  const { className, ...restProperties } = properties;
  return (
    <div
      className={cn("flex flex-col space-y-1.5 px-3 py-2", className)}
      {...restProperties}
    />
  );
}

/**
 * Renders compact uppercase title text for cards.
 * @param properties - Card title props.
 * @returns The rendered card title element.
 */
function CardTitle(
  properties: Readonly<React.HTMLAttributes<HTMLDivElement>>,
): React.JSX.Element {
  const { className, ...restProperties } = properties;
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.1em] text-ableton-muted",
        className,
      )}
      {...restProperties}
    />
  );
}

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
