import type { SceneRuntime } from '@pixoffice/runtime/SceneRuntime'
import { SceneFault } from '@pixoffice/protocol'
import { demoCommands, demoReturnCommands } from '../scene/systems/officeDemo.ts'
import { notifySubscribers } from '../notifications.ts'

/** Explicit sample scene commands; this source never updates business tasks. */
export class OfficeDemoSource {
  private runtime: SceneRuntime
  private listeners = new Set<() => void>()
  private enabled = false
  private delay = 0
  private round = 0
  private commandIds: string[] = []
  private checkedRevision = -1
  private commandsPending = false
  private readonly options: { automatic?: boolean }
  error: string | null = null

  constructor(runtime: SceneRuntime, options: { automatic?: boolean } = {}) { this.runtime = runtime; this.options = options }
  get isRunning() { return this.enabled }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  setEnabled(enabled: boolean) {
    if (enabled) {
      if (this.runtime.snapshot().persistenceError) throw new SceneFault('PERSISTENCE_FAILED', '存档尚未恢复，请先点击“备份并恢复布局”')
      if (this.runtime.isEditing) throw new SceneFault('EDITING', '请先完成布局编辑')
    }
    this.enabled = enabled; this.delay = 0; this.commandIds = []; this.error = null; this.checkedRevision = -1
    notifySubscribers(this.listeners, 'OfficeDemoSource')
  }

  tick(elapsedMs: number) {
    if (!this.enabled || this.runtime.isEditing || this.options.automatic === false) return
    try {
      const revision = this.runtime.getRevision()
      // Command/phase changes publish revisions; interpolated positions do not.
      if (revision !== this.checkedRevision) {
        const snapshot = this.runtime.snapshot()
        const failed = snapshot.records.find(record => this.commandIds.includes(record.command.commandId) && record.error)
        if (failed?.error) throw new SceneFault(failed.error.code, failed.error.message, failed.error)
        this.commandsPending = snapshot.activities.some(activity => activity.status === 'active') || snapshot.records.some(record => record.status === 'queued')
        this.checkedRevision = revision
      }
      if (this.commandsPending || this.runtime.readActors().some(actor => actor.motion || actor.step || actor.seatTransition)) return
      this.delay -= elapsedMs
      if (this.delay > 0) return
      const returning = demoReturnCommands(this.runtime)
      const commands = returning.length ? returning : demoCommands(this.runtime, this.round)
      if (!commands.length) throw new SceneFault('DEMO_ROSTER', '演示至少需要两位有工位的同事')
      this.commandIds = []
      for (const command of commands) {
        const result = this.runtime.submit(command)
        if (result.error) throw new SceneFault(result.error.code, result.error.message, result.error)
        this.commandIds.push(result.commandId)
      }
      if (!returning.length) this.round++
      this.delay = returning.length ? 0 : 1200
    } catch (error) {
      this.enabled = false; this.delay = 0; this.commandIds = []
      this.error = error instanceof Error ? error.message : '演示启动失败'
      notifySubscribers(this.listeners, 'OfficeDemoSource')
    }
  }
}
