import { cn } from '@/lib/utils'
import type { SeqType } from '@/lib/types'

interface SequenceTextProps {
  sequence: string
  type?: SeqType
}

const DNA_COLORS: Record<string, string> = {
  A: 'text-cyan',
  T: 'text-red',
  G: 'text-green',
  C: 'text-amber',
}

const RNA_COLORS: Record<string, string> = {
  A: 'text-cyan',
  U: 'text-red',
  G: 'text-green',
  C: 'text-amber',
}

export function SequenceText({ sequence, type = 'dna' }: SequenceTextProps) {
  if (type === 'protein') {
    return (
      <span className="font-mono text-sm text-cyan break-all whitespace-pre-wrap">
        {sequence}
      </span>
    )
  }

  const colorMap = type === 'rna' ? RNA_COLORS : DNA_COLORS

  return (
    <span className="font-mono text-sm break-all whitespace-pre-wrap">
      {Array.from(sequence).map((char, i) => {
        const upper = char.toUpperCase()
        const colorClass = colorMap[upper] || 'text-text-dim'
        return (
          <span key={i} className={cn(colorClass)}>
            {char}
          </span>
        )
      })}
    </span>
  )
}
