import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Renders the base card container.
 * @param props - Card container props.
 * @returns A styled card wrapper element.
 */
function Card(props: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const { className, ...restProps } = props;
  return (
    <div
      className={cn(
        "rounded-md border border-ableton-border bg-ableton-panel/90",
        className,
      )}
      {...restProps}
    />
  );
}

/**
 * Renders card body content spacing.
 * @param props - Card content props.
 * @returns A styled card content element.
 */
function CardContent(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.JSX.Element {
  const { className, ...restProps } = props;
  return <div className={cn("px-3 pb-3 pt-0", className)} {...restProps} />;
}

/**
 * Renders the footer row for card actions.
 * @param props - Card footer props.
 * @returns A styled card footer element.
 */
function CardFooter(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.JSX.Element {
  const { className, ...restProps } = props;
  return (
    <div
      className={cn("flex items-center px-3 pb-3 pt-0", className)}
      {...restProps}
    />
  );
}

/**
 * Renders the header area of a card.
 * @param props - Card header props.
 * @returns A styled card header element.
 */
function CardHeader(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.JSX.Element {
  const { className, ...restProps } = props;
  return (
    <div
      className={cn("flex flex-col space-y-1.5 px-3 py-2", className)}
      {...restProps}
    />
  );
}

/**
 * Renders compact uppercase title text for cards.
 * @param props - Card title props.
 * @returns A styled card title element.
 */
function CardTitle(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.JSX.Element {
  const { className, ...restProps } = props;
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.1em] text-ableton-muted",
        className,
      )}
      {...restProps}
    />
  );
}

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
