import { randomUUID } from 'node:crypto'
import type { OfficeMessage, OfficeReply } from '@pixoffice/protocol/office-integration'
import { officeDecisionResultSchema, officeResultSchema, officeErrorResultSchema } from '@pixoffice/protocol/office-integration'

export type OfficeResponse = { code: number; msg: string; data: unknown }
type Pending = { request: OfficeMessage; finish: (result: OfficeResponse) => void; timer: ReturnType<typeof setTimeout>; receivers: number; failure?: OfficeResponse }

/** Holds open HTTP requests only. It never queues animations or stores business data. */
export class OfficeRequests {
  private readonly pending = new Map<string, Pending>()
  constructor(private readonly onClose: (message: OfficeMessage, token: string) => void, private readonly limit = 128, private readonly requestMs = 10000) {}

  open(request: OfficeMessage) {
    if (this.pending.size >= this.limit) return undefined
    const token = randomUUID()
    const timeoutMs = request.type === 'decision.request' ? request.timeoutMs : this.requestMs
    const deadline = performance.now() + timeoutMs
    let resolve!: (result: OfficeResponse) => void
    const response = new Promise<OfficeResponse>(done => { resolve = done })
    const finish = (result: OfficeResponse) => {
      const entry = this.pending.get(token)
      if (!entry) return
      clearTimeout(entry.timer); this.pending.delete(token)
      resolve(result); this.onClose(request, token)
    }
    const timer = setTimeout(() => finish(this.pending.get(token)?.failure ?? { code: 408, msg: 'Request timed out', data: { reasonCode: 'REQUEST_TIMEOUT' } }), timeoutMs)
    timer.unref()
    this.pending.set(token, { request, finish, timer, receivers: 1 })
    return { token, remainingMs: () => Math.max(0, deadline - performance.now()), response, cancel: finish,
      setReceivers: (count: number) => { const entry = this.pending.get(token); if (entry) entry.receivers = count } }
  }

  reply(reply: OfficeReply): 'accepted' | 'expired' | 'invalid' {
    const entry = this.pending.get(reply.responseToken)
    if (!entry) return 'expired'
    const request = entry.request, response = reply.result
    if (!(response.code === 200 ? officeResultSchema(request.type, request.type === 'office.read' && Boolean(request.teamId)) : officeErrorResultSchema).safeParse(response.data).success) return 'invalid'
    if (response.code === 200 && request.type === 'decision.request') {
      const result = officeDecisionResultSchema.parse(response.data)
      if (result.teamId !== request.teamId || result.conversationId !== request.conversationId || result.decisionId !== request.decision.id) return 'invalid'
      const label = request.decision.kind === 'choice' ? request.decision.options.find(option => option.id === result.choiceId)?.label
        : result.choiceId === 'confirm' ? request.decision.confirmLabel : result.choiceId === 'reject' ? request.decision.rejectLabel : undefined
      if (!label) return 'invalid'
      entry.finish({ code: 200, msg: 'User selected', data: { teamId: request.teamId, conversationId: request.conversationId, decisionId: request.decision.id, choiceId: result.choiceId, label } })
    } else {
      const result = response
      // A fresh empty tab must not reject a request another initialized tab can handle.
      if (response.code !== 200 && entry.receivers > 1) entry.failure ??= result
      else entry.finish(result)
    }
    return 'accepted'
  }

  close() {
    for (const entry of [...this.pending.values()]) entry.finish({ code: 503, msg: 'Server closing', data: { reasonCode: 'SERVER_CLOSING' } })
  }
}
