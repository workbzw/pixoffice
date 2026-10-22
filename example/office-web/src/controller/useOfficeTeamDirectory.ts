import { useMemo, useSyncExternalStore } from 'react'
import type { OfficeTeamSession } from '../application/OfficeTeamSession.ts'
import type { OfficeTeamOption } from '../ui/TeamSwitcher.tsx'

const readAppearances = (session: OfficeTeamSession) => Object.fromEntries(session.runtime.readActors().map(actor => [actor.id, actor.templateId]))
const sameAppearances = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(id => a[id] === b[id])

export function createTeamDirectoryStore(sessions: readonly OfficeTeamSession[]) {
  let states = sessions.map(session => session.getSnapshot())
  let decisions = sessions.map(session => session.decisions?.getSnapshot())
  let appearances = sessions.map(readAppearances)
  let cached = states.map((state, index) => ({ ...state, decisions: decisions[index], appearances: appearances[index] }))
  return {
    subscribe: (listener: () => void) => {
      const cleanup = sessions.flatMap((session, index) => [session.subscribe(listener), session.decisions?.subscribe(listener), session.runtime.subscribe(() => {
        if (!sameAppearances(appearances[index], readAppearances(session))) listener()
      })].filter(Boolean))
      return () => cleanup.forEach(unsubscribe => unsubscribe?.())
    },
    getSnapshot: () => {
      const next = sessions.map(session => session.getSnapshot())
      const nextDecisions = sessions.map(session => session.decisions?.getSnapshot())
      const nextAppearances = sessions.map(readAppearances)
      const changed = (index: number) => next[index] !== states[index] || nextDecisions[index] !== decisions[index] || !sameAppearances(nextAppearances[index], appearances[index])
      if (next.some((_, index) => changed(index))) {
        cached = next.map((state, index) => !changed(index)
          ? cached[index] : { ...state, decisions: nextDecisions[index], appearances: nextAppearances[index] })
        states = next; decisions = nextDecisions; appearances = nextAppearances
      }
      return cached
    },
  }
}

export function useOfficeTeamDirectory(teams: readonly OfficeTeamOption[], sessions: readonly OfficeTeamSession[]) {
  const store = useMemo(() => createTeamDirectoryStore(sessions), [sessions])
  const states = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return useMemo(() => teams.map(team => {
    const state = states[sessions.findIndex(session => session.runtime.sceneId === team.id)]
    const decisionCount = state?.decisions?.pending.length ?? 0
    const pendingDecision = state?.decisions?.pending[0]
    const decisionState = { decisionCount, pendingDecision, decisionSubmittingId: state?.decisions?.submittingIds?.find(id => id === pendingDecision?.id),
      decisionError: state?.decisions?.errorDecisionId === pendingDecision?.id ? state?.decisions?.error ?? '' : '' }
    const dashboard = state?.dashboard
    if (!dashboard) return { ...team, ...decisionState }
    return { ...team, ...decisionState, name: dashboard.workspace.name, memberCount: dashboard.employees.length,
      workingCount: new Set(dashboard.tasks.filter(task => task.status === 'running' && task.assigneeId).map(task => task.assigneeId)).size,
      pendingCount: dashboard.tasks.filter(task => ['queued', 'blocked', 'failed'].includes(task.status)).length,
      avatarIds: dashboard.employees.flatMap(employee => employee.sceneActorId && state.appearances[employee.sceneActorId] ? [state.appearances[employee.sceneActorId]] : []).slice(0, 4),
    }
  }), [teams, sessions, states])
}
