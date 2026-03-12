import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  SpeciesSearchResult,
  SequenceListResponse,
  BlastRequest,
  BlastProgram,
  SeqType,
} from '@/lib/types'

interface QueryInputProps {
  species: SpeciesSearchResult
  sequences: SequenceListResponse | null
  onSubmit: (req: BlastRequest) => void
  isLoading: boolean
}

const BLAST_PROGRAMS: { value: BlastProgram; label: string }[] = [
  { value: 'blastn', label: 'blastn' },
  { value: 'blastp', label: 'blastp' },
  { value: 'blastx', label: 'blastx' },
  { value: 'tblastn', label: 'tblastn' },
  { value: 'tblastx', label: 'tblastx' },
]

function defaultProgram(seqType: SeqType | undefined): BlastProgram {
  switch (seqType) {
    case 'protein':
      return 'blastp'
    case 'rna':
      return 'blastn'
    case 'dna':
    default:
      return 'blastn'
  }
}

export function QueryInput({ species, sequences, onSubmit, isLoading }: QueryInputProps) {
  const [querySequence, setQuerySequence] = useState('')
  const [program, setProgram] = useState<BlastProgram>('blastn')
  const [maxResults, setMaxResults] = useState(50)

  const seqType = sequences?.sequences?.[0]?.seq_type

  // Update default program when sequence type changes
  useEffect(() => {
    setProgram(defaultProgram(seqType))
  }, [seqType])

  const charCount = querySequence.length
  const isValid = charCount >= 10 && sequences !== null && sequences.sequences.length > 0

  const currentSeqType: SeqType = useMemo(() => {
    if (seqType) return seqType
    if (program === 'blastp' || program === 'tblastn') return 'protein'
    return 'dna'
  }, [seqType, program])

  function handleSubmit() {
    if (!isValid || isLoading) return
    onSubmit({
      query_sequence: querySequence,
      seq_type: currentSeqType,
      species_taxon_id: species.taxon_id,
      program,
      max_results: maxResults,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Textarea */}
      <div className="relative">
        <textarea
          value={querySequence}
          onChange={(e) => setQuerySequence(e.target.value)}
          placeholder={'>Paste your sequence here (FASTA format or raw sequence)...'}
          className={cn(
            'w-full min-h-[200px] p-4 bg-panel border border-border rounded',
            'font-mono text-sm text-text resize-y',
            'placeholder:text-text-dim outline-none transition-colors',
            'focus:border-cyan focus:glow-cyan'
          )}
        />
        <span className="absolute bottom-3 right-3 font-mono text-[11px] text-text-dim">
          {charCount.toLocaleString()} chars
        </span>
      </div>

      {/* BLAST program selector */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-text-dim uppercase tracking-wider">
          BLAST Program
        </span>
        <div className="flex flex-wrap gap-1.5">
          {BLAST_PROGRAMS.map((p) => (
            <button
              key={p.value}
              onClick={() => setProgram(p.value)}
              className={cn(
                'px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-pointer',
                program === p.value
                  ? 'bg-cyan text-deep-bg font-bold'
                  : 'bg-panel border border-border text-text-dim hover:text-text-muted hover:border-border-bright'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Max results */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-text-dim">MAX RESULTS:</span>
        {[25, 50, 100].map((n) => (
          <button
            key={n}
            onClick={() => setMaxResults(n)}
            className={cn(
              'px-2.5 py-1 rounded-full font-mono text-xs transition-colors cursor-pointer',
              maxResults === n
                ? 'bg-cyan text-deep-bg font-bold'
                : 'bg-panel border border-border text-text-dim hover:text-text-muted hover:border-border-bright'
            )}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Submit button */}
      <motion.button
        onClick={handleSubmit}
        disabled={!isValid || isLoading}
        whileHover={isValid && !isLoading ? { scale: 1.01 } : undefined}
        whileTap={isValid && !isLoading ? { scale: 0.98 } : undefined}
        className={cn(
          'w-full py-3.5 rounded font-mono font-bold text-sm tracking-widest',
          'transition-all cursor-pointer',
          isValid && !isLoading
            ? 'bg-cyan text-deep-bg hover:glow-cyan hover:bg-cyan-bright active:bg-cyan'
            : 'bg-panel border border-border text-text-dim cursor-not-allowed opacity-60'
        )}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            SCANNING...
          </span>
        ) : (
          'RUN ANALYSIS'
        )}
      </motion.button>
    </div>
  )
}
