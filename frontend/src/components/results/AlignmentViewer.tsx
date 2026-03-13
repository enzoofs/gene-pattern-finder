import { useMemo, useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ConservationData } from '@/lib/types'

// --- Parser de FASTA alinhado ---

interface AlignedSequence {
  name: string
  sequence: string
}

function parseAlignedFasta(fasta: string): AlignedSequence[] {
  const result: AlignedSequence[] = []
  let currentName = ''
  let currentSeq = ''

  for (const line of fasta.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('>')) {
      if (currentName) {
        result.push({ name: currentName, sequence: currentSeq })
      }
      // Pega so o nome da especie (primeira parte antes de descricao longa)
      currentName = trimmed.slice(1).split(/\s+/).slice(0, 2).join(' ')
      currentSeq = ''
    } else if (trimmed) {
      currentSeq += trimmed
    }
  }
  if (currentName) {
    result.push({ name: currentName, sequence: currentSeq })
  }

  return result
}

// --- Cores das bases ---

const BASE_COLORS: Record<string, string> = {
  A: '#22c55e', // verde
  C: '#3b82f6', // azul
  G: '#eab308', // amarelo
  T: '#ef4444', // vermelho
  U: '#ef4444', // vermelho (RNA)
  '-': '#6b7280', // cinza (gap)
}

// --- Linha de consenso ---

function buildConsensus(sequences: AlignedSequence[]): string {
  if (sequences.length === 0) return ''
  const len = sequences[0].sequence.length
  let consensus = ''

  for (let i = 0; i < len; i++) {
    const bases = sequences.map((s) => s.sequence[i]?.toUpperCase() ?? '-')
    const counts: Record<string, number> = {}
    for (const b of bases) {
      counts[b] = (counts[b] || 0) + 1
    }
    const maxCount = Math.max(...Object.values(counts))

    if (maxCount === bases.length && bases[0] !== '-') {
      consensus += '*' // todas iguais
    } else if (maxCount >= bases.length * 0.5) {
      consensus += '.' // maioria igual
    } else {
      consensus += ' ' // divergente
    }
  }

  return consensus
}

// --- Cor de conservacao (gradiente vermelho -> amarelo -> ciano) ---

function conservationColor(val: number): [number, number, number] {
  if (val < 0.5) {
    const t = val * 2
    return [
      Math.round(239 + t * (234 - 239)),
      Math.round(68 + t * (179 - 68)),
      Math.round(68 + t * (8 - 68)),
    ]
  }
  const t = (val - 0.5) * 2
  return [
    Math.round(234 + t * (6 - 234)),
    Math.round(179 + t * (182 - 179)),
    Math.round(8 + t * (212 - 8)),
  ]
}

// --- Componente principal ---

const CELL_W = 12 // largura de cada celula em px
const CELL_H = 20 // altura de cada linha
const LABEL_W = 160 // largura da coluna de labels
const RULER_H = 20 // altura da regua de posicoes
const CONSERVATION_BAR_H = 14 // altura da faixa de conservacao

interface AlignmentViewerProps {
  alignment: string
  conservation?: ConservationData | null
}

