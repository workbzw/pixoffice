import type { OfficeDataSource } from '@pixoffice/protocol/dashboard'
import { officeSnapshotSchema } from '@pixoffice/protocol/office-integration'
import type { OfficeSnapshot } from '@pixoffice/protocol/office-integration'
import { notifySubscribers } from '../notifications.ts'

/** A backend-owned snapshot, with no polling, API base URL or optimistic business writes. */
export class PushOfficeDataSource implements OfficeDataSource {
  readonly kind = 'push'
  readonly canExecute = false
  replayEvents = true
  private snapshot: OfficeSnapshot
  private listeners = new Set<() => void>()
  constructor(snapshot: OfficeSnapshot) { this.snapshot = officeSnapshotSchema.parse(snapshot) }
  readSnapshot = () => structuredClone(this.snapshot)
  getSnapshot = async () => this.readSnapshot()
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  update(snapshot: OfficeSnapshot, recovery = false) {
    const next = officeSnapshotSchema.parse(snapshot)
    if (next.workspace.id !== this.snapshot.workspace.id) throw new Error('快照不能修改办公室 ID')
    this.snapshot = next; this.replayEvents = !recovery; notifySubscribers(this.listeners, 'PushOfficeDataSource')
  }
  async execute(): Promise<void> { throw new Error('任务由后端维护，请通过后端下发的选项菜单提交业务操作') }
}
