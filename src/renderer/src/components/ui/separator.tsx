import { Root } from "@radix-ui/react-separator";
import { cn } from "@renderer/lib/utilities";
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type Ref,
} from "react";

/**
 * Renders the shared separator primitive with HUD styling.
 * @param properties - Separator props forwarded to the Radix primitive.
 * @returns The styled separator element.
 */
const Separator = (
  properties: Readonly<
    ComponentPropsWithoutRef<typeof Root> & {
      /**
       *
       */
      ref?: Ref<ComponentRef<typeof Root>>;
    }
  >,
): React.JSX.Element => {
  const {
    className,
    decorative = true,
    orientation = "horizontal",
    ref,
    ...separatorProperties
  } = properties;

  return (
    <Root
      className={cn(
        "shrink-0 bg-ableton-border/70",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      decorative={decorative}
      orientation={orientation}
      ref={ref}
      {...separatorProperties}
    />
  );
};
Separator.displayName = Root.displayName;

export { Separator };
