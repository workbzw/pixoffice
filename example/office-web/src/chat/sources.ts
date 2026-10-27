import { chatCancelResultSchema, chatHistoryPageSchema, chatOperationSchema, readChatEvents } from '@pixoffice/protocol/chat'
import { responseEnvelopeSchema, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import type { ChatCancelRequest, ChatEvent, ChatHistoryRequest, ChatOperation, ChatRequest, ChatResumeRequest, OfficeChatSource } from '@pixoffice/protocol/chat'
import { commerceInitialHistory } from '../dashboard/commerceScenario.ts'

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** An explicit interaction preview, not an AI model or task executor. */
export class PreviewChatSource implements OfficeChatSource {
  readonly kind = 'preview'
  readonly historyKey: string
  private readonly previewReply?: (request: ChatRequest) => string
  private readonly seedHistory: (conversationId: string, teamId: string) => ReturnType<typeof commerceInitialHistory>
  constructor(previewReply?: (request: ChatRequest) => string, options: { historyKey?: string; initialHistory?: PreviewChatSource['seedHistory'] } = {}) {
    this.previewReply = previewReply; this.historyKey = options.historyKey ?? 'commerce-demo-v1'
    this.seedHistory = options.initialHistory ?? ((conversationId, teamId) => commerceInitialHistory(teamId, conversationId))
  }
  initialHistory(conversationId: string, teamId = 'office-1') { return this.seedHistory(conversationId, teamId) }
  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield { type: 'status', phase: 'thinking' }
    await delay(1000, signal)
    const response = this.previewReply?.(request) ?? '收到。当前为本地电商案例预览，没有连接真实店铺或 AI 服务，不会执行真实上架、投放或付款。'
    for (let index = 0; index < response.length; index += 3) {
      await delay(35, signal)
      yield { type: 'delta', text: response.slice(index, index + 3) }
    }
    yield { type: 'done' }
  }
}

export class HttpChatSource implements OfficeChatSource {
  readonly kind = 'http'
  readonly historyKey: string
  private readonly url: string
  constructor(url: string) {
    const parsed = new URL(url, globalThis.location?.href ?? 'http://localhost')
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('聊天接口必须使用 HTTP 或 HTTPS')
    this.url = parsed.href
    this.historyKey = this.url
  }

  private async response(request: ChatOperation, signal: AbortSignal, streaming: boolean) {
    const response = await fetch(this.url, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: streaming ? 'application/x-ndjson' : 'application/json' },
      body: stringifyProtocolObject(chatOperationSchema.parse(request)),
    })
    if (!response.ok) {
      const result = responseEnvelopeSchema.safeParse(await response.json().catch(() => undefined))
      throw new Error(result.success ? `${result.data.msg}（${result.data.data.reasonCode ?? response.status}）` : `聊天服务请求失败（${response.status}）`)
    }
    return response
  }
  private async json(request: ChatOperation, signal: AbortSignal) {
    const response = await this.response(request, signal, false)
    const result = responseEnvelopeSchema.parse(await response.json())
    if (result.code !== response.status) throw new Error('聊天服务响应状态不一致')
    return result.data
  }
  async history(request: ChatHistoryRequest, signal: AbortSignal) {
    return chatHistoryPageSchema.parse(await this.json(request, signal))
  }
  async cancel(request: ChatCancelRequest, signal: AbortSignal) {
    chatCancelResultSchema.parse(await this.json(request, signal))
  }
  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield* this.events(request, signal)
  }
  async *resume(request: ChatResumeRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield* this.events(request, signal)
  }
  private async *events(request: ChatRequest | ChatResumeRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const response = await this.response(request, signal, true)
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('聊天服务未返回 NDJSON 数据流')
    if (!response.body) throw new Error('聊天服务没有返回内容')
    let first = true
    for await (const event of readChatEvents(response.body, signal)) {
      if (first && request.type === 'resume' && !['snapshot', 'error'].includes(event.type)) throw new Error('恢复回复需要先返回完整内容快照')
      first = false; yield event
    }
  }
}
