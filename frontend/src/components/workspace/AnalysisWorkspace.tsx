import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Dna, GitBranch, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useJobProgress } from '@/hooks/useJobProgress'
import { CollectionBuilder } from './CollectionBuilder'
import { JobProgress } from './JobProgress'
import { Dendrogram } from '@/components/results/Dendrogram'
import { ConservationMap } from '@/components/results/ConservationMap'
import type {
  CollectionOut,
  CollectionSpeciesOut,
  JobStatusOut,
  JobResultsOut,
} from '@/lib/types'

/* ─── Result Tabs ─── */

type ResultTab = 'tree' | 'conservation'

function ResultTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ResultTab
  onTabChange: (tab: ResultTab) => void
}) {
  const tabs: { id: ResultTab; label: string; icon: React.ReactNode }[] = [
    { id: 'tree', label: 'Árvore Filogenética', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: 'conservation', label: 'Regiões Conservadas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="flex border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-2 px-5 py-3 font-mono text-xs font-semibold tracking-wider',
            'border-b-2 -mb-px transition-colors cursor-pointer',
            activeTab === tab.id
              ? 'border-cyan text-cyan'
              : 'border-transparent text-text-dim hover:text-text-muted',
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* ─── Empty State ─── */

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6">
        <Dna className="w-16 h-16 text-text-dim/30 mx-auto" strokeWidth={1} />
        <div className="space-y-2">
          <p className="font-mono text-lg text-text-dim">
            Construa uma coleção para começar
          </p>
          <p className="font-mono text-xs text-text-dim/60">
            Busque espécies, adicione sequências e inicie a análise comparativa
          </p>
        </div>
        <div className="font-mono text-[10px] text-text-dim/30 leading-relaxed whitespace-pre">
{`    ___
   /   \\
  | A T |
  | G C |
  | T A |
  | C G |
   \\___/`}
        </div>
      </div>
    </div>
  )
}

/* ─── Error Banner ─── */

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mx-4 mt-4 px-4 py-3 rounded border border-red/30 bg-red/5 flex items-start gap-3"
    >
      <AlertCircle className="w-4 h-4 text-red shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-mono text-sm text-red">{message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="font-mono text-xs text-red/60 hover:text-red transition-colors cursor-pointer"
      >
        DISMISS
      </button>
    </motion.div>
  )
}

/* ─── Main Workspace ─── */

export function AnalysisWorkspace() {
  const [collection, setCollection] = useState<CollectionOut | null>(null)
  const [entries, setEntries] = useState<CollectionSpeciesOut[]>([])
  const [job, setJob] = useState<JobStatusOut | null>(null)
  const [jobResults, setJobResults] = useState<JobResultsOut | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>('tree')
  const [error, setError] = useState<string | null>(null)

  const jobProgress = useJobProgress(job?.id ?? null)

  // Fetch results when job completes
  useEffect(() => {
    if (!job) return
    if (!jobProgress.isComplete) return
    if (jobProgress.status === 'failed') return
    if (jobResults?.id === job.id) return

    api
      .getJobResults(job.id)
      .then((results) => setJobResults(results))
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao buscar resultados'))
  }, [job, jobProgress.isComplete, jobProgress.status, jobResults?.id])

  // Fetch partial results when preview_tree step completes
  useEffect(() => {
    if (!job) return
    if (jobProgress.status !== 'full_tree' && jobProgress.status !== 'conservation') return
    if (jobResults) return

    api
      .getJobResults(job.id)
      .then((results) => setJobResults(results))
      .catch(() => {
        // Partial results may not be ready yet, ignore
      })
  }, [job, jobProgress.status, jobResults])

  const handleCollectionCreated = useCallback((c: CollectionOut) => {
    setCollection(c)
  }, [])

  const handleEntryAdded = useCallback((entry: CollectionSpeciesOut) => {
    setEntries((prev) => [...prev, entry])
  }, [])

  const handleEntryRemoved = useCallback((sequenceId: string) => {
    setEntries((prev) => prev.filter((e) => e.sequence.id !== sequenceId))
  }, [])

  const handleStartAnalysis = useCallback(async () => {
    if (!collection) return
    setError(null)
    setJobResults(null)
    setJob(null)

    try {
      const newJob = await api.createJob(collection.id)
      setJob(newJob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar análise')
    }
  }, [collection])

  const handleRetry = useCallback(() => {
    setJob(null)
    setJobResults(null)
    setError(null)
    handleStartAnalysis()
  }, [handleStartAnalysis])

  const isAnalyzing = !!job && !jobProgress.isComplete
  const hasResults = !!jobResults && jobProgress.isComplete && jobProgress.status !== 'failed'
  const hasPartialResults = !!jobResults && !jobProgress.isComplete
  const showProgress = isAnalyzing || (!!job && jobProgress.status === 'failed')

  // Determine which newick to display
  const displayNewick = jobResults?.tree ?? jobResults?.preview_tree ?? null
  const isPreviewTree = !jobResults?.tree && !!jobResults?.preview_tree
  const treeModel = jobResults?.tree_model ?? undefined

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ─── Left Panel ─── */}
      <div className="w-[420px] shrink-0 border-r border-border flex flex-col overflow-hidden">
        <CollectionBuilder
          collection={collection}
          entries={entries}
          onCollectionCreated={handleCollectionCreated}
          onEntryAdded={handleEntryAdded}
          onEntryRemoved={handleEntryRemoved}
          onStartAnalysis={handleStartAnalysis}
          isAnalyzing={isAnalyzing}
        />
      </div>

      {/* ─── Right Panel ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Error banner */}
        <AnimatePresence>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        </AnimatePresence>

        {/* Empty state */}
        {!job && !hasResults && <EmptyState />}

        {/* Job progress */}
        {showProgress && (
          <div className="flex-1 flex items-center justify-center p-8">
            <JobProgress
              status={jobProgress.status}
              progressPct={jobProgress.progressPct}
              progressMsg={jobProgress.progressMsg}
              error={jobProgress.error}
              isComplete={jobProgress.isComplete}
              onRetry={handleRetry}
              sequenceCount={entries.length}
              totalLength={entries.reduce((sum, e) => sum + (e.sequence.length ?? 0), 0)}
            />
          </div>
        )}

        {/* Partial results: show preview tree during analysis */}
        {hasPartialResults && displayNewick && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-border px-4 py-2">
              <span className="font-mono text-xs text-amber font-semibold uppercase tracking-wider">
                Resultados Parciais
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <Dendrogram newick={displayNewick} treeModel={treeModel} isPreview={true} />
            </div>
          </div>
        )}

        {/* Final results */}
        {hasResults && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ResultTabBar activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                {activeTab === 'tree' && displayNewick && (
                  <motion.div
                    key="tree-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Dendrogram
                      newick={displayNewick}
                      treeModel={treeModel}
                      isPreview={isPreviewTree}
                    />
                  </motion.div>
                )}

                {activeTab === 'tree' && !displayNewick && (
                  <motion.div
                    key="tree-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center py-12"
                  >
                    <p className="font-mono text-sm text-text-dim">
                      Dados da árvore não disponíveis
                    </p>
                  </motion.div>
                )}

                {activeTab === 'conservation' && jobResults.conservation && (
                  <motion.div
                    key="conservation-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ConservationMap data={jobResults.conservation} />
                  </motion.div>
                )}

                {activeTab === 'conservation' && !jobResults.conservation && (
                  <motion.div
                    key="conservation-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center py-12"
                  >
                    <p className="font-mono text-sm text-text-dim">
                      Dados de conservação não disponíveis
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
