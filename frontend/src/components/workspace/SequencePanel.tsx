import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { SpeciesSearchResult, SequenceListResponse, SeqType } from '@/lib/types'

interface SequencePanelProps {
  species: SpeciesSearchResult
  onSequencesFetched: (data: SequenceListResponse) => void
}

const SEQ_TYPES: { value: SeqType; label: string }[] = [
  { value: 'dna', label: 'DNA' },
  { value: 'rna', label: 'RNA' },
  { value: 'protein', label: 'PROTEIN' },
]

const LIMITS = [25, 50, 100, 200] as const

export function SequencePanel({ species, onSequencesFetched }: SequencePanelProps) {
  const [seqType, setSeqType] = useState<SeqType>('dna')
  const [limit, setLimit] = useState<number>(50)
  const [data, setData] = useState<SequenceListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    api
      .getSequences(species.taxon_id, seqType, limit)
      .then((res) => {
        if (!cancelled) {
          setData(res)
          setIsLoading(false)
          onSequencesFetched(res)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch sequences')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [species.taxon_id, seqType, limit, onSequencesFetched])

  return (
    <div className="flex flex-col gap-4">
      {/* Species header */}
      <div className="flex items-baseline gap-3">
        <h3 className="font-mono text-sm font-semibold text-text truncate">
          {species.name}
        </h3>
        <span className="font-mono text-xs text-text-dim shrink-0">
          TAXON:{species.taxon_id}
        </span>
      </div>

      {/* Sequence type tabs */}
      <div className="flex border-b border-border">
        {SEQ_TYPES.map((st) => (
          <button
            key={st.value}
            onClick={() => setSeqType(st.value)}
            className={cn(
              'px-4 py-2 font-mono text-xs font-semibold tracking-wider transition-colors',
              'border-b-2 -mb-px cursor-pointer',
              seqType === st.value
                ? 'border-cyan text-cyan'
                : 'border-transparent text-text-dim hover:text-text-muted'
            )}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* Limit selector */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-text-dim">LIMIT:</span>
        {LIMITS.map((l) => (
          <button
            key={l}
            onClick={() => setLimit(l)}
            className={cn(
              'px-2.5 py-1 rounded-full font-mono text-xs transition-colors cursor-pointer',
              limit === l
                ? 'bg-cyan text-deep-bg font-bold'
                : 'bg-panel border border-border text-text-dim hover:text-text-muted hover:border-border-bright'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 py-4">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-cyan"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <motion.span
            className="font-mono text-sm text-cyan"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Fetching sequences...
          </motion.span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="py-2">
          <span className="font-mono text-sm text-red">{error}</span>
        </div>
      )}

      {/* Results */}
      {!isLoading && data && (
        <>
          {/* Summary row */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-text-muted">
              Showing {data.sequences.length} of {data.total} sequences
            </span>
            <span
              className={cn(
                'font-mono text-[10px] px-2 py-0.5 rounded border',
                data.from_cache
                  ? 'text-green border-green/30 bg-green/5'
                  : 'text-cyan border-cyan/30 bg-cyan/5'
              )}
            >
              {data.from_cache ? 'CACHED' : 'LIVE'}
            </span>
          </div>

          {/* Sequence list */}
          <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto pr-1">
            {data.sequences.map((seq) => (
              <motion.div
                key={seq.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'px-3 py-2.5 rounded border border-border bg-panel/60',
                  'hover:border-border-bright hover:bg-panel-hover transition-colors'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-cyan font-semibold shrink-0">
                    {seq.accession}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[11px] text-text-muted">
                      {seq.length.toLocaleString()}{' '}
                      {seq.seq_type === 'protein' ? 'aa' : 'bp'}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[9px] px-1.5 py-0.5 rounded uppercase',
                        seq.source === 'ncbi'
                          ? 'text-cyan/80 bg-cyan/10'
                          : 'text-amber/80 bg-amber/10'
                      )}
                    >
                      {seq.source}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-text-dim mt-1 truncate">{seq.title}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
