import type { ChatTurn, OfficeChatSource } from '@pixoffice/protocol/chat'
import { notifySubscribers } from '../notifications.ts'
import { chatArchiveSchema } from './persistence.ts'
import type { ChatArchive, ChatPersistence } from './persistence.ts'

export type ChatMessage = ChatTurn & { id: string; state: 'complete' | 'pending' | 'stopped' | 'error' }
export type ChatSnapshot = { messages: ChatMessage[]; draft: string; ready: boolean; phase: 'idle' | 'thinking' | 'streaming'; error: string | null; storageError: string | null }

export class ChatSession {
  private snapshot: ChatSnapshot = { messages: [], draft: '', ready: true, phase: 'idle', error: null, storageError: null }
  private listeners = new Set<() => void>()
  private active: AbortController | null = null
  private timeout: ReturnType<typeof setTimeout> | undefined
  private conversationId: string = crypto.randomUUID()
  readonly source: OfficeChatSource
  readonly teamId: string
  readonly ready: Promise<void>
  private readonly timeoutMs: number
  private readonly persistence?: ChatPersistence
  private persistenceBlocked = false
  private saveTimer?: ReturnType<typeof setTimeout>
  private dirty = false
  private saving?: Promise<void>
  private persisted: unknown

  constructor(teamId: string, source: OfficeChatSource, options: { timeoutMs?: number; persistence?: ChatPersistence } = {}) {
    this.teamId = teamId; this.source = source; this.timeoutMs = options.timeoutMs ?? 180000; this.persistence = options.persistence
    this.snapshot.ready = !this.persistence
    this.ready = this.restore()
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(snapshot: ChatSnapshot, persist = true) {
    this.snapshot = snapshot
    notifySubscribers(this.listeners, 'ChatSession')
    if (persist && snapshot.ready && this.persistence && !this.persistenceBlocked) {
      this.dirty = true
      this.saveTimer ??= setTimeout(() => { void this.flush() }, 300)
    }
  }
  private async restore() {
    if (!this.persistence) return
    try {
      const value = await this.persistence.read()
      this.persisted = value
      if (value !== undefined) {
        const archive = chatArchiveSchema.parse(value)
        if (archive.teamId !== this.teamId || archive.messages.length % 2 || new Set(archive.messages.map(message => message.id)).size !== archive.messages.length) throw new Error('Chat archive identity mismatch')
        for (let index = 0; index < archive.messages.length; index++) {
          if (archive.messages[index].role !== (index % 2 ? 'assistant' : 'user')) throw new Error('Chat archive turn order is invalid')
        }
        this.conversationId = archive.conversationId
        this.dirty = archive.messages.some(message => message.state === 'pending')
        this.snapshot = { ...this.snapshot, draft: archive.draft, messages: archive.messages.map(message => message.state === 'pending' ? { ...message, state: 'stopped' } : message) }
      }
    } catch {
      this.persistenceBlocked = true
      this.snapshot = { ...this.snapshot, storageError: '聊天记录无法读取，原记录未覆盖；本次对话仅临时保留。' }
    }
    this.update({ ...this.snapshot, ready: true }, false)
  }
  setDraft(draft: string) { if (this.snapshot.ready) this.update({ ...this.snapshot, draft: draft.slice(0, 4000) }) }
  flush = (): Promise<void> => {
    clearTimeout(this.saveTimer); this.saveTimer = undefined
    if (this.saving) return this.saving
    if (!this.dirty || !this.persistence || this.persistenceBlocked) return Promise.resolve()
    this.saving = this.save().finally(() => { this.saving = undefined })
    return this.saving
  }
  private async save() {
    while (this.dirty && this.persistence && !this.persistenceBlocked) {
      this.dirty = false
      const archive: ChatArchive = { version: 1, teamId: this.teamId, conversationId: this.conversationId, draft: this.snapshot.draft, messages: this.snapshot.messages }
      try { await this.persistence.write(archive, this.persisted); this.persisted = archive }
      catch (error) {
        this.dirty = true
        if (error instanceof Error && 'code' in error && error.code === 'CHAT_STORAGE_CONFLICT') this.persistenceBlocked = true
        this.snapshot = { ...this.snapshot, storageError: this.persistenceBlocked
          ? '聊天记录已被其他页面更新，未覆盖存档；本页内容仅临时保留，刷新前请保留需要的内容。'
          : '聊天记录保存失败；刷新页面可能丢失最近内容。' }
        notifySubscribers(this.listeners, 'ChatSession')
        return
      }
      if (this.snapshot.storageError) {
        this.snapshot = { ...this.snapshot, storageError: null }
        notifySubscribers(this.listeners, 'ChatSession')
      }
    }
  }
  private finish(state: ChatMessage['state'], error: string | null = null) {
    this.update({ ...this.snapshot, phase: 'idle', error, messages: this.snapshot.messages.map(message => message.state === 'pending' ? { ...message, state } : message) })
  }

  async send(content: string) {
    if (!this.snapshot.ready) await this.ready
    const text = content.trim()
    if (!text || text.length > 4000 || this.active) return
    // Send only complete turns, with bounded context. Interrupted responses stay visible locally.
    const history: ChatTurn[] = this.snapshot.messages.flatMap((message, index) => message.role === 'assistant' && message.state === 'complete'
      ? [this.snapshot.messages[index - 1], message].map(({ role, content }) => ({ role, content })) : []).slice(-20)
    while (history.reduce((total, message) => total + message.content.length, 0) > 100000) history.splice(0, 2)
    history.push({ role: 'user', content: text })
    const controller = new AbortController()
    this.active = controller
    this.update({ ...this.snapshot, draft: '', phase: 'thinking', error: null, messages: [...this.snapshot.messages,
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
      for await (const event of this.source.stream({ version: '1.0', teamId: this.teamId, conversationId: this.conversationId, messages: history }, controller.signal)) {
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
      await this.flush()
    }
  }

  stop() {
    const active = this.active
    this.active = null; clearTimeout(this.timeout); this.timeout = undefined; active?.abort()
    if (active) this.finish('stopped')
    void this.flush()
  }
  clear() { this.stop(); this.conversationId = crypto.randomUUID(); this.update({ ...this.snapshot, draft: '', messages: [], phase: 'idle', error: null }); void this.flush() }
  dispose() { this.stop() }
}
