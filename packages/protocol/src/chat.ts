import { z } from 'zod'
// Optional chat domain, independent of the scene runtime and transport.

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
