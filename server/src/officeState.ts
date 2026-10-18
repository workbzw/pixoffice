import { canonical } from '@pixoffice/protocol'
import type { OfficeSnapshot } from '@pixoffice/protocol/office-integration'
import { OFFICE_ROSTER } from '@pixoffice/scene-office/core/roster'
import { maxRelayEventBytes, maxRelayTeams } from '@pixoffice/protocol/relay'

export class OfficeStateFault extends Error {
  constructor(readonly code: number, readonly reasonCode: string, message: string) { super(message) }
}

/** Latest business state only. No animation history or offline command queue. */
export class OfficeState {
  private snapshots = new Map<string, OfficeSnapshot>()
  constructor(private readonly maxBytes = 8 * 1024 * 1024) {}
  list() { return structuredClone([...this.snapshots.values()]) }
  get(id: string) { const snapshot = this.snapshots.get(id); return snapshot && structuredClone(snapshot) }
  apply(snapshots: OfficeSnapshot[], requireExisting = false) {
    const next = new Map(this.snapshots), accepted: OfficeSnapshot[] = [], results: { teamId: string; seq: number; status: 'cached' | 'ignored'; reasonCode?: 'STALE_SEQ' | 'DUPLICATE_SEQ' }[] = []
    const actors = new Set(OFFICE_ROSTER.map(actor => actor.id))
    for (const snapshot of snapshots) {
      if (Buffer.byteLength(JSON.stringify(snapshot)) > maxRelayEventBytes - 1024) throw new OfficeStateFault(413, 'MESSAGE_TOO_LARGE', '补齐默认字段后的办公室快照过大')
      const id = snapshot.workspace.id, previous = next.get(id)
      if (requireExisting && !previous) throw new OfficeStateFault(404, 'OFFICE_NOT_INITIALIZED', '办公室未初始化')
      if (snapshot.employees.some(employee => employee.sceneActorId && !actors.has(employee.sceneActorId))) throw new OfficeStateFault(422, 'INVALID_BINDING', '绑定了不存在的场景人物')
      if (previous && snapshot.seq <= previous.seq) {
        if (snapshot.seq === previous.seq && canonical(snapshot) !== canonical(previous)) throw new OfficeStateFault(409, 'SEQ_CONFLICT', '相同 seq 不能对应不同快照')
        results.push({ teamId: id, seq: previous.seq, status: 'ignored', reasonCode: snapshot.seq === previous.seq ? 'DUPLICATE_SEQ' : 'STALE_SEQ' })
        continue
      }
      next.set(id, structuredClone(snapshot)); accepted.push(snapshot); results.push({ teamId: id, seq: snapshot.seq, status: 'cached' })
    }
    if (next.size > maxRelayTeams) throw new OfficeStateFault(422, 'OFFICE_LIMIT', `最多支持 ${maxRelayTeams} 个办公室`)
    if (Buffer.byteLength(JSON.stringify([...next.values()])) > this.maxBytes) throw new OfficeStateFault(503, 'CACHE_FULL', '办公室快照缓存已满')
    this.snapshots = next
    return { accepted, results }
  }
}
