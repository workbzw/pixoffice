import type { OfficeRuntime } from '../OfficeRuntime'
import { commandBase } from './legacy'

/** Development transport. Durable delivery/authentication belong to the host integration. */
export class RuntimeHttpClient {
  private runtime: OfficeRuntime
  private baseUrl: string
  private onStatus: (status: string) => void
  private timer?: ReturnType<typeof setTimeout>
  private controller?: AbortController
  private closed = true
  private cursor = 0
  private eventSequence = 0
  private generation = 0
  private externalCommands = new Set<string>()
  private gatewayEpoch?: string
  private failures = 0

  constructor(runtime: OfficeRuntime, baseUrl: string, onStatus: (status: string) => void = () => {}) {
    this.runtime = runtime; this.baseUrl = baseUrl.replace(/\/$/, ''); this.onStatus = onStatus
  }
  connect() { if (!this.closed) return; this.closed = false; this.generation++; void this.poll(this.generation) }
  disconnect() { this.closed = true; this.generation++; clearTimeout(this.timer); this.controller?.abort() }
  private async request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${this.baseUrl}${path}`, { method, signal: this.controller?.signal,
      headers: { 'Content-Type': 'application/json', 'X-Scene-Runtime': this.runtime.runtimeId }, body: body == null ? undefined : JSON.stringify(body) })
    if (!response.ok) throw new Error(response.status === 409 ? '其他页面已连接' : `HTTP ${response.status}`)
    return response.json()
  }
  private async poll(generation: number) {
    if (this.closed || generation !== this.generation) return
    this.controller = new AbortController()
    const timeout = setTimeout(() => this.controller?.abort(), 5000)
    try {
      const session = await this.request('/scene/connect', 'POST', { runtimeId: this.runtime.runtimeId, sceneId: this.runtime.sceneId })
      if (this.closed || generation !== this.generation) return
      if (typeof session.epoch !== 'string') throw new Error('无效的网关会话')
      if (this.gatewayEpoch !== session.epoch) { this.gatewayEpoch = session.epoch; this.cursor = 0; this.eventSequence = 0 }
      const batch = await this.request(`/scene/commands?cursor=${this.cursor}`)
      if (this.closed || generation !== this.generation) return
      if (!Array.isArray(batch.commands) || batch.commands.length > 32) throw new Error('无效的命令批次')
      const receipts = []
      for (const item of batch.commands) {
        if (!Number.isInteger(item.cursor) || item.cursor <= this.cursor) continue
        let results
        try {
          results = item.payload && typeof item.payload === 'object' && 'commands' in item.payload
            ? this.runtime.submitBatch(item.payload) : [this.runtime.submit(item.payload)]
        } catch (error) {
          const source = Array.isArray(item.payload?.commands) ? item.payload.commands : [item.payload]
          results = source.map((c: { commandId?: string }) => ({ commandId: c?.commandId ?? '', status: 'rejected', error: { code: 'INVALID_COMMAND', message: String(error) } }))
        }
        for (const result of results) if (result.commandId && ['queued', 'running', 'completed'].includes(result.status)) this.externalCommands.add(result.commandId)
        receipts.push({ cursor: item.cursor, results })
      }
      if (this.closed || generation !== this.generation) return
      if (receipts.length) {
        await this.request('/scene/receipts', 'POST', { receipts })
        this.cursor = receipts.at(-1)!.cursor
      }
      const snapshot = this.runtime.snapshot()
      const live = new Set(snapshot.activities.filter(a => a.status === 'active').map(a => a.commandId))
      for (const id of this.externalCommands) if (!live.has(id) && !snapshot.records.some(r => r.command.commandId === id && ['queued', 'running'].includes(r.status))) this.externalCommands.delete(id)
      const events = snapshot.events.filter(event => event.sequence > this.eventSequence)
      if (events.length) {
        await this.request('/scene/events', 'POST', { events })
        this.eventSequence = events.at(-1)!.sequence
      }
      await this.request('/scene/state', 'PUT', { sceneId: snapshot.world.sceneId, runtimeId: this.runtime.runtimeId,
        world: snapshot.world, activities: snapshot.activities.slice(-50), records: snapshot.records.slice(-64), resources: snapshot.resources,
        editor: snapshot.editor, map: this.runtime.exportMap(), protocol: this.runtime.describe() })
      if (this.closed || generation !== this.generation) return
      this.failures = 0; this.onStatus('已连接')
    } catch (error) {
      if (this.closed || generation !== this.generation) return
      this.failures++
      this.onStatus(error instanceof Error && error.message === '其他页面已连接' ? error.message : '未连接')
      // External activities cannot keep running indefinitely after losing the host.
      if (this.failures >= 3 || error instanceof Error && error.message === '其他页面已连接') {
        for (const id of this.externalCommands) {
          const record = this.runtime.getRecord(id)
          if (record?.activityId) this.runtime.submit({ ...commandBase(this.runtime), type: 'activity.stop', activityId: record.activityId })
          else if (record?.status === 'queued') this.runtime.submit({ ...commandBase(this.runtime), type: 'command.cancel', targetCommandId: id })
        }
        this.externalCommands.clear()
      }
    } finally {
      clearTimeout(timeout)
      if (!this.closed && generation === this.generation) this.timer = setTimeout(() => void this.poll(generation), Math.min(500 * 2 ** this.failures, 5000))
    }
  }
}
