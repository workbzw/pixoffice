import { useEffect, useState } from 'react'
import type { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import { OfficeTeamHost } from '../application/OfficeTeamHost.ts'

export function useOfficeTeamHost(sessions: readonly OfficeTeamSession[]) {
  const [host] = useState(() => new OfficeTeamHost())
  const active = sessions.length > 0
  useEffect(() => { host.update(sessions) }, [host, sessions])
  useEffect(() => {
    if (!active) return
    let previous = performance.now()
    let frame: number
    const advance = () => {
      const current = performance.now()
      host.advance(current - previous)
      previous = current
    }
    const animate = () => { advance(); frame = requestAnimationFrame(animate) }
    frame = requestAnimationFrame(animate)
    const timer = setInterval(() => { if (document.hidden) advance() }, 50)
    return () => {
      cancelAnimationFrame(frame); clearInterval(timer)
      host.stop()
    }
  }, [host, active])
  useEffect(() => {
    const flushChats = () => { sessions.forEach(session => { void session.chat.flush() }) }
    const visibility = () => { if (document.hidden) flushChats() }
    window.addEventListener('pagehide', flushChats)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', flushChats); document.removeEventListener('visibilitychange', visibility) }
  }, [sessions])
}
