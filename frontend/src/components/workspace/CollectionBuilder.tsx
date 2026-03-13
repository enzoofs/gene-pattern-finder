import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Dna, FlaskConical, List, Layers, Search, Crosshair, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { GlowButton } from '@/components/ui/GlowButton'
import { SpeciesSearch } from './SpeciesSearch'
import { useElapsedTime } from '@/hooks/useElapsedTime'
import type {
  SpeciesSearchResult,
  SequenceOut,
  SequenceListResponse,
  SeqType,
  CollectionOut,
  CollectionSpeciesOut,
  GeneTarget,
} from '@/lib/types'

interface CollectionBuilderProps {
  collection: CollectionOut | null
  entries: CollectionSpeciesOut[]
  onCollectionCreated: (c: CollectionOut) => void
  onEntryAdded: (entry: CollectionSpeciesOut) => void
  onEntryRemoved: (sequenceId: string) => void
  onStartAnalysis: () => void
  isAnalyzing: boolean
}

const SEQ_TYPES: { value: SeqType; label: string }[] = [
  { value: 'dna', label: 'DNA' },
  { value: 'rna', label: 'RNA' },
  { value: 'protein', label: 'PROTEIN' },
]

const panelVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

// --- Sequence type badge logic ---

type BadgeKind = 'PLASMID' | 'GENOME' | 'rRNA' | 'GENE' | 'FRAGMENT'

const BADGE_STYLES: Record<BadgeKind, string> = {
  PLASMID: 'bg-amber/15 text-amber border-amber/30',
  GENOME: 'bg-green/15 text-green border-green/30',
  rRNA: 'bg-cyan/15 text-cyan border-cyan/30',
  GENE: 'bg-purple/15 text-purple border-purple/30',
  FRAGMENT: 'bg-text-dim/10 text-text-dim border-text-dim/20',
}

function classifySequence(title: string): BadgeKind {
  const t = title.toLowerCase()
  if (t.includes('plasmid')) return 'PLASMID'
  if (t.includes('chromosome') || t.includes('complete genome')) return 'GENOME'
  if (t.includes('16s') || t.includes('rrna')) return 'rRNA'
  if (t.includes('gene') || t.includes('cds')) return 'GENE'
  return 'FRAGMENT'
}

function SequenceBadge({ title }: { title: string }) {
  const kind = classifySequence(title)
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold uppercase tracking-wider shrink-0',
        BADGE_STYLES[kind],
      )}
    >
      {kind}
    </span>
  )
}

// --- Batch search types ---

type BatchItemStatus = 'pending' | 'loading' | 'found' | 'not_found' | 'error'

interface BatchItem {
  name: string
  status: BatchItemStatus
  results: SpeciesSearchResult[]
  error?: string
}

