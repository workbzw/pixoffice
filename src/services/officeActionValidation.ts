import type { AgentState } from '@/types/agent'
import type { OfficeActionMessage } from '@/types/officeAction'

const STATES: AgentState[] = ['idle', 'walking', 'working', 'talking', 'thinking']

function isRosterNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
}

export function normalizeOfficeAction(value: unknown): OfficeActionMessage | null {
  if (!value || typeof value !== 'object') return null
  const action = value as Record<string, unknown>

  if (action.type === 'desk_visit') {
    if (
      !isRosterNumber(action.visitor) || !isRosterNumber(action.host) ||
      action.visitor === action.host || typeof action.message !== 'string'
    ) return null
    return { type: action.type, visitor: action.visitor, host: action.host, message: action.message }
  }

  if (action.type === 'desk_visit_tour') {
    if (
      !isRosterNumber(action.visitor) || !Array.isArray(action.hosts) ||
      (action.message !== undefined && typeof action.message !== 'string')
    ) return null
    const hosts = action.hosts.filter(
      (host): host is number => isRosterNumber(host) && host !== action.visitor,
    )
    if (hosts.length === 0) return null
    return { type: action.type, visitor: action.visitor, hosts, message: action.message }
  }

  if (action.type === 'set_state') {
    if (
      !STATES.includes(action.state as AgentState) ||
      (action.task !== undefined && typeof action.task !== 'string') ||
      (action.agentId !== undefined && (typeof action.agentId !== 'string' || !action.agentId.trim())) ||
      (action.rosterNo !== undefined && !isRosterNumber(action.rosterNo)) ||
      (action.agentId === undefined && action.rosterNo === undefined)
    ) return null
    return {
      type: action.type,
      state: action.state as AgentState,
      task: action.task,
      agentId: action.agentId,
      rosterNo: action.rosterNo,
    }
  }

  return null
}
