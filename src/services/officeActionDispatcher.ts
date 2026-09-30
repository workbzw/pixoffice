import {
  OFFICE_DISPATCH_MODE,
  type OfficeDispatchMode,
} from '@/config/officeMode'
import {
  requestDeskVisit,
  requestDeskVisitTour,
  isOfficeSceneReady,
} from '@/scene/officeSceneBridge'
import { normalizeOfficeAction } from '@/services/officeActionValidation'
import { getOfficeAgents } from '@/store/officeStore'
import type { Agent } from '@/types/agent'
import type {
  OfficeActionDeskVisit,
  OfficeActionDeskVisitTour,
} from '@/types/officeAction'

export type VisitActionMessage = OfficeActionDeskVisit | OfficeActionDeskVisitTour

const visitQueue: Array<{
  message: VisitActionMessage
  messageFn?: (hostRosterNo: number, hostName: string) => string
}> = []
let dispatchLocked = false
let wasMissionBusy = false
let skippedCount = 0
let invalidCount = 0
let completedCount = 0

function hasActiveVisitMission(agents: Agent[]): boolean {
  return agents.some((a) => a.mission?.kind === 'desk_visit')
}

function isDispatchBusy(agents: Agent[]): boolean {
  return dispatchLocked || hasActiveVisitMission(agents)
}

function normalizeVisitMessage(message: unknown): VisitActionMessage | null {
  const action = normalizeOfficeAction(message)
  return action?.type === 'desk_visit' || action?.type === 'desk_visit_tour' ? action : null
}

function executeVisit(
  message: VisitActionMessage,
  messageFn?: (hostRosterNo: number, hostName: string) => string,
) {
  dispatchLocked = true

  if (message.type === 'desk_visit') {
    requestDeskVisit(message.visitor, message.host, message.message)
    return
  }
  requestDeskVisitTour(
    message.visitor,
    message.hosts,
    messageFn ?? (message.message ? () => message.message! : undefined),
  )
}

function tryDrainQueue() {
  if (!isOfficeSceneReady()) return

  const agents = getOfficeAgents()
  if (isDispatchBusy(agents)) return

  while (visitQueue.length > 0) {
    const peek = visitQueue[0]!
    const normalized = normalizeVisitMessage(peek.message)
    if (!normalized) {
      visitQueue.shift()
      invalidCount += 1
      console.warn('[OfficeDispatch] invalid visit command, skipped', peek.message)
      continue
    }

    visitQueue.shift()
    console.info(
      '[OfficeDispatch] executing',
      normalized,
      `remaining=${visitQueue.length}`,
      `completed=${completedCount}`,
    )
    executeVisit(normalized, peek.messageFn)
    return
  }
}

export function submitVisitAction(
  message: VisitActionMessage,
  options?: {
    messageFn?: (hostRosterNo: number, hostName: string) => string
    queueIfBusy?: boolean
  },
) {
  const normalized = normalizeVisitMessage(message)
  if (!normalized) {
    invalidCount += 1
    console.warn(
      '[OfficeDispatch] invalid visit command, rejected (名册仅 1–6，且 visitor≠host)',
      message,
    )
    return
  }

  const mode = OFFICE_DISPATCH_MODE
  const agents = getOfficeAgents()
  const busy = isDispatchBusy(agents) || visitQueue.length > 0

  // 加载期只缓存，不抢占调度锁；手动互动始终排队。
  if (isOfficeSceneReady() && !options?.queueIfBusy && mode !== 'queue' && busy) {
    skippedCount += 1
    console.info(`[OfficeDispatch] ${mode}: dropped (busy)`, normalized, {
      skippedCount,
    })
    return
  }

  visitQueue.push({ message: normalized, messageFn: options?.messageFn })
  console.info('[OfficeDispatch] queue: enqueued', normalized, {
    depth: visitQueue.length,
    mode,
  })

  tryDrainQueue()
}

/** 场景每帧同步后调用，mission 结束时触发队列消费 */
export function notifyVisitMissionActivity(agents: Agent[]) {
  const busy = hasActiveVisitMission(agents)

  if (wasMissionBusy && !busy) {
    dispatchLocked = false
    completedCount += 1
    console.info(
      '[OfficeDispatch] mission completed',
      `completed=${completedCount}`,
      `pending=${visitQueue.length}`,
    )
  }

  dispatchLocked = busy
  wasMissionBusy = busy
  if (!busy) tryDrainQueue()
}

/** 是否有尚未执行的外部拜访命令（供场景自动工作流让路） */
export function hasPendingVisitQueue(): boolean {
  return visitQueue.length > 0
}

export function getDispatchStats(): {
  mode: OfficeDispatchMode
  queueDepth: number
  executing: boolean
  skippedCount: number
  invalidCount: number
  completedCount: number
} {
  const agents = getOfficeAgents()
  return {
    mode: OFFICE_DISPATCH_MODE,
    queueDepth: visitQueue.length,
    executing: isDispatchBusy(agents),
    skippedCount,
    invalidCount,
    completedCount,
  }
}

export function dispatchModeLabel(mode: OfficeDispatchMode): string {
  switch (mode) {
    case 'queue':
      return '队列（不丢）'
    case 'skip':
      return '省略（繁忙丢弃）'
    case 'hybrid':
      return '混合（繁忙丢/空闲串行）'
  }
}
