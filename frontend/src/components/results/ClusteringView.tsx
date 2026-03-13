import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ClusteringData } from '@/lib/types'

interface ClusteringViewProps {
  data: ClusteringData
}

const CLUSTER_COLORS = [
  '#06b6d4', // cyan
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

function distanceToColor(distance: number): string {
  // 0 (identical) → cyan, 1 (max distance) → dark
  const t = Math.min(1, distance)
  const r = Math.round(6 * (1 - t) + 20 * t)
  const g = Math.round(182 * (1 - t) + 20 * t)
  const b = Math.round(212 * (1 - t) + 40 * t)
  return `rgb(${r},${g},${b})`
}

function HeatmapCanvas({ data }: { data: ClusteringData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const n = data.distance_matrix.length
    const labelWidth = 140
    const cellSize = Math.min(30, Math.floor((container.clientWidth - labelWidth) / n))
    const totalSize = cellSize * n
    const width = totalSize + labelWidth
    const height = totalSize + 20 // top margin for labels

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Draw labels on left
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < n; i++) {
      const label = data.sequence_labels[i]
      const cluster = data.labels[label]
      const color = CLUSTER_COLORS[(cluster - 1) % CLUSTER_COLORS.length]
      ctx.fillStyle = color
      const shortLabel = label.length > 18 ? label.slice(0, 18) + '...' : label
      ctx.fillText(shortLabel, labelWidth - 8, 20 + i * cellSize + cellSize / 2)
    }

    // Draw heatmap cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dist = data.distance_matrix[i][j]
        ctx.fillStyle = distanceToColor(dist)
        ctx.fillRect(labelWidth + j * cellSize, 20 + i * cellSize, cellSize - 1, cellSize - 1)
      }
    }
  }, [data])

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <canvas ref={canvasRef} />
    </div>
  )
}

export function ClusteringView({ data }: ClusteringViewProps) {
  // Group sequences by cluster
  const clusterGroups: Record<number, string[]> = {}
  for (const [seqId, cluster] of Object.entries(data.labels)) {
    if (!clusterGroups[cluster]) clusterGroups[cluster] = []
    clusterGroups[cluster].push(seqId)
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {[
          { label: 'Clusters', value: data.n_clusters },
          { label: 'Sequencias', value: data.n_sequences },
          { label: 'Silhouette Score', value: data.silhouette_score.toFixed(3) },
          { label: 'Cophenetic r', value: data.cophenetic_r != null ? data.cophenetic_r.toFixed(3) : '—' },
          { label: 'Bootstrap Stability', value: data.avg_bootstrap_stability != null ? `${(data.avg_bootstrap_stability * 100).toFixed(0)}%` : '—' },
          { label: 'Metodo', value: data.method.toUpperCase() },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3 rounded border border-border bg-panel/50">
            <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider">{stat.label}</p>
            <p className="font-mono text-lg text-cyan font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Cluster assignments */}
      <div className="space-y-3">
        <h3 className="font-mono text-xs text-text-dim uppercase tracking-wider font-semibold">
          Agrupamentos
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(clusterGroups)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([cluster, members]) => {
              const color = CLUSTER_COLORS[(Number(cluster) - 1) % CLUSTER_COLORS.length]
              return (
                <motion.div
                  key={cluster}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Number(cluster) * 0.1 }}
                  className="border border-border rounded p-3 bg-panel/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-xs font-semibold" style={{ color }}>
                      Cluster {cluster}
                    </span>
                    <span className="font-mono text-[10px] text-text-dim">
                      ({members.length} seq{members.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {members.map((seqId) => {
                      const stability = data.bootstrap_stability?.[seqId]
                      return (
                        <div key={seqId} className="flex items-center gap-2">
                          <p className="font-mono text-[11px] text-text-muted truncate flex-1">
                            {seqId}
                          </p>
                          {stability != null && (
                            <span
                              className={cn(
                                'font-mono text-[9px] font-semibold shrink-0',
                                stability >= 0.8 ? 'text-green' :
                                stability >= 0.5 ? 'text-amber' : 'text-red'
                              )}
                            >
                              {(stability * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
        </div>
      </div>

      {/* Distance matrix heatmap */}
      <div className="space-y-3">
        <h3 className="font-mono text-xs text-text-dim uppercase tracking-wider font-semibold">
          Matriz de Distancia
        </h3>
        <div className="border border-border rounded p-4 bg-panel/30">
          <HeatmapCanvas data={data} />
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: distanceToColor(0) }} />
              <span className="font-mono text-[9px] text-text-dim">Identico (0)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: distanceToColor(0.5) }} />
              <span className="font-mono text-[9px] text-text-dim">0.5</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: distanceToColor(1) }} />
              <span className="font-mono text-[9px] text-text-dim">Divergente (1)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
