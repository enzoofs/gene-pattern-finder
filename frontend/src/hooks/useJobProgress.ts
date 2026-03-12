import { useState, useEffect, useRef, useCallback } from 'react'
import { api, connectJobProgress } from '@/lib/api'
import type { JobStatus } from '@/lib/types'

interface JobProgressState {
  status: JobStatus
  progressPct: number
  progressMsg: string | null
  error: string | null
  isComplete: boolean
}

export function useJobProgress(jobId: string | null): JobProgressState {
  const [state, setState] = useState<JobProgressState>({
    status: 'queued',
    progressPct: 0,
    progressMsg: null,
    error: null,
    isComplete: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!jobId) {
      setState({
        status: 'queued',
        progressPct: 0,
        progressMsg: null,
        error: null,
        isComplete: false,
      })
      return
    }

    let active = true

    const startPolling = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(async () => {
        if (!active) return
        try {
          const job = await api.getJobStatus(jobId)
          if (!active) return
          const done = job.status === 'done' || job.status === 'failed'
          setState({
            status: job.status,
            progressPct: job.progress_pct,
            progressMsg: job.progress_msg,
            error: job.error_msg,
            isComplete: done,
          })
          if (done) {
            cleanup()
          }
        } catch {
          // polling error — keep trying
        }
      }, 3000)
    }

    // Try WebSocket first
    try {
      const ws = connectJobProgress(jobId, (data) => {
        if (!active) return
        setState((prev) => {
          const pct = data.pct
          const msg = data.msg
          // Infer status from pct thresholds
          let status: JobStatus = prev.status
          if (pct >= 100) status = 'done'
          else if (pct >= 75) status = 'conservation'
          else if (pct >= 50) status = 'full_tree'
          else if (pct >= 30) status = 'preview_tree'
          else if (pct >= 10) status = 'aligning'
          else status = 'queued'

          const done = status === 'done'
          if (done) cleanup()

          return {
            status,
            progressPct: pct,
            progressMsg: msg,
            error: null,
            isComplete: done,
          }
        })
      })

      wsRef.current = ws

      ws.onerror = () => {
        ws.close()
        wsRef.current = null
        startPolling()
      }

      ws.onclose = () => {
        wsRef.current = null
        // If not complete, fall back to polling
        setState((prev) => {
          if (!prev.isComplete) startPolling()
          return prev
        })
      }
    } catch {
      startPolling()
    }

    return () => {
      active = false
      cleanup()
    }
  }, [jobId, cleanup])

  return state
}
