import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BlastResponse, BlastHit } from '@/lib/types'
import { ScoreBar } from './ScoreBar'
import { AlignmentView } from './AlignmentView'

interface BlastResultsProps {
  result: BlastResponse
}

type SortKey = 'index' | 'accession' | 'title' | 'score' | 'evalue' | 'identity_pct' | 'coverage'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'index', label: '#', className: 'w-[40px]' },
  { key: 'accession', label: 'Accession', className: 'w-[120px]' },
  { key: 'title', label: 'Title', className: 'flex-1 min-w-[160px]' },
  { key: 'score', label: 'Score', className: 'w-[70px]' },
  { key: 'evalue', label: 'E-value', className: 'w-[80px]' },
  { key: 'identity_pct', label: 'Identity', className: 'w-[160px]' },
  { key: 'coverage', label: 'Coverage', className: 'w-[160px]' },
]

function compareFn(a: BlastHit, b: BlastHit, key: SortKey, dir: SortDir, aIdx: number, bIdx: number): number {
  let cmp = 0
  switch (key) {
    case 'index':
      cmp = aIdx - bIdx
      break
    case 'accession':
      cmp = a.accession.localeCompare(b.accession)
      break
    case 'title':
      cmp = a.title.localeCompare(b.title)
      break
    case 'score':
      cmp = a.score - b.score
      break
    case 'evalue':
      cmp = a.evalue - b.evalue
      break
    case 'identity_pct':
      cmp = a.identity_pct - b.identity_pct
      break
    case 'coverage':
      cmp = a.coverage - b.coverage
      break
  }
  return dir === 'asc' ? cmp : -cmp
}

export function BlastResults({ result }: BlastResultsProps) {
  const [expandedAcc, setExpandedAcc] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir(key === 'evalue' ? 'asc' : 'desc')
      }
    },
    [sortKey],
  )

  const sortedHits = useMemo(() => {
    const indexed = result.hits.map((h, i) => ({ hit: h, idx: i }))
    indexed.sort((a, b) => compareFn(a.hit, b.hit, sortKey, sortDir, a.idx, b.idx))
    return indexed
  }, [result.hits, sortKey, sortDir])

  if (result.hits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="w-8 h-8 text-text-dim" />
        <p className="font-mono text-sm text-text-muted">No significant matches found</p>
        <p className="font-mono text-xs text-text-dim">
          Try adjusting your query sequence or search parameters
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary */}
      <div className="flex items-center gap-3 font-mono text-xs text-text-muted">
        <span className="text-cyan font-semibold">{result.total_hits}</span>
        <span>hits found</span>
        <span className="text-text-dim">|</span>
        <span>
          Query length: <span className="text-text">{result.query_length}</span>
        </span>
      </div>

      {/* Table */}
      <div className="rounded border border-border bg-panel overflow-hidden">
        {/* Header */}
        <div className="flex items-center border-b border-border bg-deep-bg/40 px-3 py-2 gap-3">
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => handleSort(col.key)}
              className={cn(
                'flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors',
                col.className,
                sortKey === col.key ? 'text-cyan' : 'text-text-dim hover:text-text-muted',
              )}
            >
              {col.label}
              {sortKey === col.key &&
                (sortDir === 'asc' ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                ))}
            </button>
          ))}
        </div>

        {/* Rows */}
        <div className="flex flex-col divide-y divide-border">
          {sortedHits.map(({ hit, idx }) => {
            const isExpanded = expandedAcc === hit.accession
            return (
              <div key={hit.accession}>
                <button
                  onClick={() => setExpandedAcc(isExpanded ? null : hit.accession)}
                  className={cn(
                    'flex items-center w-full text-left px-3 py-2.5 gap-3 transition-colors cursor-pointer',
                    isExpanded
                      ? 'bg-panel-hover'
                      : 'hover:bg-panel-hover/60',
                  )}
                >
                  {/* # */}
                  <span className="font-mono text-[11px] text-text-dim w-[40px] shrink-0">
                    {idx + 1}
                  </span>

                  {/* Accession */}
                  <span className="font-mono text-[11px] text-cyan font-semibold w-[120px] shrink-0 truncate">
                    {hit.accession}
                  </span>

                  {/* Title */}
                  <span className="text-xs text-text-muted flex-1 min-w-[160px] truncate">
                    {hit.title.length > 40 ? hit.title.slice(0, 40) + '...' : hit.title}
                  </span>

                  {/* Score */}
                  <span className="font-mono text-[11px] text-text w-[70px] shrink-0 tabular-nums">
                    {hit.score}
                  </span>

                  {/* E-value */}
                  <span className="font-mono text-[11px] text-text-muted w-[80px] shrink-0 tabular-nums">
                    {hit.evalue.toExponential(1)}
                  </span>

                  {/* Identity */}
                  <div className="w-[160px] shrink-0">
                    <ScoreBar value={hit.identity_pct} />
                  </div>

                  {/* Coverage */}
                  <div className="w-[160px] shrink-0">
                    <ScoreBar value={hit.coverage} />
                  </div>
                </button>

                {/* Expanded alignment */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-deep-bg/30 border-t border-border">
                        <div className="flex items-center gap-4 mb-3 font-mono text-[10px] text-text-dim uppercase tracking-wider">
                          <span>
                            Query: {hit.query_start}-{hit.query_end}
                          </span>
                          <span>
                            Subject: {hit.hit_start}-{hit.hit_end}
                          </span>
                          <span>
                            Identity: {hit.identity_pct.toFixed(1)}%
                          </span>
                          <span>
                            Coverage: {hit.coverage.toFixed(1)}%
                          </span>
                        </div>
                        <AlignmentView hit={hit} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
