import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardAction, DashboardSnapshot, OfficeDataSource } from './contract.ts'

export function useOfficeDashboard(source: OfficeDataSource) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++request.current
    try {
      const next = await source.getSnapshot()
      if (current === request.current) { setSnapshot(next); setError(null) }
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : '页面数据不可用')
    }
  }, [source])

  useEffect(() => {
    void refresh()
    const unsubscribe = source.subscribe(() => { void refresh() })
    const requestCounter = request
    return () => { requestCounter.current++; unsubscribe() }
  }, [refresh, source])

  const execute = useCallback(async (action: DashboardAction) => {
    await source.execute(action)
    await refresh()
  }, [refresh, source])

  return { snapshot, error, refresh, execute }
}
