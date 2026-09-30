import type { AgentState } from '@/types/agent'

export type OfficeActionDeskVisit = {
  type: 'desk_visit'
  visitor: number
  host: number
  message: string
}

export type OfficeActionDeskVisitTour = {
  type: 'desk_visit_tour'
  visitor: number
  hosts: number[]
  message?: string
}

export type OfficeActionSetState = {
  type: 'set_state'
  state: AgentState
  task?: string
  /** 名册序号，从 1 开始 */
  rosterNo?: number
  agentId?: string
}

export type OfficeActionMessage =
  | OfficeActionDeskVisit
  | OfficeActionDeskVisitTour
  | OfficeActionSetState
