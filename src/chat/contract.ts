import { z } from 'zod'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatRequest = { version: '1.0'; conversationId: string; messages: ChatTurn[] }
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), phase: z.enum(['thinking', 'streaming']) }),
  z.object({ type: z.literal('delta'), text: z.string().max(16000) }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string().min(1).max(1000) }),
])
export type ChatEvent = z.infer<typeof chatEventSchema>

export interface OfficeChatSource {
  readonly kind: string
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>
}
