import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { InsightsData, InsightEntry } from '@/lib/types'

interface InsightsPanelProps {
  data: InsightsData
}

const CONFIDENCE_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  high: { bg: 'bg-green/10', border: 'border-green/30', text: 'text-green', label: 'Alta' },
  medium: { bg: 'bg-amber/10', border: 'border-amber/30', text: 'text-amber', label: 'Media' },
  low: { bg: 'bg-red/10', border: 'border-red/30', text: 'text-red', label: 'Baixa' },
}

const CATEGORY_LABELS: Record<string, string> = {
  conservation_warning: 'Aviso de Conservacao',
  high_conservation: 'Alta Conservacao',
  significant_conservation: 'Conservacao Significativa',
  significant_motif: 'Motif Significativo',
  high_ic_motif: 'Motif Alto IC',
  no_motifs: 'Sem Motifs',
  conserved_functional_element: 'Elemento Funcional Conservado',
  cluster_quality: 'Qualidade de Clustering',
  bootstrap_validation: 'Validacao Bootstrap',
  unstable_sequences: 'Sequencias Instaveis',
  cluster_divergence: 'Divergencia entre Clusters',
  network_hub: 'Hub de Rede',
  network_fragmented: 'Rede Fragmentada',
  network_dense: 'Rede Densa',
  hub_bridging: 'Hub Intermediario',
}

function InsightCard({ insight, index }: { insight: InsightEntry; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const style = CONFIDENCE_STYLES[insight.confidence] ?? CONFIDENCE_STYLES.low

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn('border rounded p-4 space-y-2 cursor-pointer transition-colors', style.bg, style.border)}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', style.bg, style.text)}>
              {style.label}
            </span>
            <span className="font-mono text-[10px] text-text-dim uppercase tracking-wider">
              {CATEGORY_LABELS[insight.category] ?? insight.category}
            </span>
          </div>
          <p className="font-mono text-sm text-text-muted leading-relaxed">
            {insight.text}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && Object.keys(insight.supporting_data).length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 border-t border-border/30 mt-2">
              <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider mb-1">
                Dados de suporte:
              </p>
              <div className="font-mono text-[11px] text-text-dim bg-panel/50 rounded p-2 overflow-x-auto">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(insight.supporting_data, null, 2)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function InsightsPanel({ data }: InsightsPanelProps) {
  if (!data.insights.length) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="font-mono text-sm text-text-dim">
          Nenhuma hipotese gerada para esta analise
        </p>
      </div>
    )
  }

  // Group by confidence
  const highInsights = data.insights.filter((i) => i.confidence === 'high')
  const mediumInsights = data.insights.filter((i) => i.confidence === 'medium')
  const lowInsights = data.insights.filter((i) => i.confidence === 'low')

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Hipoteses', value: data.n_insights },
          { label: 'Alta Confianca', value: highInsights.length },
          { label: 'Media Confianca', value: mediumInsights.length },
          { label: 'Categorias', value: data.categories.length },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3 rounded border border-border bg-panel/50">
            <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider">{stat.label}</p>
            <p className="font-mono text-lg text-cyan font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Insights list */}
      <div className="space-y-3">
        <h3 className="font-mono text-xs text-text-dim uppercase tracking-wider font-semibold">
          Hipoteses Biologicas Automatizadas
        </h3>
        <p className="font-mono text-[11px] text-text-dim">
          Clique em uma hipotese para expandir os dados de suporte.
        </p>
        <div className="space-y-3">
          {data.insights.map((insight, i) => (
            <InsightCard key={`${insight.category}-${i}`} insight={insight} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
