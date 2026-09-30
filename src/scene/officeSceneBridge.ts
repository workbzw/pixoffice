import type { OfficeScene } from '@/scene/OfficeScene'
import type { VisitActionMessage } from '@/services/officeActionDispatcher'
import type { AgentState } from '@/types/agent'

let scene: OfficeScene | null = null

type PendingSetState = {
  kind: 'set_state'
  agentId: string
  state: AgentState
  task?: string
}

const pendingActions: PendingSetState[] = []

function flushPendingActions() {
  if (!scene || pendingActions.length === 0) return

  const queue = pendingActions.splice(0)
  console.info('[OfficeHTTP] scene ready, flushing', queue.length, 'pending action(s)')
  for (const action of queue) {
    scene.setAgentState(action.agentId, action.state, action.task)
  }
}

export function bindOfficeScene(instance: OfficeScene | null) {
  scene = instance
  if (instance) flushPendingActions()
}

export function unbindOfficeScene(instance: OfficeScene) {
  if (scene === instance) scene = null
}

/** 名册序号从 1 开始，例如 1 号去找 5 号 */
export function requestDeskVisit(
  visitorRosterNo: number,
  hostRosterNo: number,
  message: string,
) {
  scene?.requestDeskVisit(visitorRosterNo, hostRosterNo, message)
}

/** 1 号依次拜访 2、3、4… 号，全部说完后回座 */
export function requestDeskVisitTour(
  visitorRosterNo: number,
  hostRosterNos: number[],
  messageFn?: (hostRosterNo: number, hostName: string) => string,
) {
  scene?.requestDeskVisitTour(visitorRosterNo, hostRosterNos, messageFn)
}

export function isOfficeSceneReady() {
  return scene != null
}

export function setAgentState(agentId: string, state: AgentState, task?: string) {
  if (!scene) {
    pendingActions.push({
      kind: 'set_state',
      agentId,
      state,
      task,
    })
    console.info('[OfficeHTTP] scene not ready, pending set_state', {
      agentId,
      state,
    })
    return
  }
  scene.setAgentState(agentId, state, task)
}

export type { VisitActionMessage }
