import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { officeSnapshotSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeSnapshot } from '@pixoffice/protocol/office-integration'
import { emptyWhiteboard } from '@pixoffice/protocol/office-ui'
import { notifySubscribers } from '../notifications.ts'

/** A backend-owned snapshot, with no polling, API base URL or optimistic business writes. */
export class PushOfficeDataSource implements OfficeDataSource {
  readonly kind = 'push'
  readonly canExecute = false
  replayEvents = true
  private snapshot: OfficeSnapshot
  private conversationId: string
  private listeners = new Set<() => void>()
  constructor(snapshot: OfficeSnapshot) { this.snapshot = officeSnapshotSchema.parse(snapshot); this.conversationId = this.snapshot.conversations[0]?.id ?? '' }
  readSnapshot = () => structuredClone(this.snapshot)
  getConversations = () => structuredClone(this.snapshot.conversations)
  selectConversation(id: string) {
    if (this.conversationId === id) return
    this.conversationId = id; this.replayEvents = false; notifySubscribers(this.listeners, 'PushOfficeDataSource')
  }
  getSnapshot = async () => {
    const snapshot = this.readSnapshot(), conversation = snapshot.conversations.find(item => item.id === this.conversationId)
    return { schemaVersion: snapshot.schemaVersion, seq: snapshot.seq, workspace: snapshot.workspace, system: snapshot.system,
      ...(this.conversationId ? { conversationId: this.conversationId } : {}),
      employees: conversation?.employees ?? [], tasks: conversation?.tasks ?? [], events: conversation?.events ?? [], whiteboard: conversation?.whiteboard ?? emptyWhiteboard() }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  update(snapshot: OfficeSnapshot, recovery = false) {
    const next = officeSnapshotSchema.parse(snapshot)
    if (next.workspace.id !== this.snapshot.workspace.id) throw new Error('快照不能修改办公室 ID')
    this.snapshot = next; this.replayEvents = !recovery; notifySubscribers(this.listeners, 'PushOfficeDataSource')
  }
  async execute(): Promise<void> { throw new Error('任务由后端维护，请通过后端下发的选项菜单提交业务操作') }
}
