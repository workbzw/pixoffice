import { z } from 'zod'
import { jsonObjectSchema, parseProtocolObject } from './schema.ts'
// Optional chat domain, independent of the scene runtime and transport.

export const chatPath = '/api/pixoffice/chat'
export const maxChatReplyCharacters = 50000
export const chatTimeoutMs = 180000
export const maxChatRequestBytes = 524288
export const maxChatHistoryBytes = 8 * 1024 * 1024
export const chatControlTimeoutMs = 15000
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

export const chatProtocolSchema = z.strictObject({
  version: z.literal('1.0'), browserPath: z.literal(chatPath), method: z.literal('POST'),
  upstream: z.strictObject({ configuredBy: z.literal('offices.initialize.chat.url'), direction: z.literal('pixoffice-server-to-chat-service') }),
  identity: z.array(z.string()), requests: jsonObjectSchema,
  operations: z.array(z.strictObject({ type: z.enum(['send', 'history', 'resume', 'cancel']), requestSchema: jsonObjectSchema,
    responseContentType: z.enum(['application/json', 'application/x-ndjson']), responseSchema: jsonObjectSchema, timeoutMs: z.number().int().positive() })),
  stream: z.strictObject({ eventSchema: jsonObjectSchema, resumeFirstEvents: z.array(z.string()), terminalEvents: z.array(z.string()), terminalSnapshotStates: z.array(z.string()) }),
  limits: z.strictObject({ requestBytes: z.number().int().positive(), historyResponseBytes: z.number().int().positive(), replyCharacters: z.number().int().positive() }),
  rules: z.array(z.string()),
})

export function describeChatProtocol(timeoutMs = chatTimeoutMs) {
  const jsonResponse = (data: typeof chatHistoryPageSchema | typeof chatCancelResultSchema) => z.toJSONSchema(z.strictObject({ code: z.literal(200), msg: z.string(), data }), { io: 'output' })
  return chatProtocolSchema.parse({
    version: '1.0', browserPath: chatPath, method: 'POST', upstream: { configuredBy: 'offices.initialize.chat.url', direction: 'pixoffice-server-to-chat-service' },
    identity: ['teamId', 'conversationId', 'turnId'], requests: z.toJSONSchema(chatOperationSchema, { io: 'input' }),
    operations: [
      { type: 'send', requestSchema: z.toJSONSchema(chatRequestSchema, { io: 'input' }), responseContentType: 'application/x-ndjson', responseSchema: z.toJSONSchema(chatEventSchema, { io: 'output' }), timeoutMs },
      { type: 'history', requestSchema: z.toJSONSchema(chatHistoryRequestSchema, { io: 'input' }), responseContentType: 'application/json', responseSchema: jsonResponse(chatHistoryPageSchema), timeoutMs: Math.min(timeoutMs, chatControlTimeoutMs) },
      { type: 'resume', requestSchema: z.toJSONSchema(chatResumeRequestSchema, { io: 'input' }), responseContentType: 'application/x-ndjson', responseSchema: z.toJSONSchema(chatEventSchema, { io: 'output' }), timeoutMs },
      { type: 'cancel', requestSchema: z.toJSONSchema(chatCancelRequestSchema, { io: 'input' }), responseContentType: 'application/json', responseSchema: jsonResponse(chatCancelResultSchema), timeoutMs: Math.min(timeoutMs, chatControlTimeoutMs) },
    ],
    stream: { eventSchema: z.toJSONSchema(chatEventSchema, { io: 'output' }), resumeFirstEvents: ['snapshot', 'error'], terminalEvents: ['done', 'error'], terminalSnapshotStates: ['complete', 'stopped', 'error'] },
    limits: { requestBytes: maxChatRequestBytes, historyResponseBytes: maxChatHistoryBytes, replyCharacters: maxChatReplyCharacters },
    rules: [
      '聊天服务保存完整历史与生成状态；PixOffice 服务端转发请求，浏览器保存本地缓存和草稿。',
      '同一 teamId、conversationId、turnId 的重复 send 应复用已有轮次；不同输入不得复用同一轮次 ID。',
      'history 的轮次按从旧到新排列；空 cursor 读取最近页，nextCursor 读取更早页。',
      'resume 订阅已有轮次，首条事件必须为 snapshot 或 error；不重新启动生成。',
      '断开流连接不等于 cancel；显式 cancel 保存最终状态，重复停止返回 stopped: true。',
      '浏览器新建会话发送首条消息后，业务后端须将同一 conversationId 加入办公室快照目录。',
      '聊天服务保存新内容后，外部后端可通过业务入口发送 chat.updated，携带 teamId、conversationId；页面重新读取历史，通知本身不携带聊天正文。',
    ],
  })
}

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