export function CollectionBuilder({
  collection,
  entries,
  onCollectionCreated,
  onEntryAdded,
  onEntryRemoved,
  onStartAnalysis,
  isAnalyzing,
}: CollectionBuilderProps) {
  const [seqType, setSeqType] = useState<SeqType>('dna')
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesSearchResult | null>(null)
  const [sequences, setSequences] = useState<SequenceListResponse | null>(null)
  const [isLoadingSeqs, setIsLoadingSeqs] = useState(false)
  const [isAdding, setIsAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geneFilter, setGeneFilter] = useState('')

  // Gene target (modo automatico)
  const [geneTargets, setGeneTargets] = useState<GeneTarget[]>([])
  const [selectedGeneTarget, setSelectedGeneTarget] = useState<string | null>(null)
  const [autoAddLoading, setAutoAddLoading] = useState<string | null>(null) // nome da especie sendo adicionada

  // Carrega lista de genes disponiveis
  useEffect(() => {
    api.getGeneTargets().then(setGeneTargets).catch(() => {})
  }, [])

  // Se tem gene-alvo selecionado, estamos no modo automatico
  const isAutoMode = !!selectedGeneTarget

  // Search mode toggle
  const [searchMode, setSearchMode] = useState<'individual' | 'batch'>('individual')

  // Batch search state
  const [batchInput, setBatchInput] = useState('')
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [isBatchSearching, setIsBatchSearching] = useState(false)

  // Elapsed timers
  const seqElapsed = useElapsedTime(isLoadingSeqs)
  const batchElapsed = useElapsedTime(isBatchSearching)

  const handleSpeciesSelect = useCallback(
    async (species: SpeciesSearchResult) => {
      setSelectedSpecies(species)
      setSequences(null)
      setError(null)
      setIsLoadingSeqs(true)

      try {
        const data = await api.getSequences(species.taxon_id, seqType, 50, geneFilter)
        setSequences(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao buscar sequências')
      } finally {
        setIsLoadingSeqs(false)
      }
    },
    [seqType, geneFilter],
  )

  const handleSeqTypeChange = useCallback(
    (type: SeqType) => {
      setSeqType(type)
      if (selectedSpecies) {
        setSequences(null)
        setIsLoadingSeqs(true)
        setError(null)
        api
          .getSequences(selectedSpecies.taxon_id, type, 50, geneFilter)
          .then((data) => {
            setSequences(data)
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : 'Falha ao buscar sequências')
          })
          .finally(() => setIsLoadingSeqs(false))
      }
    },
    [selectedSpecies, geneFilter],
  )

  // Re-busca sequencias quando o filtro de gene muda
  const handleGeneSearch = useCallback(() => {
    if (!selectedSpecies) return
    setSequences(null)
    setIsLoadingSeqs(true)
    setError(null)
    api
      .getSequences(selectedSpecies.taxon_id, seqType, 50, geneFilter)
      .then((data) => setSequences(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao buscar sequências'))
      .finally(() => setIsLoadingSeqs(false))
  }, [selectedSpecies, seqType, geneFilter])

  const handleAddSequence = useCallback(
    async (seq: SequenceOut, speciesOverride?: SpeciesSearchResult) => {
      const species = speciesOverride || selectedSpecies
      if (!species) return
      setIsAdding(seq.id)
      setError(null)

      try {
        let col = collection
        if (!col) {
          col = await api.createCollection(
            `Analysis ${new Date().toISOString().slice(0, 10)}`,
            seqType,
          )
          onCollectionCreated(col)
        }

        const entry = await api.addToCollection(col.id, species.taxon_id, seq.id)
        onEntryAdded(entry)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao adicionar sequência')
      } finally {
        setIsAdding(null)
      }
    },
    [selectedSpecies, collection, seqType, onCollectionCreated, onEntryAdded],
  )

  // Auto-add: busca especie pelo nome e adiciona automaticamente a melhor sequencia
  const handleAutoAddSpecies = useCallback(
    async (speciesName: string) => {
      setAutoAddLoading(speciesName)
      setError(null)

      try {
        let col = collection
        if (!col) {
          const gene = geneTargets.find((g) => g.id === selectedGeneTarget)
          col = await api.createCollection(
            `Analysis ${new Date().toISOString().slice(0, 10)}`,
            (gene?.seq_type as SeqType) ?? seqType,
            selectedGeneTarget ?? undefined,
          )
          onCollectionCreated(col)
        }

        const entry = await api.autoAddSpecies(col.id, speciesName)
        onEntryAdded(entry)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao adicionar especie automaticamente')
      } finally {
        setAutoAddLoading(null)
      }
    },
    [collection, selectedGeneTarget, geneTargets, seqType, onCollectionCreated, onEntryAdded],
  )

  // Auto-add no modo individual: quando seleciona especie no modo auto, adiciona direto
  const handleAutoSpeciesSelect = useCallback(
    async (species: SpeciesSearchResult) => {
      await handleAutoAddSpecies(species.name)
    },
    [handleAutoAddSpecies],
  )

  // Auto-add em batch: sequencial pra cada especie, mantendo referencia local da collection
  const handleAutoBatchAdd = useCallback(async () => {
    const names = batchInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (names.length === 0) return

    const items: BatchItem[] = names.map((name) => ({
      name,
      status: 'pending',
      results: [],
    }))

    setBatchItems(items)
    setIsBatchSearching(true)
    setError(null)

    // Referencia local pra nao depender do state entre iteracoes
    let col = collection

    for (let idx = 0; idx < names.length; idx++) {
      setBatchItems((prev) => {
        const next = [...prev]
        next[idx] = { ...next[idx], status: 'loading' }
        return next
      })

      try {
        // Cria collection na primeira iteracao se nao existe
        if (!col) {
          const gene = geneTargets.find((g) => g.id === selectedGeneTarget)
          col = await api.createCollection(
            `Analysis ${new Date().toISOString().slice(0, 10)}`,
            (gene?.seq_type as SeqType) ?? seqType,
            selectedGeneTarget ?? undefined,
          )
          onCollectionCreated(col)
        }

        // Retry com backoff para lidar com rate limiting do NCBI
        let lastErr: unknown
        for (let retry = 0; retry < 3; retry++) {
          try {
            const entry = await api.autoAddSpecies(col.id, names[idx])
            onEntryAdded(entry)
            lastErr = null
            break
          } catch (e) {
            lastErr = e
            const msg = e instanceof Error ? e.message : ''
            // Retry em 429 (rate limit) ou 502 (NCBI indisponivel)
            const retryable = msg.includes('429') || msg.includes('Muitas buscas') || msg.includes('502') || msg.includes('500') || msg.includes('NCBI indisponivel') || msg.includes('Internal Server Error') || msg.includes('RemoteDisconnected')
            if (retryable) {
              await new Promise((r) => setTimeout(r, 3000 * (retry + 1)))
            } else {
              break
            }
          }
        }

        if (lastErr) throw lastErr

        setBatchItems((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], status: 'found' }
          return next
        })
      } catch (err) {
        setBatchItems((prev) => {
          const next = [...prev]
          next[idx] = {
            ...next[idx],
            status: 'error',
            error: err instanceof Error ? err.message : 'Erro',
          }
          return next
        })
      }

      // Delay entre especies para respeitar rate limit do NCBI
      if (idx < names.length - 1) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    setIsBatchSearching(false)
  }, [batchInput, collection, selectedGeneTarget, geneTargets, seqType, onCollectionCreated, onEntryAdded])

  const handleRemoveEntry = useCallback(
    async (sequenceId: string) => {
      if (!collection) return
      setError(null)

      try {
        await api.removeFromCollection(collection.id, sequenceId)
        onEntryRemoved(sequenceId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao remover sequência')
      }
    },
    [collection, onEntryRemoved],
  )

  // --- Batch search ---
  const handleBatchSearch = useCallback(async () => {
    const names = batchInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (names.length === 0) return

    const items: BatchItem[] = names.map((name) => ({
      name,
      status: 'pending',
      results: [],
    }))

    setBatchItems(items)
    setIsBatchSearching(true)

    // Search sequentially to respect NCBI rate limits
    for (let idx = 0; idx < names.length; idx++) {
      setBatchItems((prev) => {
        const next = [...prev]
        next[idx] = { ...next[idx], status: 'loading' }
        return next
      })

      try {
        // Retry com backoff para lidar com rate limiting do NCBI
        let results: SpeciesSearchResult[] = []
        let lastErr: unknown
        for (let retry = 0; retry < 3; retry++) {
          try {
            results = await api.searchSpecies(names[idx])
            lastErr = null
            break
          } catch (e) {
            lastErr = e
            const msg = e instanceof Error ? e.message : ''
            const retryable = msg.includes('429') || msg.includes('Muitas buscas') || msg.includes('502') || msg.includes('500') || msg.includes('NCBI indisponivel')
            if (retryable && retry < 2) {
              await new Promise((r) => setTimeout(r, 3000 * (retry + 1)))
            } else {
              break
            }
          }
        }

        if (lastErr) throw lastErr

        setBatchItems((prev) => {
          const next = [...prev]
          next[idx] = {
            ...next[idx],
            status: results.length > 0 ? 'found' : 'not_found',
            results,
          }
          return next
        })
      } catch (err) {
        setBatchItems((prev) => {
          const next = [...prev]
          next[idx] = {
            ...next[idx],
            status: 'error',
            error: err instanceof Error ? err.message : 'Erro na busca',
          }
          return next
        })
      }

      // Delay entre especies para respeitar rate limit do NCBI
      if (idx < names.length - 1) {
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    setIsBatchSearching(false)
  }, [batchInput])

  const handleBatchSpeciesSelect = useCallback(
    (species: SpeciesSearchResult) => {
      handleSpeciesSelect(species)
      // Switch back to individual mode to show sequence list
      setSearchMode('individual')
    },
    [handleSpeciesSelect],
  )

  const addedSequenceIds = new Set(entries.map((e) => e.sequence.id))

  return (
    <div className="flex flex-col overflow-y-auto h-full">
      {/* Gene target picker */}
      <div className="p-4 border-b border-border">
        <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
          01 // Gene Alvo
        </label>

        {/* Grid de genes */}
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {geneTargets.map((gene) => (
            <button
              key={gene.id}
              onClick={() => {
                if (!collection) {
                  setSelectedGeneTarget(gene.id === selectedGeneTarget ? null : gene.id)
                  setSeqType(gene.seq_type)
                }
              }}
              disabled={!!collection}
              className={cn(
                'px-2.5 py-2 rounded font-mono text-left transition-all cursor-pointer',
                selectedGeneTarget === gene.id
                  ? 'bg-cyan/15 border border-cyan/40 text-cyan'
                  : 'bg-panel border border-border text-text-dim hover:text-text-muted hover:border-border-bright',
                collection && 'opacity-60 cursor-not-allowed',
              )}
              title={gene.description}
            >
              <div className="flex items-center gap-1.5">
                <Crosshair className="w-3 h-3 shrink-0" />
                <span className="text-xs font-semibold">{gene.label}</span>
              </div>
              <p className="text-[9px] text-text-dim/70 mt-0.5 line-clamp-1">{gene.description}</p>
            </button>
          ))}
        </div>

        {/* Fallback: tipo de sequencia manual */}
        {!isAutoMode && (
          <div className="flex gap-1">
            {SEQ_TYPES.map((st) => (
              <button
                key={st.value}
                onClick={() => handleSeqTypeChange(st.value)}
                disabled={!!collection}
                className={cn(
                  'px-3 py-1.5 rounded font-mono text-xs font-semibold tracking-wider transition-colors cursor-pointer',
                  seqType === st.value
                    ? 'bg-cyan text-deep-bg'
                    : 'bg-panel border border-border text-text-dim hover:text-text-muted hover:border-border-bright',
                  collection && 'opacity-60 cursor-not-allowed',
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}

        {isAutoMode && (
          <p className="font-mono text-[10px] text-cyan/70 mt-1">
            Modo automatico: a melhor sequencia sera selecionada pra voce
          </p>
        )}
      </div>

      {/* Species search with mode toggle */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider">
            02 // {isAutoMode ? 'Adicionar Espécies' : 'Buscar Espécie'}
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => setSearchMode('individual')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] transition-colors cursor-pointer',
                searchMode === 'individual'
                  ? 'bg-cyan/15 text-cyan border border-cyan/30'
                  : 'text-text-dim hover:text-text-muted border border-transparent',
              )}
              title="Busca Individual"
            >
              <List className="w-3 h-3" />
              Individual
            </button>
            <button
              onClick={() => setSearchMode('batch')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] transition-colors cursor-pointer',
                searchMode === 'batch'
                  ? 'bg-cyan/15 text-cyan border border-cyan/30'
                  : 'text-text-dim hover:text-text-muted border border-transparent',
              )}
              title="Busca em Lote"
            >
              <Layers className="w-3 h-3" />
              Lote
            </button>
          </div>
        </div>

        {/* Aviso se nao selecionou gene — so mostra se nao tem colecao ainda */}
        {!isAutoMode && !collection && (
          <p className="font-mono text-[10px] text-amber/80 mb-2">
            Selecione um gene alvo acima para o modo automatico, ou busque manualmente abaixo.
          </p>
        )}

        {isAutoMode && (
          <p className="font-mono text-[10px] text-cyan/70 mb-2">
            Digite o nome do animal/planta e o sistema seleciona a sequencia certa pra voce.
          </p>
        )}

        <AnimatePresence mode="wait">
          {searchMode === 'individual' ? (
            <motion.div
              key="individual"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <SpeciesSearch onSelect={isAutoMode ? handleAutoSpeciesSelect : handleSpeciesSelect} />
              {isAutoMode && autoAddLoading && (
                <div className="flex items-center gap-2 mt-2 font-mono text-xs text-cyan">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Buscando melhor sequencia para {autoAddLoading}...
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="batch"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-2"
            >
              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder={
                  isAutoMode
                    ? 'Cole os nomes dos animais/plantas, um por linha...\n\nExemplo:\nHomo sapiens\nPan troglodytes\nGorilla gorilla\nPongo abelii'
                    : 'Cole os nomes das espécies, um por linha...\n\nExemplo:\nEscherichia coli\nSalmonella enterica\nKlebsiella pneumoniae'
                }
                className={cn(
                  'w-full px-3 py-3 bg-panel border border-border rounded font-mono text-sm text-text',
                  'placeholder:text-text-dim outline-none transition-all resize-none',
                  'focus:border-cyan focus:glow-cyan',
                  'min-h-[120px]',
                )}
              />
              <GlowButton
                onClick={isAutoMode ? handleAutoBatchAdd : handleBatchSearch}
                disabled={isBatchSearching || batchInput.trim().length === 0}
                loading={isBatchSearching}
                className="w-full"
              >
                {isBatchSearching
                  ? `${isAutoMode ? 'Adicionando' : 'Buscando'}... (${batchElapsed}s)`
                  : isAutoMode ? 'Adicionar Todas' : 'Buscar Todas'}
              </GlowButton>

              {/* Batch progress bar */}
              {batchItems.length > 0 && (
                <div className="px-1 py-2 border-b border-border/50">
                  <div className="flex justify-between text-xs font-mono text-text-muted mb-1">
                    <span>
                      {batchItems.filter(i => i.status !== 'pending').length}/{batchItems.length} processadas
                    </span>
                    <span>
                      {batchItems.filter(i => i.status === 'found').length} encontradas
                    </span>
                  </div>
                  <div className="h-1 bg-panel rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan transition-all duration-300"
                      style={{
                        width: `${(batchItems.filter(i => i.status !== 'pending').length / batchItems.length) * 100}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Batch results */}
              {batchItems.length > 0 && (
                <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-1 mt-1">
                  {batchItems.map((item, idx) => (
                    <motion.div
                      key={`${item.name}-${idx}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, delay: idx * 0.03 }}
                      className="px-3 py-2 rounded border border-border bg-panel/60"
                    >
                      <div className="flex items-center gap-2">
                        {/* Status indicator */}
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            item.status === 'pending' && 'bg-text-dim/40',
                            item.status === 'loading' && 'bg-cyan animate-pulse',
                            item.status === 'found' && 'bg-green',
                            item.status === 'not_found' && 'bg-amber',
                            item.status === 'error' && 'bg-red',
                          )}
                        />
                        <span className="font-mono text-xs text-text flex-1 truncate">
                          {item.name}
                        </span>
                        <span className="font-mono text-[10px] text-text-dim shrink-0">
                          {item.status === 'pending' && 'Aguardando'}
                          {item.status === 'loading' && 'Buscando...'}
                          {item.status === 'found' &&
                            `${item.results.length} resultado${item.results.length !== 1 ? 's' : ''}`}
                          {item.status === 'not_found' && 'Não encontrado'}
                          {item.status === 'error' && (item.error || 'Erro')}
                        </span>
                      </div>

                      {/* Show first result with select button if found */}
                      {item.status === 'found' && item.results.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {item.results.slice(0, 3).map((species) => (
                            <button
                              key={species.taxon_id}
                              onClick={() => handleBatchSpeciesSelect(species)}
                              className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded text-left',
                                'border border-transparent transition-all cursor-pointer',
                                'hover:bg-cyan/5 hover:border-cyan/20',
                              )}
                            >
                              <span className="text-xs text-text font-semibold truncate flex-1">
                                {species.name}
                              </span>
                              <span className="text-[10px] font-mono text-text-dim uppercase shrink-0">
                                {species.rank}
                              </span>
                              <Plus className="w-3.5 h-3.5 text-text-dim shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gene filter (so no modo manual) */}
      {selectedSpecies && !isAutoMode && (
        <div className="p-4 border-b border-border">
          <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
            03 // Filtrar por Gene
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={geneFilter}
              onChange={(e) => setGeneFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGeneSearch()}
              placeholder="Ex: COX1, 16S, cytochrome b, BRCA1..."
              className={cn(
                'flex-1 px-3 py-2 bg-panel border border-border rounded font-mono text-sm text-text',
                'placeholder:text-text-dim/50 outline-none transition-all',
                'focus:border-cyan focus:glow-cyan',
              )}
            />
            <button
              onClick={handleGeneSearch}
              disabled={isLoadingSeqs}
              className={cn(
                'px-3 py-2 rounded font-mono text-xs font-semibold transition-colors cursor-pointer',
                'bg-cyan/15 text-cyan border border-cyan/30 hover:bg-cyan/25',
                isLoadingSeqs && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {geneFilter && (
            <p className="font-mono text-[10px] text-text-dim mt-1">
              Filtrando por: <span className="text-cyan">{geneFilter}</span> — pressione Enter ou clique para buscar
            </p>
          )}
        </div>
      )}

      {/* Sequences for selected species (so no modo manual) */}
      <AnimatePresence>
        {selectedSpecies && !isAutoMode && (
          <motion.div
            key="sequences"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="p-4 border-b border-border"
          >
            <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
              04 // Sequências de {selectedSpecies.name}
            </label>

            {isLoadingSeqs && (
              <motion.span
                className="font-mono text-sm text-cyan"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                Buscando sequências...{seqElapsed > 0 && ` (${seqElapsed}s)`}
              </motion.span>
            )}

            {error && (
              <p className="font-mono text-sm text-red">{error}</p>
            )}

            {!isLoadingSeqs && sequences && (
              <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto pr-1">
                {sequences.sequences.length === 0 && (
                  <p className="font-mono text-xs text-text-dim py-2">
                    Nenhuma sequência encontrada.
                  </p>
                )}
                {sequences.sequences.map((seq) => {
                  const alreadyAdded = addedSequenceIds.has(seq.id)
                  return (
                    <motion.div
                      key={seq.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        'px-3 py-2 rounded border border-border bg-panel/60',
                        'hover:border-border-bright transition-colors',
                        'flex items-center gap-2',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-cyan font-semibold shrink-0">
                            {seq.accession}
                          </span>
                          <SequenceBadge title={seq.title} />
                          <span className="font-mono text-[11px] text-text-muted">
                            {seq.length.toLocaleString()} {seq.seq_type === 'protein' ? 'aa' : 'bp'}
                          </span>
                        </div>
                        <p className="text-xs text-text-dim mt-0.5 truncate">{seq.title}</p>
                      </div>
                      <button
                        onClick={() => handleAddSequence(seq)}
                        disabled={alreadyAdded || isAdding === seq.id}
                        className={cn(
                          'shrink-0 p-1.5 rounded transition-colors cursor-pointer',
                          alreadyAdded
                            ? 'text-green/60 cursor-not-allowed'
                            : 'text-text-dim hover:text-cyan hover:bg-cyan/10',
                          isAdding === seq.id && 'animate-pulse',
                        )}
                        title={alreadyAdded ? 'Já adicionado' : 'Adicionar à coleção'}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current collection */}
      <div className="p-4 flex-1 flex flex-col">
        <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
          <FlaskConical className="w-3 h-3 inline mr-1" />
          Coleção ({entries.length} {entries.length === 1 ? 'espécie' : 'espécies'})
        </label>

        {entries.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-6">
            <div className="text-center space-y-2">
              <Dna className="w-8 h-8 text-text-dim/30 mx-auto" strokeWidth={1} />
              <p className="font-mono text-xs text-text-dim/60">
                Adicione pelo menos 4 espécies para análise comparativa
              </p>
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto pr-1 mb-4">
            {entries.map((entry) => (
              <motion.div
                key={entry.sequence.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-panel/60"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-text font-semibold truncate block">
                    {entry.species.name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[10px] text-text-dim truncate">
                      {entry.sequence.accession}
                    </span>
                    <SequenceBadge title={entry.sequence.title} />
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveEntry(entry.sequence.id)}
                  className="shrink-0 p-1 rounded text-text-dim hover:text-red hover:bg-red/10 transition-colors cursor-pointer"
                  title="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {entries.length < 4 && entries.length > 0 && (
          <p className="font-mono text-[10px] text-amber mb-3">
            Mínimo de 4 espécies necessário ({4 - entries.length} restante{4 - entries.length > 1 ? 's' : ''})
          </p>
        )}

        <div className="mt-auto">
          <GlowButton
            onClick={onStartAnalysis}
            disabled={entries.length < 4 || isAnalyzing}
            loading={isAnalyzing}
            className="w-full"
          >
            Iniciar Análise
          </GlowButton>
        </div>
      </div>
    </div>
  )
}
