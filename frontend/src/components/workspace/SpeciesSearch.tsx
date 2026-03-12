import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'
import { useDebounce } from '@/hooks/useDebounce'
import { useElapsedTime } from '@/hooks/useElapsedTime'
import { cn } from '@/lib/utils'
import type { SpeciesSearchResult } from '@/lib/types'

interface SpeciesSearchProps {
  onSelect: (species: SpeciesSearchResult) => void
}

export function SpeciesSearch({ onSelect }: SpeciesSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpeciesSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const elapsed = useElapsedTime(isLoading)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    api
      .searchSpecies(debouncedQuery)
      .then((data) => {
        if (!cancelled) {
          setResults(data)
          setIsOpen(true)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Search failed')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(species: SpeciesSearchResult) {
    onSelect(species)
    setQuery(species.name)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
            isFocused ? 'text-cyan' : 'text-text-dim'
          )}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setIsFocused(true)
            if (results.length > 0) setIsOpen(true)
          }}
          onBlur={() => setIsFocused(false)}
          placeholder="Search species..."
          className={cn(
            'w-full pl-10 pr-4 py-3 bg-panel border rounded font-mono text-sm text-text',
            'placeholder:text-text-dim outline-none transition-all',
            isFocused
              ? 'border-cyan text-cyan glow-cyan'
              : 'border-border hover:border-border-bright'
          )}
        />
      </div>

      {isLoading && query.length >= 2 && (
        <div className="mt-2 px-3 py-2">
          <motion.span
            className="font-mono text-sm text-cyan"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Buscando no NCBI...{elapsed > 0 && ` (${elapsed}s)`}
          </motion.span>
        </div>
      )}

      {error && (
        <div className="mt-2 px-3 py-2">
          <span className="font-mono text-sm text-red">{error}</span>
        </div>
      )}

      <AnimatePresence>
        {isOpen && results.length > 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'absolute z-50 mt-1 w-full max-h-[320px] overflow-y-auto',
              'bg-panel border border-border rounded shadow-lg shadow-black/40'
            )}
          >
            {results.map((species) => (
              <button
                key={species.taxon_id}
                onClick={() => handleSelect(species)}
                className={cn(
                  'w-full text-left px-4 py-3 border-l-2 border-l-transparent',
                  'transition-all hover:bg-panel-hover hover:border-l-cyan',
                  'group cursor-pointer'
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-text font-bold text-sm truncate">
                    {species.name}
                  </span>
                  <span className="text-text-dim text-[10px] font-mono uppercase tracking-wider shrink-0">
                    {species.rank}
                  </span>
                </div>
                {species.lineage && (
                  <p className="text-text-dim text-xs mt-0.5 truncate">
                    {species.lineage}
                  </p>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
