import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Check, AlertCircle, RotateCcw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScanLoader } from '@/components/ui/ScanLoader'
import type { JobStatus } from '@/lib/types'

interface JobProgressProps {
  status: JobStatus
  progressPct: number
  progressMsg: string | null
  error: string | null
  isComplete: boolean
  onRetry?: () => void
  sequenceCount?: number
  totalLength?: number
}

interface PipelineStep {
  key: JobStatus
  label: string
}

const PIPELINE_STEPS: PipelineStep[] = [
  { key: 'aligning', label: 'Alinhamento' },
  { key: 'preview_tree', label: 'Árvore Preview' },
  { key: 'full_tree', label: 'Árvore Final' },
  { key: 'conservation', label: 'Conservação' },
  { key: 'done', label: 'Concluído' },
]

const STATUS_ORDER: JobStatus[] = ['queued', 'aligning', 'preview_tree', 'full_tree', 'conservation', 'done']

function getStepState(stepKey: JobStatus, currentStatus: JobStatus): 'done' | 'active' | 'pending' {
  const stepIdx = STATUS_ORDER.indexOf(stepKey)
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  if (currentStatus === 'failed') {
    return stepIdx < currentIdx ? 'done' : stepIdx === currentIdx ? 'active' : 'pending'
  }
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'pending'
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}min ${s}s` : `${m}min`
}

function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] text-text-dim">
      <Clock className="w-3 h-3" />
      <span>Tempo decorrido: {formatTime(elapsed)}</span>
    </div>
  )
}

export function JobProgress({ status, progressPct, progressMsg, error, isComplete, onRetry, sequenceCount, totalLength }: JobProgressProps) {
  const isFailed = status === 'failed'

  // Estimate total time based on sequence count and total length
  const estimatedMinutes = sequenceCount && totalLength
    ? Math.max(2, Math.round((sequenceCount * totalLength) / 500_000))
    : null

  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8 w-full max-w-lg mx-auto">
      {/* Pipeline steps */}
      <div className="flex items-center gap-0 w-full">
        {PIPELINE_STEPS.map((step, i) => {
          const state = getStepState(step.key, status)
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                {/* Circle */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all',
                    state === 'done' && 'bg-green/20 border-green text-green',
                    state === 'active' && !isFailed && 'bg-cyan/20 border-cyan text-cyan glow-cyan',
                    state === 'active' && isFailed && 'bg-red/20 border-red text-red',
                    state === 'pending' && 'bg-transparent border-border text-text-dim',
                  )}
                >
                  {state === 'done' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : state === 'active' && isFailed ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                  ) : (
                    <span className="font-mono text-[10px] font-bold">{i + 1}</span>
                  )}
                </div>
                {/* Label */}
                <span
                  className={cn(
                    'font-mono text-[9px] font-semibold uppercase tracking-wider text-center whitespace-nowrap',
                    state === 'done' && 'text-green',
                    state === 'active' && !isFailed && 'text-cyan',
                    state === 'active' && isFailed && 'text-red',
                    state === 'pending' && 'text-text-dim',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-px mx-1 mt-[-18px]',
                    state === 'done' ? 'bg-green/40' : 'bg-border',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-text-muted">Progresso</span>
          <span className="font-mono text-xs text-cyan font-bold">{Math.round(progressPct)}%</span>
        </div>
        <div className="w-full h-2 bg-panel border border-border rounded-full overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              isFailed ? 'bg-red' : 'bg-cyan',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Time info */}
      {!isComplete && !isFailed && (
        <div className="w-full flex items-center justify-between">
          <ElapsedTimer />
          {estimatedMinutes && (
            <span className="font-mono text-[10px] text-text-dim">
              Estimativa: ~{estimatedMinutes}min
            </span>
          )}
        </div>
      )}

      {/* ScanLoader during active processing */}
      {!isComplete && !isFailed && (
        <div className="w-full">
          <ScanLoader message={progressMsg || 'Processando...'} />
        </div>
      )}

      {/* Error display with retry */}
      {isFailed && error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full px-4 py-3 rounded border border-red/30 bg-red/5"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red shrink-0 mt-0.5" />
            <p className="font-mono text-sm text-red">{error}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded border border-cyan/40 bg-cyan/10 text-cyan font-mono text-xs font-semibold hover:bg-cyan/20 transition-colors cursor-pointer mx-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              TENTAR NOVAMENTE
            </button>
          )}
        </motion.div>
      )}

      {/* Completion message */}
      {isComplete && !isFailed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full px-4 py-3 rounded border border-green/30 bg-green/5 text-center"
        >
          <p className="font-mono text-sm text-green font-semibold">
            Análise concluída com sucesso
          </p>
        </motion.div>
      )}
    </div>
  )
}
