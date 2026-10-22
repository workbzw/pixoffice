import type { ChatHistoryTurn } from '@pixoffice/protocol/chat'
import type { ChatMessage } from './ChatSession.ts'

export const messageId = (turnId: string, role: 'user' | 'assistant') => `${turnId}:${role}`

export function mergeHistory(messages: ChatMessage[], turns: ChatHistoryTurn[], older = false) {
  const incoming: ChatMessage[] = turns.flatMap(turn => [
    { id: messageId(turn.id, 'user'), role: 'user', content: turn.user, state: 'complete' },
    { id: messageId(turn.id, 'assistant'), role: 'assistant', content: turn.assistant, state: turn.state },
  ])
  const updates = new Map(incoming.map(message => [message.id, message]))
  const existing = new Set(messages.map(message => message.id))
  const merged = messages.map(message => updates.get(message.id) ?? message)
  const additional = incoming.filter(message => !existing.has(message.id))
  return older ? [...additional, ...messages] : [...merged, ...additional]
}
