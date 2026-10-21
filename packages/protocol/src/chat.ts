import { z } from 'zod'
import { parseProtocolObject } from './schema.ts'
// Optional chat domain, independent of the scene runtime and transport.

export const chatPath = '/api/pixoffice/chat'
export const maxChatReplyCharacters = 50000
export const chatTimeoutMs = 180000
export const officeChatConfigSchema = z.strictObject({ url: z.union([z.literal(''), z.url({ protocol: /^https?$/ }).refine(value => {
  try {
    const url = new URL(value)
    return !url.username && !url.password && !url.hash
  } catch { return false }
}, '聊天地址不能包含身份信息或片段')]) })
export type OfficeChatConfig = z.infer<typeof officeChatConfigSchema>

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatRequest = { version: '1.0'; teamId: string; conversationId: string; messages: ChatTurn[] }
export const chatRequestSchema = z.strictObject({ version: z.literal('1.0'), teamId: z.string().min(1).max(100),
  conversationId: z.string().min(1).max(100), messages: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string() })) })
export const chatEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), phase: z.enum(['thinking', 'streaming']) }),
  z.strictObject({ type: z.literal('delta'), text: z.string().max(16000) }),
  z.strictObject({ type: z.literal('done') }),
  z.strictObject({ type: z.literal('error'), message: z.string().min(1).max(1000) }),
])
export type ChatEvent = z.infer<typeof chatEventSchema>

export interface OfficeChatSource {
  readonly kind: string
  readonly historyKey?: string
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>
}

export async function* readChatEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncIterable<ChatEvent> {
  const reader = body.getReader(), decoder = new TextDecoder()
  let buffer = '', characters = 0
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
          const event = chatEventSchema.parse(parseProtocolObject(line))
          if (event.type === 'delta') {
            characters += event.text.length
            if (characters > maxChatReplyCharacters) throw new Error('聊天回复过长，请缩小问题范围')
          }
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
