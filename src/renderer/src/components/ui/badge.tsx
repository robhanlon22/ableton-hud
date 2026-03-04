import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
  {
    variants: {
      variant: {
        neutral: 'border-sky-500/45 bg-sky-500/12 text-sky-200/90',
        success: 'border-zinc-700 bg-zinc-900 text-ableton-success',
        warning: 'border-zinc-700 bg-zinc-900 text-ableton-warning',
        offline: 'border-zinc-600 bg-zinc-900 text-zinc-400'
      }
    },
    defaultVariants: {
      variant: 'neutral'
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
