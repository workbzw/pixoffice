import type { CSSProperties } from 'react'
import type { OfficeCreationInput } from '../../dashboard/officeDirectory.ts'
import type { DecisionRequest } from '../../application/decisions/DecisionSession.ts'

const accents = ['#52866b', '#607daf', '#ae7953', '#8c739c', '#53858c', '#a36c77']
export function teamAccent(index: number): CSSProperties { return { '--team-accent': accents[index % accents.length] } as CSSProperties }

export type OfficeTeamOption = {
  id: string
  name: string
  sceneLabel: string
  description?: string
  previewUrl?: string
  memberCount?: number
  workingCount?: number
  pendingCount?: number
  decisionCount?: number
  pendingDecision?: Pick<DecisionRequest, 'id' | 'title' | 'createdAt' | 'expiresAt' | 'deadline'>
  avatarIds?: readonly string[]
}
export type OfficeTeamSelection = {
  teams: readonly OfficeTeamOption[]
  activeId: string
  select: (id: string) => void
  openDecisions?: (id: string) => void
  create?: (input: OfficeCreationInput) => Promise<void>
}

export function pendingDecisionTeams(selection?: OfficeTeamSelection) {
  return selection?.teams.filter(team => team.id !== selection.activeId && (team.decisionCount ?? 0) > 0) ?? []
}

export function decisionNoticeKey(team: OfficeTeamOption) {
  const request = team.pendingDecision
  return `${team.id}:${request?.id ?? 'pending'}:${request?.createdAt ?? ''}:${request?.deadline ?? request?.expiresAt ?? ''}`
}

export function filterTeams(teams: readonly OfficeTeamOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  return teams.filter(team => `${team.name} ${team.sceneLabel} ${team.description ?? ''}`.toLocaleLowerCase().includes(normalized))
}
