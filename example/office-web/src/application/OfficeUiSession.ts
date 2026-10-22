import type { OfficeUiAction, OfficeUiPresentation } from '@pixoffice/protocol/office-integration'
import { notifySubscribers } from '../notifications.ts'

export type OfficeUiIntent = OfficeUiAction extends infer T ? T extends OfficeUiAction ? Omit<T, 'id' | 'teamId' | 'conversationId'> : never : never
export class OfficeUiSession {
  private state: { pending: boolean; error: string | null; dialog: Extract<OfficeUiPresentation, { target: 'dialog' }>['content'] | null; interactionId: string | null } = { pending: false, error: null, dialog: null, interactionId: null }
  private listeners = new Set<() => void>()
  readonly teamId: string
  private readonly send?: (action: OfficeUiAction) => Promise<OfficeUiPresentation>
  private readonly conversation: () => string
  private flights = new Set<string>()
  constructor(teamId: string, send?: (action: OfficeUiAction) => Promise<OfficeUiPresentation>, conversation = () => 'main') { this.teamId = teamId; this.send = send; this.conversation = conversation }
  get enabled() { return Boolean(this.send) }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<typeof this.state>) { this.state = { ...this.state, ...change }; notifySubscribers(this.listeners, 'OfficeUiSession') }
  async request(intent: OfficeUiIntent) {
    if (!this.send) return
    const conversationId = this.conversation()
    if (this.flights.has(conversationId)) throw new Error('已有操作正在等待后端处理')
    if (intent.action === 'dialog.action' && (intent.interactionId !== this.state.interactionId || !this.state.dialog?.actions.some(option => option.id === intent.optionId))) throw new Error('选项不存在或已失效')
    this.flights.add(conversationId)
    const action = { ...intent, id: crypto.randomUUID(), teamId: this.teamId, conversationId } as OfficeUiAction
    this.update({ pending: true, error: null })
    try {
      const result = await this.send(action)
      if (result.target === 'result' && !result.success) throw new Error(result.message || '后端未完成该操作')
      if (conversationId === this.conversation()) this.update({ dialog: result.target === 'dialog' ? result.content : null, interactionId: action.id })
    } catch (error) { if (conversationId === this.conversation()) this.update({ error: error instanceof Error ? error.message : '后端处理失败' }); throw error }
    finally { this.flights.delete(conversationId); if (conversationId === this.conversation()) this.update({ pending: false }) }
  }
  close = () => this.update({ dialog: null, error: null, interactionId: null, pending: this.flights.has(this.conversation()) })
}
