import { Root } from "@radix-ui/react-separator";
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
} from "react";

import { cn } from "../../lib/utils";

const Separator = forwardRef<
  ComponentRef<typeof Root>,
  ComponentPropsWithoutRef<typeof Root>
>(
  (
    { className, decorative = true, orientation = "horizontal", ...props },
    ref,
  ) => (
    <Root
      className={cn(
        "shrink-0 bg-ableton-border/70",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      decorative={decorative}
      orientation={orientation}
      ref={ref}
      {...props}
    />
  ),
);
Separator.displayName = Root.displayName;

export { Separator };
