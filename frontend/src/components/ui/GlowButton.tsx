import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
}

const variantStyles = {
  primary: cn(
    'bg-cyan text-deep-bg',
    'hover:glow-cyan hover:bg-cyan-bright',
    'active:bg-cyan',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cyan disabled:hover:shadow-none',
  ),
  secondary: cn(
    'border border-cyan text-cyan bg-transparent',
    'hover:bg-cyan/10',
    'active:bg-cyan/20',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
  ),
  ghost: cn(
    'text-text-muted bg-transparent',
    'hover:text-cyan',
    'active:text-cyan-bright',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-muted',
  ),
}

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ variant = 'primary', loading = false, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2',
          'px-4 py-2 rounded',
          'font-mono font-semibold text-sm uppercase tracking-wider',
          'transition-all cursor-pointer',
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>...</span>
          </>
        ) : (
          children
        )}
      </button>
    )
  },
)

GlowButton.displayName = 'GlowButton'
