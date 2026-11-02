import type { ChatHistoryTurn } from '@pixoffice/protocol/chat'
import type { ChatMessage } from './ChatSession.ts'

export const messageId = (turnId: string, role: 'user' | 'assistant') => `${turnId}:${role}`

export function mergeHistory(messages: ChatMessage[], turns: ChatHistoryTurn[], older = false, beforeId = '') {
  const incoming: ChatMessage[] = turns.flatMap(turn => [
    { id: messageId(turn.id, 'user'), role: 'user', content: turn.user, state: 'complete' },
    { id: messageId(turn.id, 'assistant'), role: 'assistant', content: turn.assistant, state: turn.state },
  ])
  const existing = new Set(messages.map(message => message.id))
  if (!older) {
    const updates = new Map(incoming.map(message => [message.id, message]))
    return [...messages.map(message => updates.get(message.id) ?? message), ...incoming.filter(message => !existing.has(message.id))]
  }
  if (!messages.length) return incoming
  // Insert missing runs before their next known message or the remote page boundary.
  let anchor = existing.has(beforeId) ? beforeId : messages[0].id
  const additions = new Map<string, ChatMessage[]>()
  for (const message of incoming.toReversed()) {
    if (existing.has(message.id)) anchor = message.id
    else {
      const group = additions.get(anchor) ?? []
      group.push(message); additions.set(anchor, group)
    }
  }
  return messages.flatMap(message => [...(additions.get(message.id)?.toReversed() ?? []), message])
}
