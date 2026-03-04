import * as React from "react";

import { cn } from "../../lib/utils";

function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-md border border-ableton-border bg-ableton-panel/90",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn("px-3 pb-3 pt-0", className)} {...props} />;
}

function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn("flex items-center px-3 pb-3 pt-0", className)}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 px-3 py-2", className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.1em] text-ableton-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
