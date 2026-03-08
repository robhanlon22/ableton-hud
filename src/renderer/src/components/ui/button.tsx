import { Slot } from "@radix-ui/react-slot";
import { cn } from "@renderer/lib/utilities";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md text-xs font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ableton-accent disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 px-3 py-1",
        lg: "h-9 px-4 py-1.5",
        sm: "h-7 px-2.5 py-1",
      },
      variant: {
        active:
          "border border-ableton-accent bg-zinc-900 text-ableton-accent hover:bg-zinc-800",
        default:
          "border border-ableton-border bg-ableton-panel text-ableton-text hover:bg-ableton-surface",
        ghost:
          "text-ableton-muted hover:bg-ableton-panel hover:text-ableton-text",
      },
    },
  },
);

/**
 * Props for the shared button primitive, including variant and slot behavior.
 */
export interface ButtonProperties
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Whether the button should render through `Slot` instead of `button`. */
  asChild?: boolean;
}

/**
 * Props for the shared button primitive including the forwarded DOM ref.
 */
interface ButtonComponentProperties extends ButtonProperties {
  /** Forwarded button ref used by Radix and downstream consumers. */
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * Renders the shared button primitive with HUD-specific styling.
 * @param properties - Button props plus variant configuration and forwarded ref.
 * @returns The styled button element.
 */
const Button = function Button(
  properties: Readonly<ButtonComponentProperties>,
): React.JSX.Element {
  const {
    asChild = false,
    className,
    ref: reference,
    size,
    variant,
    ...buttonProperties
  } = properties;
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      ref={reference}
      {...buttonProperties}
    />
  );
};
Button.displayName = "Button";

export { Button, buttonVariants };
