import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { MotifsData, MotifEntry } from '@/lib/types'

interface MotifViewerProps {
  data: MotifsData
}

function SupportBar({ support }: { support: number }) {
  const pct = Math.round(support * 100)
  const color =
    support >= 0.8 ? 'bg-green' :
    support >= 0.6 ? 'bg-amber' :
    'bg-red'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-panel border border-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-text-muted">{pct}%</span>
    </div>
  )
}

function MotifSequence({ sequence }: { sequence: string }) {
  const baseColors: Record<string, string> = {
    A: 'text-green',
    T: 'text-red',
    U: 'text-red',
    G: 'text-amber',
    C: 'text-blue',
  }

  return (
    <span className="font-mono text-sm tracking-wider">
      {sequence.split('').map((base, i) => (
        <span key={i} className={cn('font-bold', baseColors[base] || 'text-text-muted')}>
          {base}
        </span>
      ))}
    </span>
  )
}

export function MotifViewer({ data }: MotifViewerProps) {
  const [selectedMotif, setSelectedMotif] = useState<MotifEntry | null>(null)

  if (!data.motifs.length) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="font-mono text-sm text-text-dim">
          Nenhum motif encontrado com os parametros atuais
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Motifs Encontrados', value: data.total_motifs },
          { label: 'Sequencias', value: data.n_sequences },
          { label: 'Comprimento Alinhamento', value: data.alignment_length },
          { label: 'Suporte Minimo', value: `${Math.round(data.parameters.min_support * 100)}%` },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3 rounded border border-border bg-panel/50">
            <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider">{stat.label}</p>
            <p className="font-mono text-lg text-cyan font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Motif table */}
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-panel border-b border-border">
              <th className="px-4 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider">Motif</th>
              <th className="px-4 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider">Tamanho</th>
              <th className="px-4 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider">Suporte</th>
              <th className="px-4 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider">P-value</th>
              <th className="px-4 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider">E-value</th>
              <th className="px-4 py-2 text-left font-mono text-[10px] text-text-dim uppercase tracking-wider">Ocorrencias</th>
            </tr>
          </thead>
          <tbody>
            {data.motifs.map((motif, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedMotif(selectedMotif === motif ? null : motif)}
                className={cn(
                  'border-b border-border/50 cursor-pointer transition-colors',
                  selectedMotif === motif
                    ? 'bg-cyan/10'
                    : 'hover:bg-panel/30',
                )}
              >
                <td className="px-4 py-2.5">
                  <MotifSequence sequence={motif.sequence} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                  {motif.length}bp
                </td>
                <td className="px-4 py-2.5">
                  <SupportBar support={motif.support} />
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-text-muted">
                  {motif.p_value != null ? motif.p_value.toExponential(2) : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-text-muted">
                  {motif.e_value != null ? motif.e_value.toExponential(2) : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                  {motif.n_occurrences}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected motif detail */}
      {selectedMotif && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-cyan/30 rounded bg-cyan/5 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs text-cyan font-semibold uppercase tracking-wider">
              Detalhes do Motif
            </h3>
            <button
              onClick={() => setSelectedMotif(null)}
              className="font-mono text-[10px] text-text-dim hover:text-text cursor-pointer"
            >
              FECHAR
            </button>
          </div>
          <div className="font-mono text-lg tracking-wider">
            <MotifSequence sequence={selectedMotif.sequence} />
          </div>
          {/* Information Content bar */}
          {selectedMotif.information_content && selectedMotif.information_content.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider">
                Information Content (bits/posicao):
              </p>
              <div className="flex items-end gap-px h-10">
                {selectedMotif.information_content.map((ic, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-cyan/70 rounded-t-sm"
                    style={{ height: `${Math.min(100, (ic / 2) * 100)}%` }}
                    title={`Pos ${i + 1}: ${ic.toFixed(2)} bits`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="font-mono text-[10px] text-text-dim uppercase tracking-wider">
              Posicoes por sequencia:
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {Object.entries(selectedMotif.positions).map(([seqId, positions]) => (
                <div key={seqId} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-muted truncate w-48">{seqId}</span>
                  <span className="font-mono text-[10px] text-cyan">
                    {(positions as number[]).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
