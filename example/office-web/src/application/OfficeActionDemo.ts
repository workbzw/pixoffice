import { SceneFault, terminal } from '@pixoffice/protocol'
import type { SceneCommand } from '@pixoffice/protocol'
import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { commandBase } from '@pixoffice/scene-office/adapters/office'
import { demoReturnCommands } from '../scene/systems/officeDemo.ts'
import { notifySubscribers } from '../notifications.ts'

type Step = { label: string; commands: () => SceneCommand[]; holdMs?: number }

/** Finite local choreography using the same commands and collision rules as normal office actions. */
export class OfficeActionDemo {
  private readonly runtime: SceneRuntime
  private readonly listeners = new Set<() => void>()
  private steps: Step[] = []
  private activeIds: string[] = []
  private index = -1
  private holding = 0
  private stopping = false
  private preparing = false
  private enabled = false
  private label = ''
  error: string | null = null

  constructor(runtime: SceneRuntime) { this.runtime = runtime }
  get isRunning() { return this.enabled }
  get status() { return this.label }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return
    if (enabled) {
      if (this.runtime.isEditing) throw new SceneFault('EDITING', '请先完成布局编辑')
      if (this.runtime.snapshot().persistenceError) throw new SceneFault('PERSISTENCE_FAILED', '请先恢复办公室存档')
      this.steps = this.buildSteps()
      this.index = -1; this.preparing = true; this.holding = 0; this.stopping = false
      this.error = null; this.enabled = true; this.label = '等待已有动作结束'
    } else {
      this.enabled = false; this.cancelActive(); this.steps = []; this.label = ''
      this.returnHome()
    }
    this.publish()
  }

  tick(elapsedMs: number) {
    if (!this.enabled) return
    try {
      if (this.runtime.isEditing) { this.setEnabled(false); return }
      if (this.preparing) {
        const snapshot = this.runtime.snapshot()
        if (snapshot.activities.some(activity => activity.status === 'active') || snapshot.records.some(record => record.status === 'queued')
          || snapshot.world.actors.some(actor => actor.motion || actor.step || actor.seatTransition)) return
        this.preparing = false
      }
      const records = this.activeIds.map(id => this.runtime.getRecord(id))
      const failed = records.find(record => record?.error || record?.status === 'cancelled')
      if (failed) throw new Error(failed.error ? `[${failed.error.code}] ${failed.error.message}` : '动作演示已被中断')
      if (records.some(record => !record)) throw new Error('动作演示记录丢失')
      const step = this.steps[this.index]
      if (step?.holdMs && !this.stopping) {
        const phases = this.runtime.readActivePhases()
        if (!records.every(record => phases.some(phase => phase.activityId === record?.activityId && phase.ready && phase.phaseIndex === phase.phaseCount - 1))) return
        this.holding += elapsedMs
        if (this.holding < step.holdMs) return
        this.stopping = true
        for (const record of records) this.submit({ ...commandBase(this.runtime), type: 'activity.stop', activityId: record!.activityId! })
      }
      if (records.some(record => !terminal(record!.status))) return
      const next = this.steps[++this.index]
      if (!next) {
        this.enabled = false; this.activeIds = []; this.label = '全员动作演示已完成'; this.publish(); return
      }
      this.label = `${this.index + 1}/${this.steps.length} · ${next.label}`
      this.holding = 0; this.stopping = false
      this.activeIds = []
      for (const command of next.commands()) this.activeIds.push(this.submit(command).commandId)
      this.publish()
    } catch (error) {
      this.enabled = false; this.cancelActive(); this.returnHome()
      this.error = error instanceof Error ? error.message : '动作演示失败'
      this.label = '动作演示已停止'; this.publish()
    }
  }

  private submit(command: SceneCommand) {
    const result = this.runtime.submit(command)
    if (result.error) throw new Error(`[${result.error.code}] ${result.error.message}`)
    return result
  }
  private publish() { notifySubscribers(this.listeners, 'OfficeActionDemo') }
  private cancelActive() {
    const ids = this.activeIds; this.activeIds = []
    const active = new Set(this.runtime.readActivePhases().map(phase => phase.activityId))
    for (const id of ids) {
      const record = this.runtime.getRecord(id)
      if (!terminal(record?.status ?? 'completed')) this.runtime.submit({ ...commandBase(this.runtime), type: 'command.cancel', targetCommandId: id })
      else if (record?.activityId && active.has(record.activityId)) this.runtime.submit({ ...commandBase(this.runtime), type: 'activity.stop', activityId: record.activityId })
    }
  }
  private returnHome() {
    for (const command of demoReturnCommands(this.runtime)) this.runtime.submit(command)
  }

  private buildSteps(): Step[] {
    const actors = this.runtime.readActors().filter(actor => actor.homeId)
    if (actors.length < 3) throw new SceneFault('DEMO_ROSTER', '全员动作演示至少需要三位有工位的成员')
    const home = new Map(actors.map(actor => [actor.id, actor.homeId!]))
    const activity = (capability: string, participants: { entityId: string; role: string }[], params: Extract<SceneCommand, { type: 'activity.start' }>['params']): SceneCommand => ({
      ...commandBase(this.runtime), type: 'activity.start', capability, participants, params,
    })
    const move = (actorId: string, targetId: string, anchor: string) => activity('scene.move', [{ entityId: actorId, role: 'actor' }], { targetId, anchor })
    const steps: Step[] = [{ label: '全员返回工位', commands: () => demoReturnCommands(this.runtime) },
      { label: '全员入座工作', holdMs: 3500, commands: () => actors.map(actor => activity('office.focus', [{ entityId: actor.id, role: 'worker' }], { title: '动作展示 · 入座工作' })) },
      { label: '全员起身离座', commands: () => actors.map(actor => move(actor.id, actor.homeId!, 'seatLeft')) },
    ]
    for (const [animation, label] of [['wave', '挥手'], ['thinking', '思考'], ['surprised', '惊讶']]) {
      steps.push({ label: `全员${label}`, commands: () => actors.map(actor => activity('office.emote', [{ entityId: actor.id, role: 'actor' }], { animation: `emotes/${animation}`, durationMs: 1800 })) })
    }
    steps.push({ label: '全员闲时 · 站立', holdMs: 2500, commands: () => [] })
    steps.push({ label: '全员正面发言', commands: () => actors.map(actor => activity('scene.say', [{ entityId: actor.id, role: 'actor' }], { text: `${actor.name}，准备好了。`, durationMs: 1500 })) })
    for (const actor of actors) for (const anchor of ['seatRight', 'seatLeft']) {
      steps.push({ label: `${actor.name} · 四向行走`, commands: () => [move(actor.id, actor.homeId!, anchor)] })
    }
    steps.push({ label: '全员返回座位', commands: () => demoReturnCommands(this.runtime) })
    for (const [index, actor] of actors.entries()) {
      const visitor = actors[(index + 1) % actors.length], observer = actors[(index + 2) % actors.length]
      const visit = () => activity('office.visit', [{ entityId: visitor.id, role: 'visitor' }, { entityId: actor.id, role: 'host' }], {
        durationMs: 1200, stops: [{ hostId: actor.id, message: `${actor.name}，一起核对一下。`, reply: '收到，已经核对好了。' }],
      })
      // Occupy the other approach with a real observer to demonstrate both seated views.
      steps.push({ label: `${actor.name} · 准备左侧交谈`, commands: () => [move(observer.id, actor.homeId!, 'conversationRight')] },
        { label: `${actor.name} · 左侧交谈`, commands: () => [visit()] },
        { label: `${actor.name} · 切换交谈方向`, commands: () => [move(observer.id, actor.homeId!, 'conversationLeft')] },
        { label: `${actor.name} · 右侧交谈`, commands: () => [visit()] },
        { label: `${observer.name} · 返回工位`, commands: () => [move(observer.id, home.get(observer.id)!, 'seat')] })
    }
    const board = this.runtime.readWorld().props.find(prop => ['office.wall-whiteboard', 'office.whiteboard'].includes(prop.templateId))
    if (board) for (let start = 0; start < actors.length; start += 3) {
      const group = actors.slice(start, start + 3)
      if (group.length < 2) continue
      steps.push({ label: `${group.map(actor => actor.name).join('、')} · 白板会议`, commands: () => [activity('office.meeting',
        group.map((actor, index) => ({ entityId: actor.id, role: index ? 'attendee' : 'speaker' })), { boardId: board.id, text: '本组动作展示完成，返回工位。', durationMs: 1800 })] })
    }
    steps.push({ label: '全员入座，展示结束', commands: () => demoReturnCommands(this.runtime) })
    steps.push({ label: '全员闲时 · 入座', holdMs: 2500, commands: () => [] })
    return steps
  }
}