export function AlignmentViewer({ alignment, conservation }: AlignmentViewerProps) {
  const sequences = useMemo(() => parseAlignedFasta(alignment), [alignment])
  const consensus = useMemo(() => buildConsensus(sequences), [sequences])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)

  const seqLen = sequences[0]?.sequence.length ?? 0
  const hasConservation = !!conservation?.position_identity?.length
  // Total de linhas: faixa de conservacao + sequencias + 1 (consenso)
  const totalRows = sequences.length + 1
  const canvasWidth = seqLen * CELL_W
  const topOffset = RULER_H + (hasConservation ? CONSERVATION_BAR_H : 0)
  const canvasHeight = topOffset + totalRows * CELL_H

  // Renderiza no canvas pra performance
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || sequences.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`

    ctx.fillStyle = '#0A0E17'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // Regua de posicoes
    ctx.font = '9px IBM Plex Mono, monospace'
    ctx.fillStyle = '#6b7280'
    for (let i = 0; i < seqLen; i += 10) {
      const x = i * CELL_W
      ctx.fillText(String(i + 1), x + 1, RULER_H - 4)
      ctx.fillStyle = '#374151'
      ctx.fillRect(x, RULER_H - 2, 1, 2)
      ctx.fillStyle = '#6b7280'
    }

    // Faixa de conservacao (se disponivel)
    if (hasConservation) {
      const identities = conservation!.position_identity
      const barY = RULER_H

      // Fundo da faixa
      ctx.fillStyle = '#1E293B'
      ctx.fillRect(0, barY, canvasWidth, CONSERVATION_BAR_H)

      for (let i = 0; i < Math.min(seqLen, identities.length); i++) {
        const val = identities[i]
        const x = i * CELL_W
        const [r, g, b] = conservationColor(val)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(x, barY, CELL_W, CONSERVATION_BAR_H)
      }

      // Linha de threshold
      ctx.strokeStyle = '#ffffff40'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(0, barY + CONSERVATION_BAR_H - 1)
      ctx.lineTo(canvasWidth, barY + CONSERVATION_BAR_H - 1)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Sequencias
    ctx.font = 'bold 11px IBM Plex Mono, monospace'
    for (let row = 0; row < sequences.length; row++) {
      const y = topOffset + row * CELL_H
      const seq = sequences[row].sequence

      for (let col = 0; col < seq.length; col++) {
        const base = seq[col].toUpperCase()
        const x = col * CELL_W

        // Fundo: verificar se todas as sequencias sao iguais nessa posicao
        const allSame = sequences.every(
          (s) => s.sequence[col]?.toUpperCase() === base
        )
        const consensusChar = consensus[col]

        if (base === '-') {
          // gap — fundo cinza sutil
          ctx.fillStyle = '#1a1a2e'
        } else if (allSame) {
          // todas iguais — fundo verde suave
          ctx.fillStyle = '#064e3b40'
        } else if (consensusChar === ' ') {
          // divergente — fundo vermelho suave
          ctx.fillStyle = '#7f1d1d30'
        } else {
          // parcialmente conservado
          ctx.fillStyle = '#0A0E17'
        }
        ctx.fillRect(x, y, CELL_W, CELL_H)

        // Letra
        ctx.fillStyle = BASE_COLORS[base] ?? '#9ca3af'
        ctx.fillText(base, x + 2, y + 14)
      }
    }

    // Linha de consenso
    const consY = topOffset + sequences.length * CELL_H
    ctx.font = 'bold 11px IBM Plex Mono, monospace'
    for (let col = 0; col < consensus.length; col++) {
      const x = col * CELL_W
      const ch = consensus[col]

      if (ch === '*') {
        ctx.fillStyle = '#064e3b40'
        ctx.fillRect(x, consY, CELL_W, CELL_H)
        ctx.fillStyle = '#22c55e'
      } else if (ch === '.') {
        ctx.fillStyle = '#0A0E17'
        ctx.fillRect(x, consY, CELL_W, CELL_H)
        ctx.fillStyle = '#eab308'
      } else {
        ctx.fillStyle = '#0A0E17'
        ctx.fillRect(x, consY, CELL_W, CELL_H)
        ctx.fillStyle = '#6b7280'
      }
      ctx.fillText(ch, x + 2, consY + 14)
    }
  }, [sequences, consensus, seqLen, canvasWidth, canvasHeight, conservation, hasConservation, topOffset])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft)
  }

  if (sequences.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="font-mono text-sm text-text-dim">
          Dados de alinhamento nao disponiveis
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header com stats */}
      <div className="flex items-center gap-4 font-mono text-[10px] text-text-dim uppercase tracking-wider">
        <span>{sequences.length} sequencias</span>
        <span>{seqLen.toLocaleString()} posicoes</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: '#22c55e' }} /> A
          <span className="w-2 h-2 rounded-sm" style={{ background: '#3b82f6' }} /> C
          <span className="w-2 h-2 rounded-sm" style={{ background: '#eab308' }} /> G
          <span className="w-2 h-2 rounded-sm" style={{ background: '#ef4444' }} /> T
          <span className="w-2 h-2 rounded-sm" style={{ background: '#6b7280' }} /> gap
        </span>
      </div>

      {/* Viewer com labels fixos + canvas com scroll */}
      <div className="flex border border-border rounded overflow-hidden bg-deep-bg">
        {/* Labels fixos na esquerda */}
        <div
          className="shrink-0 border-r border-border bg-panel/40"
          style={{ width: LABEL_W }}
        >
          {/* Espaco da regua */}
          <div
            className="border-b border-border/50 font-mono text-[9px] text-text-dim px-2 flex items-end"
            style={{ height: RULER_H }}
          >
            Posicao
          </div>
          {/* Faixa de conservacao label */}
          {hasConservation && (
            <div
              className="px-2 font-mono text-[9px] text-cyan flex items-center border-b border-border/50"
              style={{ height: CONSERVATION_BAR_H }}
            >
              Conservacao
            </div>
          )}
          {/* Nomes das especies */}
          {sequences.map((seq, i) => (
            <div
              key={i}
              className={cn(
                'px-2 font-mono text-[11px] text-text truncate flex items-center',
                i % 2 === 0 ? 'bg-transparent' : 'bg-panel/20',
              )}
              style={{ height: CELL_H }}
              title={seq.name}
            >
              {seq.name}
            </div>
          ))}
          {/* Label do consenso */}
          <div
            className="px-2 font-mono text-[11px] text-cyan font-semibold flex items-center border-t border-border/50"
            style={{ height: CELL_H }}
          >
            Consenso
          </div>
        </div>

        {/* Canvas com scroll horizontal */}
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={handleScroll}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block' }}
          />
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 font-mono text-[10px] text-text-dim flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm border border-green/30" style={{ background: '#064e3b40' }} />
          Conservado (todas iguais)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm border border-red/30" style={{ background: '#7f1d1d30' }} />
          Divergente
        </span>
        {hasConservation && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 rounded-sm" style={{ background: 'linear-gradient(to right, #ef4444, #eab308, #06b6d4)' }} />
            Faixa de conservacao (vermelho = baixa, ciano = alta)
          </span>
        )}
        <span className="flex items-center gap-1">
          * = identico &middot; . = maioria &middot; (espaco) = variavel
        </span>
      </div>
    </div>
  )
}
