import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const iconButtonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        ghost: 'hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground',
        outline:
          'border border-border bg-background hover:bg-accent aria-expanded:bg-accent dark:bg-input/20',
      },
      size: {
        xs: 'size-5 rounded-md [&_svg:not([class*="size-"])]:size-3.5',
        sm: 'size-6 rounded-md',
        md: 'size-7',
        lg: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  },
)

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    /** 无障碍名称，同时作为原生 tooltip 文案 */
    label: string
    children: ReactNode
  }

function IconButton({ label, variant, size, className, children, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  )
}

export { IconButton, iconButtonVariants }
export type { IconButtonProps }
