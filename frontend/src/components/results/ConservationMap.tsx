import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ConservationData } from '@/lib/types'

interface ConservationMapProps {
  data: ConservationData
}

function identityToColor(identity: number): string {
  // red (low) → yellow (0.5) → cyan (high)
  if (identity <= 0.5) {
    const t = identity / 0.5
    const r = Math.round(239 * (1 - t) + 234 * t)
    const g = Math.round(68 * (1 - t) + 179 * t)
    const b = Math.round(68 * (1 - t) + 8 * t)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (identity - 0.5) / 0.5
    const r = Math.round(234 * (1 - t) + 6 * t)
    const g = Math.round(179 * (1 - t) + 182 * t)
    const b = Math.round(8 * (1 - t) + 212 * t)
    return `rgb(${r},${g},${b})`
  }
}

export function ConservationMap({ data }: ConservationMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = container.clientWidth
    const height = 60
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const positions = data.position_identity
    if (positions.length === 0) return

    const barWidth = width / positions.length
    const barMinWidth = Math.max(barWidth, 1)

    for (let i = 0; i < positions.length; i++) {
      const identity = positions[i]
      ctx.fillStyle = identityToColor(identity)
      ctx.fillRect(i * barWidth, 0, barMinWidth, height)
    }

    // Threshold line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    const thresholdY = height * (1 - data.threshold)
    ctx.beginPath()
    ctx.moveTo(0, thresholdY)
    ctx.lineTo(width, thresholdY)
    ctx.stroke()
    ctx.setLineDash([])
  }, [data])

  return (
    <div className="flex flex-col gap-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Posições Totais', value: data.total_positions.toLocaleString() },
          { label: 'Conservadas', value: data.total_conserved.toLocaleString() },
          { label: '% Conservação', value: `${data.conservation_pct.toFixed(1)}%` },
          { label: 'N Sequências', value: data.n_sequences.toString() },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-3 py-2.5 rounded border border-border bg-panel/60"
          >
            <span className="block font-mono text-[10px] text-text-dim uppercase tracking-wider">
              {stat.label}
            </span>
            <span className="block font-mono text-lg text-cyan font-bold mt-0.5">
              {stat.value}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Heatmap */}
      <div>
        <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
          Identidade por Posição
        </label>
        <div ref={containerRef} className="w-full rounded border border-border overflow-hidden bg-panel">
          <canvas ref={canvasRef} className="block" />
        </div>

        {/* Color legend */}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-mono text-[9px] text-text-dim">0%</span>
          <div
            className="flex-1 h-2.5 rounded"
            style={{
              background: `linear-gradient(to right, rgb(239,68,68), rgb(234,179,8), rgb(6,182,212))`,
            }}
          />
          <span className="font-mono text-[9px] text-text-dim">100%</span>
          <span className="font-mono text-[9px] text-text-dim ml-2">
            Limiar: {(data.threshold * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Conserved regions table */}
      {data.regions.length > 0 && (
        <div>
          <label className="block font-mono text-[10px] text-text-dim uppercase tracking-wider mb-2">
            Regiões Conservadas ({data.regions.length})
          </label>
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-panel/80 border-b border-border">
                  {['Início', 'Fim', 'Comprimento', 'Identidade'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.regions.map((region, idx) => (
                  <motion.tr
                    key={`${region.start}-${region.end}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className={cn(
                      'border-b border-border/50 last:border-b-0',
                      'hover:bg-panel-hover transition-colors',
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">
                      {region.start.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">
                      {region.end.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">
                      {region.length.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${region.avg_identity * 100}%`,
                              backgroundColor: identityToColor(region.avg_identity),
                            }}
                          />
                        </div>
                        <span className="font-mono text-xs text-cyan font-semibold">
                          {(region.avg_identity * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
