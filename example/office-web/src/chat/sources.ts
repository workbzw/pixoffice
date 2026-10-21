import { chatRequestSchema, readChatEvents } from '@pixoffice/protocol/chat'
import { responseEnvelopeSchema, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import type { ChatEvent, ChatRequest, OfficeChatSource } from '@pixoffice/protocol/chat'

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
  async *stream(_request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    yield { type: 'status', phase: 'thinking' }
    await delay(1000, signal)
    const response = '收到你的消息。\n\n这里目前是对话交互预览，尚未连接 AI 服务，因此不会分析或执行这条请求。接入聊天服务后，真实回复会在这里逐步显示。'
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

  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const response = await fetch(this.url, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: stringifyProtocolObject(chatRequestSchema.parse(request)),
    })
    if (!response.ok) {
      const result = responseEnvelopeSchema.safeParse(await response.json().catch(() => undefined))
      throw new Error(result.success ? `${result.data.msg}（${result.data.data.reasonCode ?? response.status}）` : `聊天服务请求失败（${response.status}）`)
    }
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('聊天服务未返回 NDJSON 数据流')
    if (!response.body) throw new Error('聊天服务没有返回内容')
    yield* readChatEvents(response.body, signal)
  }
}
