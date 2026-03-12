import { useState, useEffect } from 'react'

export function useElapsedTime(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isActive) { setElapsed(0); return }
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [isActive])
  return elapsed
}
