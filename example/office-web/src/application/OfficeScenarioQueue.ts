import { terminal } from '@pixoffice/protocol'
import { commandBase } from '@pixoffice/scene-office/adapters/office'
import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import type { SceneCommand } from '@pixoffice/protocol'
import { demoReturnCommands } from '../scene/systems/officeDemo.ts'

type Stop = { hostId: string; message: string; reply: string }
type Job = { command: SceneCommand; stops: Stop[]; received: Set<string>; replyPhases?: { actorId: string; index: number }[];
  onDelivered: (actorId: string) => void; onCompleted: () => void }

/** Local choreography observes completed dialogue phases, never elapsed walk estimates. */
export class OfficeScenarioQueue {
  private readonly runtime: SceneRuntime
  private jobs: Job[] = []
  private active?: Job
  constructor(runtime: SceneRuntime) { this.runtime = runtime }

  visit(stops: Stop[], durationMs: number, onDelivered: Job['onDelivered'], onCompleted: Job['onCompleted']) {
    this.jobs.push({ command: { ...commandBase(this.runtime), type: 'activity.start', capability: 'office.visit',
      participants: [{ entityId: 'office-lead', role: 'visitor' }, ...stops.map(stop => ({ entityId: stop.hostId, role: 'host' }))],
      params: { durationMs, stops } }, stops, received: new Set(), onDelivered, onCompleted })
  }
  tick() {
    const job = this.active
    if (job) {
      const record = this.runtime.getRecord(job.command.commandId)
      if (record?.error) throw new Error(`[${record.error.code}] ${record.error.message}`)
      if (record?.status === 'running' || record?.status === 'completed') {
        if (!job.replyPhases) {
          const activity = this.runtime.snapshot().activities.find(activity => activity.commandId === job.command.commandId)
          if (!activity) throw new Error('派工活动缺少执行计划')
          job.replyPhases = job.stops.map(stop => {
            const index = activity.plan.phases.findIndex(phase => phase.speech?.some(speech => speech.actorId === stop.hostId && speech.text === stop.reply))
            if (index < 0) throw new Error(`派工计划缺少 ${stop.hostId} 的回应`)
            return { actorId: stop.hostId, index }
          })
        }
        const phase = this.runtime.readActivePhases().find(phase => phase.activityId === record.activityId)
        for (const { actorId, index } of job.replyPhases) {
          if (!job.received.has(actorId) && (record.status === 'completed' || phase && phase.phaseIndex > index)) {
            job.received.add(actorId); job.onDelivered(actorId)
          }
        }
      }
      if (!record || !terminal(record.status)) return
      if (record.status !== 'completed') throw new Error(`派工活动已中断：${record.status}`)
      this.active = undefined
      job.onCompleted()
    }
    if (!this.active) {
      const next = this.jobs.shift()
      if (!next) return
      this.active = next
      const result = this.runtime.submit(next.command)
      if (result.error) throw new Error(`[${result.error.code}] ${result.error.message}`)
    }
  }
  stop() {
    this.jobs.length = 0
    const id = this.active?.command.commandId
    this.active = undefined
    if (id && !terminal(this.runtime.getRecord(id)?.status ?? 'completed')) this.runtime.submit({ ...commandBase(this.runtime), type: 'command.cancel', targetCommandId: id })
    for (const command of demoReturnCommands(this.runtime)) this.runtime.submit(command)
  }
}
