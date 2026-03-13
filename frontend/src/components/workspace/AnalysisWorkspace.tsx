import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Dna, GitBranch, BarChart3, AlignLeft, Download, FileSpreadsheet, Image, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/download'
import { useJobProgress } from '@/hooks/useJobProgress'
import { CollectionBuilder } from './CollectionBuilder'
import { JobProgress } from './JobProgress'
import { Dendrogram } from '@/components/results/Dendrogram'
import { ConservationMap } from '@/components/results/ConservationMap'
import { AlignmentViewer } from '@/components/results/AlignmentViewer'
import type {
  CollectionOut,
  CollectionSpeciesOut,
  JobStatusOut,
  JobResultsOut,
  ResultTab,
} from '@/lib/types'

function ResultTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ResultTab
  onTabChange: (tab: ResultTab) => void
}) {
  const tabs: { id: ResultTab; label: string; icon: React.ReactNode }[] = [
    { id: 'tree', label: 'Arvore Filogenetica', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: 'alignment', label: 'Alinhamento', icon: <AlignLeft className="w-3.5 h-3.5" /> },
    { id: 'conservation', label: 'Regioes Conservadas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
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

/* --- Barra de Exportacao --- */

function ExportBar({
  jobResults,
  jobId,
  exportSvgFn,
}: {
  jobResults: JobResultsOut
  jobId: string
  exportSvgFn: React.MutableRefObject<(() => string) | null>
}) {
  const handleDownloadFasta = () => {
    if (!jobResults.alignment) return
    downloadBlob(jobResults.alignment, 'alignment.fasta', 'text/plain')
  }

  const handleDownloadSvg = () => {
    const svgStr = exportSvgFn.current?.()
    if (!svgStr) return
    // Adiciona header XML pro SVG ser valido como arquivo
    const fullSvg = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr
    downloadBlob(fullSvg, 'phylogenetic_tree.svg', 'image/svg+xml')
  }

  const handleDownloadPng = () => {
    const svgStr = exportSvgFn.current?.()
    if (!svgStr) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new window.Image()

    // Escala 2x para alta resolucao (~300 DPI)
    const scaleFactor = 2

    img.onload = () => {
      canvas.width = img.width * scaleFactor
      canvas.height = img.height * scaleFactor

      if (ctx) {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scaleFactor, scaleFactor)
        ctx.drawImage(img, 0, 0)
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `phylogenetic_tree.png`
          a.click()
          URL.revokeObjectURL(url)
        }
      }, 'image/png')
    }

    const blob = new Blob([svgStr], { type: 'image/svg+xml' })
    img.src = URL.createObjectURL(blob)
  }

  const handleDownloadNewick = () => {
    const newick = jobResults.tree ?? jobResults.preview_tree
    if (!newick) return
    downloadBlob(newick, 'phylogenetic_tree.nwk', 'text/plain')
  }

  const handleDownloadExcel = () => {
    window.open(`/api/jobs/${jobId}/export/excel`, '_blank')
  }

  const btnClass = 'flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-panel hover:bg-panel/80 text-text-muted hover:text-text font-mono text-[11px] transition-colors cursor-pointer'
  const btnDisabled = 'border-border/50 bg-panel/50 text-text-dim/50 cursor-not-allowed'

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel/30">
      <span className="font-mono text-[10px] text-text-dim uppercase tracking-wider mr-2">
        Exportar:
      </span>
      <button
        onClick={handleDownloadFasta}
        disabled={!jobResults.alignment}
        className={cn(btnClass, !jobResults.alignment && btnDisabled)}
      >
        <Download className="w-3.5 h-3.5" />
        FASTA
      </button>
      <button
        onClick={handleDownloadNewick}
        disabled={!jobResults.tree && !jobResults.preview_tree}
        className={cn(btnClass, !jobResults.tree && !jobResults.preview_tree && btnDisabled)}
      >
        <FileText className="w-3.5 h-3.5" />
        Newick
      </button>
      <button onClick={handleDownloadSvg} className={btnClass}>
        <Image className="w-3.5 h-3.5" />
        SVG
      </button>
      <button onClick={handleDownloadPng} className={btnClass}>
        <Image className="w-3.5 h-3.5" />
        PNG
      </button>
      <button onClick={handleDownloadExcel} className={btnClass}>
        <FileSpreadsheet className="w-3.5 h-3.5" />
        Excel
      </button>
    </div>
  )
}

/* --- Empty State --- */

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6">
        <Dna className="w-16 h-16 text-text-dim/30 mx-auto" strokeWidth={1} />
        <div className="space-y-2">
          <p className="font-mono text-lg text-text-dim">
            Construa uma colecao para comecar
          </p>
          <p className="font-mono text-xs text-text-dim/60">
            Busque especies, adicione sequencias e inicie a analise comparativa
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

/* --- Error Banner --- */

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

/* --- Main Workspace --- */

export function AnalysisWorkspace() {
  const [collection, setCollection] = useState<CollectionOut | null>(null)
  const [entries, setEntries] = useState<CollectionSpeciesOut[]>([])
  const [job, setJob] = useState<JobStatusOut | null>(null)
  const [jobResults, setJobResults] = useState<JobResultsOut | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>('tree')
  const [error, setError] = useState<string | null>(null)
  const exportSvgRef = useRef<(() => string) | null>(null)

  const jobProgress = useJobProgress(job?.id ?? null)

  // Fetch results when job completes (sempre re-busca pra pegar conservation)
  useEffect(() => {
    if (!job) return
    if (!jobProgress.isComplete) return
    if (jobProgress.status === 'failed') return

    api
      .getJobResults(job.id)
      .then((results) => setJobResults(results))
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao buscar resultados'))
  }, [job, jobProgress.isComplete, jobProgress.status])

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
      setError(err instanceof Error ? err.message : 'Falha ao iniciar analise')
    }
  }, [collection])

  const handleRetry = useCallback(() => {
    setJob(null)
    setJobResults(null)
    setError(null)
    handleStartAnalysis()
  }, [handleStartAnalysis])

  // Callback do Dendrogram quando fica pronto
  const handleDendrogramReady = useCallback((fns: { exportSvg: () => string }) => {
    exportSvgRef.current = fns.exportSvg
  }, [])

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
      {/* --- Left Panel --- */}
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

      {/* --- Right Panel --- */}
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
              connectionStatus={jobProgress.connectionStatus}
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
            {/* Barra de exportacao */}
            <ExportBar
              jobResults={jobResults!}
              jobId={job!.id}
              exportSvgFn={exportSvgRef}
            />

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
                      onReady={handleDendrogramReady}
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
                      Dados da arvore nao disponiveis
                    </p>
                  </motion.div>
                )}

                {activeTab === 'alignment' && jobResults.alignment && (
                  <motion.div
                    key="alignment-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AlignmentViewer
                      alignment={jobResults.alignment}
                      conservation={jobResults.conservation}
                    />
                  </motion.div>
                )}

                {activeTab === 'alignment' && !jobResults.alignment && (
                  <motion.div
                    key="alignment-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center py-12"
                  >
                    <p className="font-mono text-sm text-text-dim">
                      Dados de alinhamento nao disponiveis
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
                      Dados de conservacao nao disponiveis
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
