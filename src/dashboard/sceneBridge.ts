import type { OfficeRuntime } from '@/runtime/OfficeRuntime'
import type { DashboardSnapshot, DashboardTask } from './contract'

type Presentation = { status: 'idle' | 'working' | 'thinking'; title: string }
const priority = (task: DashboardTask) => task.status === 'running' ? 2 : task.status === 'blocked' ? 1 : 0

/** Business task state selects a scene presentation; scene motion never completes a business task. */
export class DashboardSceneBridge {
  private readonly runtime: OfficeRuntime
  private presentations = new Map<string, Presentation>()
  private seenEvents = new Set<string>()
  private initialized = false

  constructor(runtime: OfficeRuntime) { this.runtime = runtime }

  sync(data: DashboardSnapshot): string[] {
    const errors: string[] = []
    const actors = new Map(this.runtime.readActors().map(actor => [actor.id, actor]))
    for (const employee of data.employees) {
      const actor = employee.sceneActorId && actors.get(employee.sceneActorId)
      if (!actor) continue
      const task = data.tasks.filter(item => item.assigneeId === employee.id).sort((a, b) => priority(b) - priority(a))[0]
      const next: Presentation = task && priority(task) ? {
        status: task.status === 'running' ? 'working' : 'thinking', title: task.title,
      } : { status: 'idle', title: '' }
      const previous = this.presentations.get(actor.id)
      if ((!previous && next.status === 'idle') || (previous?.status === next.status && previous.title === next.title)) continue
      const result = this.runtime.submit({
        protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: `dashboard-${globalThis.crypto.randomUUID()}`,
        type: 'actor.presentation.set', actorId: actor.id, status: next.status, title: next.title,
        sourceRevision: actor.presentation.sourceRevision + 1,
      })
      if (result.error) errors.push(`${employee.name}：${result.error.message}`)
      else this.presentations.set(actor.id, next)
    }

    for (const event of [...data.events].reverse()) {
      if (this.seenEvents.has(event.id)) continue
      this.seenEvents.add(event.id)
      if (!this.initialized || event.kind !== 'task.assigned' || !event.employeeId || !event.fromEmployeeId) continue
      const visitor = data.employees.find(item => item.id === event.fromEmployeeId)?.sceneActorId
      const host = data.employees.find(item => item.id === event.employeeId)?.sceneActorId
      if (!visitor || !host || visitor === host || !actors.has(visitor) || !actors.has(host)) continue
      const task = data.tasks.find(item => item.id === event.taskId)
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
