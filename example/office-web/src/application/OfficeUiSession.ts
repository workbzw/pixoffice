import type { OfficeUiAction, OfficeUiPresentation } from '@pixoffice/protocol/office-integration'
import { notifySubscribers } from '../notifications.ts'

export type OfficeUiIntent = OfficeUiAction extends infer T ? T extends OfficeUiAction ? Omit<T, 'id' | 'teamId'> : never : never
export class OfficeUiSession {
  private state: { pending: boolean; error: string | null; dialog: Extract<OfficeUiPresentation, { target: 'dialog' }>['content'] | null; interactionId: string | null } = { pending: false, error: null, dialog: null, interactionId: null }
  private listeners = new Set<() => void>()
  readonly teamId: string
  private readonly send?: (action: OfficeUiAction) => Promise<OfficeUiPresentation>
  constructor(teamId: string, send?: (action: OfficeUiAction) => Promise<OfficeUiPresentation>) { this.teamId = teamId; this.send = send }
  get enabled() { return Boolean(this.send) }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(change: Partial<typeof this.state>) { this.state = { ...this.state, ...change }; notifySubscribers(this.listeners, 'OfficeUiSession') }
  async request(intent: OfficeUiIntent) {
    if (!this.send) return
    if (this.state.pending) throw new Error('已有操作正在等待后端处理')
    if (intent.action === 'dialog.action' && (intent.interactionId !== this.state.interactionId || !this.state.dialog?.actions.some(option => option.id === intent.optionId))) throw new Error('选项不存在或已失效')
    const action = { ...intent, id: crypto.randomUUID(), teamId: this.teamId } as OfficeUiAction
    this.update({ pending: true, error: null })
    try {
      const result = await this.send(action)
      this.update({ dialog: result.target === 'dialog' ? result.content : null, interactionId: action.id })
    } catch (error) { this.update({ error: error instanceof Error ? error.message : '后端处理失败' }); throw error }
    finally { this.update({ pending: false }) }
  }
  close = () => this.update({ dialog: null, error: null })
}
