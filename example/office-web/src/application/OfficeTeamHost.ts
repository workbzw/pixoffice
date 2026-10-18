import { advanceOfficeTeamSessions } from './OfficeTeamSession.ts'
import type { OfficeTeamSession } from './OfficeTeamSession.ts'

export class OfficeTeamHost {
  private sessions = new Set<OfficeTeamSession>()

  update(sessions: readonly OfficeTeamSession[]) {
    const next = new Set(sessions)
    for (const session of this.sessions) if (!next.has(session)) session.stop()
    for (const session of next) if (!this.sessions.has(session) || session.isStarted === false) void session.start()
    this.sessions = next
  }

  advance(elapsedMs: number) { advanceOfficeTeamSessions(this.sessions, elapsedMs) }

  stop() {
    for (const session of this.sessions) session.stop()
    this.sessions.clear()
  }
}
