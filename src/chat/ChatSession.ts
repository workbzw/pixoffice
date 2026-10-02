import type { ChatTurn, OfficeChatSource } from './contract'

export type ChatMessage = ChatTurn & { id: string; state: 'complete' | 'pending' | 'stopped' | 'error' }
export type ChatSnapshot = { messages: ChatMessage[]; phase: 'idle' | 'thinking' | 'streaming'; error: string | null }

export class ChatSession {
  private snapshot: ChatSnapshot = { messages: [], phase: 'idle', error: null }
  private listeners = new Set<() => void>()
  private active: AbortController | null = null
  private timeout: ReturnType<typeof setTimeout> | undefined
  private conversationId = crypto.randomUUID()
  private readonly source: OfficeChatSource
  private readonly timeoutMs: number

  constructor(source: OfficeChatSource, timeoutMs = 180000) { this.source = source; this.timeoutMs = timeoutMs }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(snapshot: ChatSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()) }
  private finish(state: ChatMessage['state'], error: string | null = null) {
    this.update({ ...this.snapshot, phase: 'idle', error, messages: this.snapshot.messages.map(message => message.state === 'pending' ? { ...message, state } : message) })
  }

  async send(content: string) {
    const text = content.trim()
    if (!text || text.length > 4000 || this.active) return
    // Send only complete turns, with bounded context. Interrupted responses stay visible locally.
    const history: ChatTurn[] = this.snapshot.messages.flatMap((message, index) => message.role === 'assistant' && message.state === 'complete'
      ? [this.snapshot.messages[index - 1], message].map(({ role, content }) => ({ role, content })) : []).slice(-20)
    while (history.reduce((total, message) => total + message.content.length, 0) > 100000) history.splice(0, 2)
    history.push({ role: 'user', content: text })
    const controller = new AbortController()
    this.active = controller
    this.update({ phase: 'thinking', error: null, messages: [...this.snapshot.messages,
      { id: crypto.randomUUID(), role: 'user', content: text, state: 'complete' },
      { id: crypto.randomUUID(), role: 'assistant', content: '', state: 'pending' },
    ] })
    const timer = setTimeout(() => {
      if (this.active !== controller) return
      this.active = null
      this.timeout = undefined
      controller.abort()
      this.finish('error', '回复超时，请稍后重试')
    }, this.timeoutMs)
    this.timeout = timer
    try {
      for await (const event of this.source.stream({ version: '1.0', conversationId: this.conversationId, messages: history }, controller.signal)) {
        if (this.active !== controller) return
        if (event.type === 'error') throw new Error(event.message)
        if (event.type === 'done') {
          if (!this.snapshot.messages.at(-1)?.content.trim()) throw new Error('聊天服务没有返回回复')
          this.finish('complete')
          return
        }
        if (event.type === 'status') this.update({ ...this.snapshot, phase: event.phase })
        if (event.type === 'delta' && event.text) {
          const last = this.snapshot.messages.at(-1)!
          if (last.content.length + event.text.length > 50000) throw new Error('回复已达到长度上限')
          this.update({ ...this.snapshot, phase: 'streaming', messages: [...this.snapshot.messages.slice(0, -1), { ...last, content: last.content + event.text }] })
        }
      }
      if (this.active === controller) throw new Error('连接提前结束，请重试')
    } catch (error) {
      if (this.active === controller) this.finish('error', error instanceof Error ? error.message : '暂时无法回复，请重试')
    } finally {
      clearTimeout(timer)
      if (this.active === controller) { this.active = null; this.timeout = undefined }
    }
  }

  stop() { const active = this.active; this.active = null; clearTimeout(this.timeout); this.timeout = undefined; active?.abort(); this.finish('stopped') }
  clear() { this.stop(); this.conversationId = crypto.randomUUID(); this.update({ messages: [], phase: 'idle', error: null }) }
  dispose() { this.stop() }
}
