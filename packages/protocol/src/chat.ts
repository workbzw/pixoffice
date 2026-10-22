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
const identity = { version: z.literal('1.0'), teamId: z.string().min(1).max(100), conversationId: z.string().min(1).max(100) }
const turnIdSchema = z.string().min(1).max(100)
export const chatRequestSchema = z.strictObject({ ...identity, type: z.literal('send'), turnId: turnIdSchema,
  messages: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string().max(50000) })).max(21) })
export type ChatRequest = z.infer<typeof chatRequestSchema>
export const chatHistoryRequestSchema = z.strictObject({ ...identity, type: z.literal('history'), cursor: z.string().max(500).default(''), limit: z.number().int().min(1).max(50).default(20) })
export const chatResumeRequestSchema = z.strictObject({ ...identity, type: z.literal('resume'), turnId: turnIdSchema })
export const chatCancelRequestSchema = z.strictObject({ ...identity, type: z.literal('cancel'), turnId: turnIdSchema })
export const chatOperationSchema = z.discriminatedUnion('type', [chatRequestSchema, chatHistoryRequestSchema, chatResumeRequestSchema, chatCancelRequestSchema])
export type ChatOperation = z.infer<typeof chatOperationSchema>
export type ChatHistoryRequest = z.infer<typeof chatHistoryRequestSchema>
export type ChatResumeRequest = z.infer<typeof chatResumeRequestSchema>
export type ChatCancelRequest = z.infer<typeof chatCancelRequestSchema>
export const chatHistoryTurnSchema = z.strictObject({ id: turnIdSchema, user: z.string().min(1).max(4000), assistant: z.string().max(maxChatReplyCharacters),
  state: z.enum(['complete', 'pending', 'stopped', 'error']), error: z.string().max(1000).default('') })
export type ChatHistoryTurn = z.infer<typeof chatHistoryTurnSchema>
export const chatHistoryPageSchema = z.strictObject({ turns: z.array(chatHistoryTurnSchema).max(50),
  nextCursor: z.string().max(500), hasMore: z.boolean(), activeTurnId: z.string().max(100).default('') }).superRefine((page, context) => {
  if (new Set(page.turns.map(turn => turn.id)).size !== page.turns.length || page.hasMore !== Boolean(page.nextCursor)
    || page.hasMore && !page.turns.length || page.turns.filter(turn => turn.state === 'pending').length > 1
    || page.turns.some(turn => turn.state === 'pending' && (turn.id !== page.activeTurnId || turn !== page.turns.at(-1)))
    || page.activeTurnId && !page.turns.some(turn => turn.id === page.activeTurnId && turn.state === 'pending')) context.addIssue({ code: 'custom', message: '聊天历史目录或游标无效' })
})
export type ChatHistoryPage = z.infer<typeof chatHistoryPageSchema>
export const chatCancelResultSchema = z.strictObject({ stopped: z.literal(true) })
export const chatEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), phase: z.enum(['thinking', 'streaming']) }),
  z.strictObject({ type: z.literal('delta'), text: z.string().max(16000) }),
  z.strictObject({ type: z.literal('done') }),
  z.strictObject({ type: z.literal('error'), message: z.string().min(1).max(1000) }),
  z.strictObject({ type: z.literal('snapshot'), text: z.string().max(maxChatReplyCharacters), state: z.enum(['pending', 'complete', 'stopped', 'error']), message: z.string().max(1000).default('') }),
])
export type ChatEvent = z.infer<typeof chatEventSchema>

export interface OfficeChatSource {
  readonly kind: string
  readonly historyKey?: string
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>
  history?(request: ChatHistoryRequest, signal: AbortSignal): Promise<ChatHistoryPage>
  resume?(request: ChatResumeRequest, signal: AbortSignal): AsyncIterable<ChatEvent>
  cancel?(request: ChatCancelRequest, signal: AbortSignal): Promise<void>
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
        if (line.length > 350000) throw new Error('聊天服务的单条消息过大')
        if (line.trim()) {
          const event = chatEventSchema.parse(parseProtocolObject(line))
          if (event.type === 'delta') {
            characters += event.text.length
            if (characters > maxChatReplyCharacters) throw new Error('聊天回复过长，请缩小问题范围')
          }
          if (event.type === 'snapshot') characters = event.text.length
          yield event
          if (event.type === 'done' || event.type === 'error' || event.type === 'snapshot' && event.state !== 'pending') return
        }
        newline = buffer.indexOf('\n')
      }
      if (buffer.length > 350000) throw new Error('聊天服务的单条消息过大')
      if (done) throw new Error('连接提前结束，请重试')
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
