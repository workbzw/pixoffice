import { notifySubscribers } from '../../notifications.ts'

export type DecisionRequester = { name: string; appearanceId: string }
type DecisionBase = { teamId: string; id: string; requester: DecisionRequester; title: string; description: string; expiresAt?: number; createdAt?: number; deadline?: number }
export type DecisionRequest = DecisionBase & (
  { kind: 'choice'; options: { id: string; label: string; description: string }[] }
  | { kind: 'confirmation'; confirmLabel: string; rejectLabel: string }
)
export type DecisionRecord = { id: string; request: DecisionRequest; choiceId: string; label: string }
export type DecisionSnapshot = { teamId: string; pending: DecisionRequest[]; records: DecisionRecord[]; receipt: DecisionRecord | null; submittingId?: string; error?: string | null }
const remaining = (request: DecisionRequest) => request.deadline !== undefined ? request.deadline - performance.now()
  : request.expiresAt !== undefined ? request.expiresAt - Date.now() : Infinity

/** Team-owned requests and local resolutions, independent of mounted views. */
export class DecisionSession {
  readonly teamId: string
  private snapshot: DecisionSnapshot
  private listeners = new Set<() => void>()
  private readonly createRequests: () => DecisionRequest[]
  private started = false
  private seen = new Set<string>()
  private receiptTimer?: ReturnType<typeof setTimeout>
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private submissions = new Map<string, (choiceId: string) => Promise<void>>()
  private flights = new Map<string, Promise<DecisionRecord | null>>()
  constructor(teamId: string, source: DecisionRequest[] | (() => DecisionRequest[]) = []) {
    this.teamId = teamId
    if (typeof source === 'function') this.createRequests = source
    else { const requests = [...source]; this.createRequests = () => [...requests] }
    const requests = this.initialRequests()
    this.seen = new Set(requests.map(request => request.id))
    this.snapshot = { teamId, pending: [...requests], records: [], receipt: null }
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private initialRequests() {
    const requests = this.createRequests()
    if (requests.some(request => request.teamId !== this.teamId) || new Set(requests.map(request => request.id)).size !== requests.length) throw new Error('确认请求的团队或 ID 不正确')
    return requests
  }
  start() {
    this.started = true
    for (const request of this.snapshot.pending) {
      if (remaining(request) <= 0) this.dismiss(request.id)
      else this.watchExpiry(request)
    }
  }
  stop() {
    this.started = false
    for (const timer of this.expiryTimers.values()) clearTimeout(timer)
    this.expiryTimers.clear()
  }
  private watchExpiry(request: DecisionRequest) {
    clearTimeout(this.expiryTimers.get(request.id))
    if (request.expiresAt !== undefined || request.deadline !== undefined) this.expiryTimers.set(request.id, setTimeout(() => this.dismiss(request.id), Math.max(0, remaining(request))))
  }
  private update(snapshot: DecisionSnapshot) {
    this.snapshot = snapshot
    notifySubscribers(this.listeners, 'DecisionSession')
  }
  enqueue(request: DecisionRequest, submit?: (choiceId: string) => Promise<void>) {
    if (this.enqueueError(request)) return false
    this.seen.add(request.id)
    if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value!)
    if (submit) this.submissions.set(request.id, submit)
    this.watchExpiry(request)
    clearTimeout(this.receiptTimer)
    this.update({ ...this.snapshot, pending: [...this.snapshot.pending, request], receipt: null, error: null })
    return true
  }
  enqueueError(request: DecisionRequest) {
    if (request.teamId !== this.teamId) return 'OFFICE_NOT_INITIALIZED' as const
    if (remaining(request) <= 0) return 'DECISION_EXPIRED' as const
    if (this.seen.has(request.id)) return 'DECISION_DUPLICATE' as const
    if (this.snapshot.pending.length >= 32) return 'DECISION_QUEUE_FULL' as const
    return null
  }
  resolve(teamId: string, decisionId: string, choiceId: string): DecisionRecord | null {
    if (this.submissions.has(decisionId)) return null
    return this.commit(teamId, decisionId, choiceId)
  }
  choose(teamId: string, decisionId: string, choiceId: string): Promise<DecisionRecord | null> {
    const existing = this.flights.get(decisionId)
    if (existing) return existing
    const submit = this.submissions.get(decisionId)
    if (!submit) return Promise.resolve(this.resolve(teamId, decisionId, choiceId))
    const request = this.snapshot.pending[0]
    if (!request || teamId !== this.teamId || request.id !== decisionId || remaining(request) <= 0) return Promise.resolve(null)
    if (request.kind === 'choice' ? !request.options.some(option => option.id === choiceId) : !['confirm', 'reject'].includes(choiceId)) return Promise.resolve(null)
    this.update({ ...this.snapshot, submittingId: decisionId, error: null })
    const flight = Promise.resolve().then(() => submit(choiceId)).then(() => this.commit(teamId, decisionId, choiceId)).catch(error => {
      if (this.snapshot.pending.some(item => item.id === decisionId)) this.update({ ...this.snapshot, error: error instanceof Error ? error.message : '选择提交失败，请重试' })
      return null
    }).finally(() => {
      this.flights.delete(decisionId)
      if (this.snapshot.submittingId === decisionId) this.update({ ...this.snapshot, submittingId: undefined })
    })
    this.flights.set(decisionId, flight)
    return flight
  }
  dismiss(decisionId: string) {
    clearTimeout(this.expiryTimers.get(decisionId)); this.expiryTimers.delete(decisionId); this.submissions.delete(decisionId)
    if (!this.snapshot.pending.some(request => request.id === decisionId)) return
    this.update({ ...this.snapshot, pending: this.snapshot.pending.filter(request => request.id !== decisionId),
      ...(this.snapshot.submittingId === decisionId ? { submittingId: undefined, error: null } : {}) })
  }
  private commit(teamId: string, decisionId: string, choiceId: string): DecisionRecord | null {
    const request = this.snapshot.pending[0]
    if (teamId !== this.teamId || !request || request.teamId !== teamId || request.id !== decisionId) return null
    if (remaining(request) <= 0) { this.dismiss(decisionId); return null }
    const label = request.kind === 'choice' ? request.options.find(option => option.id === choiceId)?.label
      : choiceId === 'confirm' ? request.confirmLabel : choiceId === 'reject' ? request.rejectLabel : undefined
    if (!label) return null
    const record = { id: `${teamId}:${request.id}:${choiceId}`, request, choiceId, label }
    const pending = this.snapshot.pending.slice(1)
    clearTimeout(this.expiryTimers.get(decisionId)); this.expiryTimers.delete(decisionId); this.submissions.delete(decisionId)
    clearTimeout(this.receiptTimer)
    if (!pending.length) this.receiptTimer = setTimeout(() => {
      if (this.snapshot.receipt === record) this.clearReceipt()
    }, 3000)
    this.update({ ...this.snapshot, pending, records: [...this.snapshot.records, record].slice(-200), receipt: pending.length ? null : record, error: null })
    return record
  }
  clearReceipt() {
    clearTimeout(this.receiptTimer); this.receiptTimer = undefined
    if (this.snapshot.receipt) this.update({ ...this.snapshot, receipt: null })
  }
  clearRecords() { clearTimeout(this.receiptTimer); this.update({ ...this.snapshot, records: [], receipt: null }) }
  reset() {
    const requests = this.initialRequests()
    clearTimeout(this.receiptTimer)
    for (const timer of this.expiryTimers.values()) clearTimeout(timer)
    this.expiryTimers.clear(); this.submissions.clear()
    this.seen = new Set(requests.map(request => request.id))
    this.update({ teamId: this.teamId, pending: requests, records: [], receipt: null })
    if (this.started) this.start()
  }
}
