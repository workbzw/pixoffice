import { chatEventSchema } from './contract'
import type { ChatEvent, ChatRequest, OfficeChatSource } from './contract'

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
  private readonly url: string
  constructor(url: string) {
    const parsed = new URL(url, globalThis.location?.href ?? 'http://localhost')
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('聊天接口必须使用 HTTP 或 HTTPS')
    this.url = parsed.href
  }

  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const response = await fetch(this.url, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(`聊天服务请求失败（${response.status}）`)
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('聊天服务未返回 NDJSON 数据流')
    if (!response.body) throw new Error('聊天服务没有返回内容')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let newline = buffer.indexOf('\n')
        while (newline >= 0 || (done && buffer.length)) {
          const line = newline < 0 ? buffer : buffer.slice(0, newline)
          buffer = newline < 0 ? '' : buffer.slice(newline + 1)
          if (line.length > 32000) throw new Error('聊天服务的单条消息过大')
          if (line.trim()) {
            const event = chatEventSchema.parse(JSON.parse(line))
            yield event
            if (event.type === 'done' || event.type === 'error') return
          }
          newline = buffer.indexOf('\n')
        }
        if (buffer.length > 32000) throw new Error('聊天服务的单条消息过大')
        if (done) throw new Error('连接提前结束，请重试')
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}

export function createOfficeChatSource(): OfficeChatSource {
  const url = import.meta.env.VITE_PIXOFFICE_CHAT_URL?.trim()
  return url ? new HttpChatSource(url) : new PreviewChatSource()
}
