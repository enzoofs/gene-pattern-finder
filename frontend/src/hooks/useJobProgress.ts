import { useState, useEffect, useRef, useCallback } from 'react'
import { api, connectJobProgress } from '@/lib/api'
import type { JobStatus } from '@/lib/types'

type ConnectionStatus = 'websocket' | 'reconnecting' | 'polling'

interface JobProgressState {
  status: JobStatus
  progressPct: number
  progressMsg: string | null
  error: string | null
  isComplete: boolean
  connectionStatus: ConnectionStatus
}

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 2000

export function useJobProgress(jobId: string | null): JobProgressState {
  const [state, setState] = useState<JobProgressState>({
    status: 'queued',
    progressPct: 0,
    progressMsg: null,
    error: null,
    isComplete: false,
    connectionStatus: 'websocket',
  })

  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)

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
        connectionStatus: 'websocket',
      })
      return
    }

    let active = true

    const startPolling = () => {
      if (pollRef.current) return
      setState((prev) => ({ ...prev, connectionStatus: 'polling' }))
      pollRef.current = setInterval(async () => {
        if (!active) return
        try {
          const job = await api.getJobStatus(jobId)
          if (!active) return
          const done = job.status === 'done' || job.status === 'failed'
          setState((prev) => ({
            status: job.status,
            progressPct: job.progress_pct,
            progressMsg: job.progress_msg,
            error: job.error_msg,
            isComplete: done,
            connectionStatus: prev.connectionStatus,
          }))
          if (done) {
            cleanup()
          }
        } catch {
          // polling error — keep trying
        }
      }, 3000)
    }

    // Conecta WebSocket com reconexao automatica
    const connectWs = () => {
      try {
        const ws = connectJobProgress(jobId, (data) => {
          if (!active) return
          setState((prev) => {
            const pct = data.pct
            const msg = data.msg
            // Usar status real do backend se disponivel, senao inferir do pct
            let status: JobStatus = prev.status
            if (data.status) {
              status = data.status as JobStatus
            } else {
              if (pct >= 100) status = 'done'
              else if (pct >= 75) status = 'conservation'
              else if (pct >= 50) status = 'full_tree'
              else if (pct >= 30) status = 'preview_tree'
              else if (pct >= 10) status = 'aligning'
              else status = 'queued'
            }

            const isFailed = pct < 0 || status === 'failed'
            const done = status === 'done' || isFailed
            if (done) cleanup()

            return {
              status: isFailed ? 'failed' : status,
              progressPct: pct,
              progressMsg: msg,
              error: isFailed ? msg : null,
              isComplete: done,
              connectionStatus: 'websocket',
            }
          })
        })

        wsRef.current = ws

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setState((prev) => ({ ...prev, connectionStatus: 'websocket' }))
        }

        ws.onerror = () => {
          ws.close()
          wsRef.current = null
        }

        ws.onclose = () => {
          wsRef.current = null
          setState((prev) => {
            if (prev.isComplete) return prev

            // Tentar reconectar antes de cair pro polling
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttemptsRef.current++
              setState((p) => ({ ...p, connectionStatus: 'reconnecting' }))
              setTimeout(() => {
                if (active) connectWs()
              }, RECONNECT_DELAY_MS * reconnectAttemptsRef.current)
            } else {
              startPolling()
            }
            return prev
          })
        }
      } catch {
        startPolling()
      }
    }

    connectWs()

    return () => {
      active = false
      cleanup()
    }
  }, [jobId, cleanup])

  return state
}
