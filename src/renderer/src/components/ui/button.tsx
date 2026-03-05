import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ableton-accent disabled:pointer-events-none disabled:opacity-50",
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

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
