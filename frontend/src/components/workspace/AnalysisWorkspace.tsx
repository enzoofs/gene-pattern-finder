import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Dna, BarChart3, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { ScanLoader } from '@/components/ui/ScanLoader'
import { SpeciesSearch } from './SpeciesSearch'
import { SequencePanel } from './SequencePanel'
import { QueryInput } from './QueryInput'
import { BlastResults } from '@/components/results/BlastResults'
import { Dendrogram } from '@/components/results/Dendrogram'
import type {
  SpeciesSearchResult,
  SequenceListResponse,
  BlastRequest,
  BlastResponse,
  TreeResponse,
  TreeMode,
} from '@/lib/types'

/* ─── Step Indicator ─── */

interface Step {
  number: number
  label: string
  status: 'done' | 'active' | 'pending'
}

function StepIndicator({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-center gap-0 px-2 py-3">
      {steps.map((step, i) => (
        <div key={step.number} className="flex items-center">
          {/* Step circle + label */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-bold border transition-colors',
                step.status === 'done' && 'bg-green/20 border-green text-green',
                step.status === 'active' && 'bg-cyan/20 border-cyan text-cyan glow-cyan',
                step.status === 'pending' && 'bg-transparent border-border text-text-dim',
              )}
            >
              {step.status === 'done' ? (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                step.number
              )}
            </div>
            <span
              className={cn(
                'font-mono text-[10px] font-semibold uppercase tracking-wider',
                step.status === 'done' && 'text-green',
                step.status === 'active' && 'text-cyan',
                step.status === 'pending' && 'text-text-dim',
              )}
            >
              {step.label}
            </span>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className={cn(
                'w-8 h-px mx-2',
                step.status === 'done' ? 'bg-green/40' : 'bg-border',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Tab Bar ─── */

type Tab = 'blast' | 'tree'

function TabBar({
  activeTab,
  onTabChange,
  hasResults,
}: {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  hasResults: boolean
}) {
  if (!hasResults) return null

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'blast', label: 'BLAST Results', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'tree', label: 'Phylogenetic Tree', icon: <GitBranch className="w-3.5 h-3.5" /> },
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
            Select a species to begin
          </p>
          <p className="font-mono text-xs text-text-dim/60">
            Search for an organism, fetch sequences, and run BLAST analysis
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

const panelVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

export function AnalysisWorkspace() {
  const [species, setSpecies] = useState<SpeciesSearchResult | null>(null)
  const [sequences, setSequences] = useState<SequenceListResponse | null>(null)
  const [blastResult, setBlastResult] = useState<BlastResponse | null>(null)
  const [treeResult, setTreeResult] = useState<TreeResponse | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('blast')
  const [error, setError] = useState<string | null>(null)

  // Track which tree mode was last fetched to avoid refetch
  const [treeModeLoaded, setTreeModeLoaded] = useState<TreeMode | null>(null)

  /* ─── Compute steps ─── */
  const steps: Step[] = [
    {
      number: 1,
      label: 'Species',
      status: species ? 'done' : 'active',
    },
    {
      number: 2,
      label: 'Sequences',
      status: sequences ? 'done' : species ? 'active' : 'pending',
    },
    {
      number: 3,
      label: 'Analysis',
      status: blastResult ? 'done' : sequences ? 'active' : 'pending',
    },
  ]

  /* ─── Handlers ─── */

  const handleSpeciesSelect = useCallback((s: SpeciesSearchResult) => {
    setSpecies(s)
    setSequences(null)
    setBlastResult(null)
    setTreeResult(null)
    setTreeModeLoaded(null)
    setError(null)
    setActiveTab('blast')
  }, [])

  const handleSequencesFetched = useCallback((data: SequenceListResponse) => {
    setSequences(data)
  }, [])

  const handleBlastSubmit = useCallback(async (req: BlastRequest) => {
    setIsAnalyzing(true)
    setError(null)
    setBlastResult(null)
    setTreeResult(null)
    setTreeModeLoaded(null)

    try {
      const result = await api.runBlast(req)
      setBlastResult(result)
      setActiveTab('blast')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BLAST analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const fetchTree = useCallback(async (analysisId: string, mode: TreeMode) => {
    setIsLoadingTree(true)
    setError(null)

    try {
      const tree = await api.getTree({ analysis_id: analysisId, mode })
      setTreeResult(tree)
      setTreeModeLoaded(mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build phylogenetic tree')
    } finally {
      setIsLoadingTree(false)
    }
  }, [])

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab)

      // Fetch tree on first switch to tree tab
      if (tab === 'tree' && blastResult && !treeResult && !isLoadingTree) {
        fetchTree(blastResult.id, 'query_vs_all')
      }
    },
    [blastResult, treeResult, isLoadingTree, fetchTree],
  )

  const handleTreeModeChange = useCallback(
    (mode: TreeMode) => {
      if (!blastResult) return
      if (mode === treeModeLoaded) return
      fetchTree(blastResult.id, mode)
    },
    [blastResult, treeModeLoaded, fetchTree],
  )

  /* ─── Render ─── */

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ─── Left Panel ─── */}
      <div className="w-[420px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
        {/* Step indicator */}
        <div className="border-b border-border">
          <StepIndicator steps={steps} />
        </div>

        {/* Species search */}
        <div className="p-4 border-b border-border">
          <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
            01 // Species
          </label>
          <SpeciesSearch onSelect={handleSpeciesSelect} />
        </div>

        {/* Sequence panel */}
        <AnimatePresence>
          {species && (
            <motion.div
              key="seq-panel"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="p-4 border-b border-border"
            >
              <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
                02 // Sequences
              </label>
              <SequencePanel
                species={species}
                onSequencesFetched={handleSequencesFetched}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Query input */}
        <AnimatePresence>
          {species && sequences && (
            <motion.div
              key="query-panel"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, delay: 0.1 }}
              className="p-4"
            >
              <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
                03 // Analysis
              </label>
              <QueryInput
                species={species}
                sequences={sequences}
                onSubmit={handleBlastSubmit}
                isLoading={isAnalyzing}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Right Panel ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          )}
        </AnimatePresence>

        {/* No results yet */}
        {!blastResult && !isAnalyzing && <EmptyState />}

        {/* Loading state */}
        {isAnalyzing && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-md">
              <ScanLoader message="Running BLAST analysis..." />
            </div>
          </div>
        )}

        {/* Results */}
        {blastResult && !isAnalyzing && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <TabBar
              activeTab={activeTab}
              onTabChange={handleTabChange}
              hasResults={!!blastResult}
            />

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                {activeTab === 'blast' && (
                  <motion.div
                    key="blast-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <BlastResults result={blastResult} />
                  </motion.div>
                )}

                {activeTab === 'tree' && (
                  <motion.div
                    key="tree-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isLoadingTree && (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-full max-w-md">
                          <ScanLoader message="Building phylogenetic tree..." />
                        </div>
                      </div>
                    )}

                    {!isLoadingTree && treeResult && (
                      <Dendrogram
                        data={treeResult}
                        queryLabel="Query"
                        onModeChange={handleTreeModeChange}
                      />
                    )}

                    {!isLoadingTree && !treeResult && (
                      <div className="flex items-center justify-center py-12">
                        <p className="font-mono text-sm text-text-dim">
                          No tree data available
                        </p>
                      </div>
                    )}
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
