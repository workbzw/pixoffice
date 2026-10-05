import type { Agent } from '@pixoffice/scene-office/types'
import { INITIAL_AGENTS } from '../scene/layout/officeLayout.ts'

let agents: Agent[] = INITIAL_AGENTS.map((a) => ({ ...a }))

export function getOfficeAgents(): Agent[] {
  return agents
}

export function setOfficeAgents(nextAgents: Agent[]) {
  agents = nextAgents
}
