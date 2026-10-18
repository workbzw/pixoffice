import type { OfficeUiAction, OfficeUiPresentation } from '@pixoffice/protocol/office-integration'
import { OfficeStateFault } from './officeState.ts'

type Pending = { action: OfficeUiAction; delivered: boolean; finish: (result: { code: number; presentation?: OfficeUiPresentation; reasonCode?: string }) => void }
type Waiter = { finish: (action?: OfficeUiAction) => void }
export class OfficeUi {
  private pending = new Map<string, Pending>()
  private waiters = new Set<Waiter>()
  open(action: OfficeUiAction) {
    if (this.pending.size >= 128) throw new OfficeStateFault(503, 'UI_QUEUE_FULL', '用户操作队列已满')
    if (this.pending.has(action.id)) throw new OfficeStateFault(409, 'INVALID_MESSAGE', '用户操作 ID 重复')
    let resolve!: (result: { code: number; presentation?: OfficeUiPresentation; reasonCode?: string }) => void
    const response = new Promise<Parameters<typeof resolve>[0]>(done => { resolve = done })
    const finish: Pending['finish'] = result => { if (!this.pending.delete(action.id)) return; clearTimeout(timer); resolve(result) }
    const timer = setTimeout(() => finish({ code: 408, reasonCode: 'REQUEST_TIMEOUT' }), 60000); timer.unref()
    const pending = { action, delivered: false, finish }; this.pending.set(action.id, pending)
    const waiter = this.waiters.values().next().value
    if (waiter) { pending.delivered = true; waiter.finish(action) }
    return { response, cancel: () => finish({ code: 499, reasonCode: 'CALLER_DISCONNECTED' }) }
  }
  next(timeoutMs: number) {
    if (this.waiters.size >= 16) throw new OfficeStateFault(503, 'UI_WAIT_BUSY', '等待用户操作的请求过多')
    const pending = [...this.pending.values()].find(item => !item.delivered)
    if (pending) { pending.delivered = true; return { response: Promise.resolve(pending.action as OfficeUiAction | undefined), cancel() {} } }
    let resolve!: (action?: OfficeUiAction) => void
    const response = new Promise<OfficeUiAction | undefined>(done => { resolve = done })
    const entry: Waiter = { finish: action => { if (!this.waiters.delete(entry)) return; clearTimeout(timer); resolve(action) } }
    const timer = setTimeout(() => entry.finish(), timeoutMs); timer.unref(); this.waiters.add(entry)
    return { response, cancel: () => entry.finish() }
  }
  get(id: string) { return this.pending.get(id)?.action }
  respond(id: string, presentation: OfficeUiPresentation) {
    const pending = this.pending.get(id)
    if (!pending) throw new OfficeStateFault(410, 'UI_REQUEST_EXPIRED', '用户请求已结束或超时')
    pending.finish({ code: 200, presentation })
  }
  close() {
    for (const waiter of [...this.waiters]) waiter.finish()
    for (const pending of [...this.pending.values()]) pending.finish({ code: 503, reasonCode: 'SERVER_CLOSING' })
  }
}
