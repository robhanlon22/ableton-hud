import { cn } from "@renderer/lib/utilities";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
  {
    defaultVariants: {
      variant: "neutral",
    },
    variants: {
      variant: {
        neutral: "border-sky-500/45 bg-sky-500/12 text-sky-200/90",
        offline: "border-zinc-600 bg-zinc-900 text-zinc-400",
        success: "border-zinc-700 bg-zinc-900 text-ableton-success",
        warning: "border-zinc-700 bg-zinc-900 text-ableton-warning",
      },
    },
  },
);

export interface BadgeProperties
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Renders a compact status badge with the configured variant styles.
 * @param properties - Badge props including variant and HTML attributes.
 * @returns The rendered badge element.
 */
function Badge(properties: Readonly<BadgeProperties>): React.JSX.Element {
  const { className, variant, ...restProperties } = properties;
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...restProperties}
    />
  );
}

export { Badge, badgeVariants };
