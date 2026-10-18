import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { canonical } from '@pixoffice/protocol'
import type { DashboardSnapshot } from '@pixoffice/protocol/dashboard'
import { officeActorPrimaryTasks } from './actorTasks.ts'
import { dashboardWhiteboardTaskBoard } from './whiteboard.ts'
import { whiteboardTaskBoardSchema } from '@pixoffice/protocol/office-ui'

type Presentation = { status: 'idle' | 'working' | 'thinking'; title: string }
const summarySource = 'pixoffice.demo-summary'
const eventCacheLimit = 1024

/** Business task state selects a scene presentation; scene motion never completes a business task. */
export class DashboardSceneBridge {
  private readonly runtime: SceneRuntime
  private seenEvents = new Set<string>()
  private initialized = false
  private readonly whiteboardMode: 'external' | 'demo-summary'

  constructor(runtime: SceneRuntime, options: { whiteboard?: 'external' | 'demo-summary' } = {}) {
    this.runtime = runtime; this.whiteboardMode = options.whiteboard ?? 'external'
  }

  sync(data: DashboardSnapshot, options: { replayEvents?: boolean } = {}): string[] {
    const errors: string[] = []
    const board = this.runtime.readWorld().props.find(prop => prop.templateId === 'office.wall-whiteboard')
    if (board && data.whiteboard !== undefined) {
      const state = data.whiteboard.title ? { title: '', taskBoard: whiteboardTaskBoardSchema.parse(data.whiteboard) } : { title: '', tasks: [] }
      if (canonical(state) !== canonical(board.state)) {
        const result = this.runtime.submit({ protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: `board-${globalThis.crypto.randomUUID()}`,
          type: 'object.state.set', entityId: board.id, expectedStateRevision: board.stateRevision, state })
        if (result.error) errors.push(`协作白板：${result.error.message}`)
      }
    }
    if (board && data.whiteboard === undefined && this.whiteboardMode === 'demo-summary' && (board.stateRevision === 0 || board.stateSource === summarySource)) {
      const tasks = data.tasks.slice(0, 12).map(({ title, status, progress }) => ({ title, status, ...(progress === undefined ? {} : { progress }) }))
      const state = { title: data.workspace.name, tasks, taskBoard: whiteboardTaskBoardSchema.parse(dashboardWhiteboardTaskBoard(data)) }
      const same = canonical(state) === canonical(board.state)
      if (!same || board.stateSource !== summarySource) {
        const result = this.runtime.submit({ protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: `board-${globalThis.crypto.randomUUID()}`,
          type: 'object.state.set', entityId: board.id, expectedStateRevision: board.stateRevision, state }, { stateSource: summarySource })
        if (result.error) errors.push(`协作白板：${result.error.message}`)
      }
    }
    const actors = new Map(this.runtime.readActors().map(actor => [actor.id, actor]))
    const tasks = officeActorPrimaryTasks(data)
    for (const actor of actors.values()) {
      const task = tasks.get(actor.id)
      const next: Presentation = task && (task.status === 'running' || task.status === 'blocked') ? {
        status: task.status === 'running' ? 'working' : 'thinking', title: task.title,
      } : { status: 'idle', title: '' }
      if (actor.presentation.status === next.status && actor.presentation.title === next.title) continue
      const result = this.runtime.submit({
        protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: `dashboard-${globalThis.crypto.randomUUID()}`,
        type: 'actor.presentation.set', actorId: actor.id, status: next.status, title: next.title,
        sourceRevision: actor.presentation.sourceRevision + 1,
      })
      if (result.error) errors.push(`${actor.name}：${result.error.message}`)
    }

    for (const event of [...data.events].reverse()) {
      if (event.kind !== 'task.assigned') continue
      const seen = this.seenEvents.delete(event.id)
      this.seenEvents.add(event.id)
      if (this.seenEvents.size > eventCacheLimit) this.seenEvents.delete(this.seenEvents.values().next().value!)
      if (seen || !this.initialized || options.replayEvents === false || !event.employeeId || !event.fromEmployeeId) continue
      const visitor = data.employees.find(item => item.id === event.fromEmployeeId)?.sceneActorId
      const host = data.employees.find(item => item.id === event.employeeId)?.sceneActorId
      if (!visitor || !host || visitor === host || !actors.has(visitor) || !actors.has(host)) continue
      const task = data.tasks.find(item => item.id === event.taskId)
      if (!task || task.assigneeId !== event.employeeId || task.status === 'completed' || task.status === 'failed') continue
      const result = this.runtime.submit({
        protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: `dashboard-${globalThis.crypto.randomUUID()}`,
        type: 'activity.start', capability: 'office.visit',
        participants: [{ entityId: visitor, role: 'visitor' }, { entityId: host, role: 'host' }],
        params: { stops: [{ hostId: host, message: task ? `请接手${task.title}。` : event.summary }] },
      })
      if (result.error) errors.push(`任务交接：${result.error.message}`)
    }
    this.initialized = true
    return errors
  }
}
