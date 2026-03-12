import { motion } from 'framer-motion'

interface ScoreBarProps {
  value: number
  label?: string
}

export function ScoreBar({ value, label }: ScoreBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      {label && (
        <span className="font-mono text-[10px] text-text-dim uppercase shrink-0">
          {label}
        </span>
      )}
      <div className="relative h-[6px] w-full rounded-full bg-border overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan to-cyan-bright"
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="font-mono text-[11px] text-text-muted tabular-nums shrink-0 w-[38px] text-right">
        {clamped.toFixed(1)}%
      </span>
    </div>
  )
}
