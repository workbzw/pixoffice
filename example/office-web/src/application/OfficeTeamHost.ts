import { advanceOfficeTeamSessions } from './OfficeTeamSession.ts'
import type { OfficeTeamSession } from './OfficeTeamSession.ts'
import type { DecisionRequest } from './decisions/DecisionSession.ts'
import { CommerceDemoRun } from './CommerceDemoRun.ts'
import { CommerceOfficeDataSource } from '../dashboard/CommerceOfficeDataSource.ts'

export class OfficeTeamHost {
  private sessions = new Set<OfficeTeamSession>()
  private demoSubscriptions = new Map<OfficeTeamSession, () => void>()
  private previewRun?: { owner: OfficeTeamSession; timers: Map<OfficeTeamSession, ReturnType<typeof setTimeout>> }
  private commerceRun?: CommerceDemoRun

  update(sessions: readonly OfficeTeamSession[]) {
    const next = new Set(sessions)
    for (const session of this.sessions) if (!next.has(session)) {
      if (this.commerceRun?.has(session)) this.stopCommerce()
      this.demoSubscriptions.get(session)?.(); this.demoSubscriptions.delete(session)
      this.cancelDecisionPreview(session)
      clearTimeout(this.previewRun?.timers.get(session)); this.previewRun?.timers.delete(session)
      if (this.previewRun && !this.previewRun.timers.size) this.previewRun = undefined
      session.stop()
    }
    for (const session of next) if (!this.sessions.has(session) || session.isStarted === false) void session.start()
    this.sessions = next
    for (const session of next) if ((session.decisionPreviewEnabled || session.source instanceof CommerceOfficeDataSource) && !this.demoSubscriptions.has(session)) {
      let running = session.simulation.isDemoRunning
      this.demoSubscriptions.set(session, session.simulation.subscribe(() => {
        const next = session.simulation.isDemoRunning
        if (next === running) return
        running = next
        if (session.source instanceof CommerceOfficeDataSource) {
          if (running) {
            this.cancelDecisionPreview(); this.stopCommerce()
            this.commerceRun = new CommerceDemoRun([...this.sessions], session)
            this.commerceRun.start()
          } else if (this.commerceRun?.owner === session) this.stopCommerce()
          return
        }
        if (running) this.scheduleDecisionPreview(session)
        else this.cancelDecisionPreview(session)
      }))
    }
  }

  private scheduleDecisionPreview(owner: OfficeTeamSession) {
    this.cancelDecisionPreview()
    const run = { owner, timers: new Map<OfficeTeamSession, ReturnType<typeof setTimeout>>() }
    this.previewRun = run
    for (const target of this.sessions) {
      if (!target.decisionPreviewEnabled) continue
      for (const request of target.decisions.getSnapshot().pending) target.decisions.dismiss(request.id)
      target.decisions.clearReceipt()
    }
    const background = [...this.sessions].find(target => target !== owner && target.decisionPreviewEnabled)
    const previews: { target: OfficeTeamSession; kind: DecisionRequest['kind']; delay: number }[] = [
      { target: owner, kind: 'confirmation', delay: 15000 },
      ...(background ? [{ target: background, kind: 'choice' as const, delay: 30000 }] : []),
    ]
    for (const { target, kind, delay } of previews) {
      run.timers.set(target, setTimeout(() => {
        run.timers.delete(target)
        if (this.previewRun === run && this.sessions.has(target) && target.isStarted && owner.isStarted && owner.simulation.isDemoRunning) {
          target.showDecisionPreview(kind)
        }
        if (this.previewRun === run && !run.timers.size) this.previewRun = undefined
      }, delay))
    }
  }

  private cancelDecisionPreview(owner?: OfficeTeamSession) {
    if (!this.previewRun || owner && this.previewRun.owner !== owner) return
    for (const timer of this.previewRun.timers.values()) clearTimeout(timer)
    this.previewRun = undefined
  }

  private stopCommerce() { const run = this.commerceRun; this.commerceRun = undefined; run?.stop() }
  advance(elapsedMs: number) { advanceOfficeTeamSessions(this.sessions, elapsedMs); this.commerceRun?.tick() }

  stop() {
    this.stopCommerce()
    this.cancelDecisionPreview()
    for (const unsubscribe of this.demoSubscriptions.values()) unsubscribe()
    this.demoSubscriptions.clear()
    for (const session of this.sessions) session.stop()
    this.sessions.clear()
  }
}
