import { Root } from "@radix-ui/react-separator";
import { cn } from "@renderer/lib/utilities";
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type Ref,
} from "react";

const Separator = ({
  className,
  decorative = true,
  orientation = "horizontal",
  ref,
  ...properties
}: Readonly<
  ComponentPropsWithoutRef<typeof Root> & {
    ref?: Ref<ComponentRef<typeof Root>>;
  }
>): React.JSX.Element => (
  <Root
    className={cn(
      "shrink-0 bg-ableton-border/70",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className,
    )}
    decorative={decorative}
    orientation={orientation}
    ref={ref}
    {...properties}
  />
);
Separator.displayName = Root.displayName;

export { Separator };
