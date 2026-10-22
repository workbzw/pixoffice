import { chatHistoryPageSchema } from '@pixoffice/protocol/chat'
import type { ChatEvent, ChatTurn, OfficeChatSource } from '@pixoffice/protocol/chat'
import { notifySubscribers } from '../notifications.ts'
import { chatArchiveSchema } from './persistence.ts'
import type { ChatArchive, ChatPersistence } from './persistence.ts'
import { mergeHistory, messageId } from './history.ts'

export type ChatMessage = ChatTurn & { id: string; state: 'complete' | 'pending' | 'stopped' | 'error' }
export type ChatSnapshot = { messages: ChatMessage[]; draft: string; ready: boolean; phase: 'idle' | 'thinking' | 'streaming'; error: string | null; storageError: string | null;
  syncing: boolean; historyError: string | null; hasMoreHistory: boolean; loadingOlder: boolean; olderError: string | null; canceling: boolean }

export class ChatSession {
  private snapshot: ChatSnapshot = { messages: [], draft: '', ready: true, phase: 'idle', error: null, storageError: null,
    syncing: false, historyError: null, hasMoreHistory: false, loadingOlder: false, olderError: null, canceling: false }
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
  private activeTurnId = ''
  private historyCursor = ''
  private synchronized = false
  private syncFlight?: Promise<void>
  private syncController?: AbortController
  private olderController?: AbortController
  private cancelController?: AbortController
  private cancelFlight?: Promise<boolean>
  private readonly syncOnRestore: boolean

  constructor(teamId: string, source: OfficeChatSource, options: { timeoutMs?: number; persistence?: ChatPersistence; conversationId?: string; syncOnRestore?: boolean } = {}) {
    this.teamId = teamId; this.source = source; this.timeoutMs = options.timeoutMs ?? 180000; this.persistence = options.persistence
    if (options.conversationId) this.conversationId = options.conversationId
    this.syncOnRestore = options.syncOnRestore !== false
    this.snapshot.ready = !this.persistence && !this.source.history
    this.ready = this.restore()
  }
  getSnapshot = () => this.snapshot
  get id() { return this.conversationId }
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
    try {
      const value = await this.persistence?.read()
      this.persisted = value
      if (value !== undefined) {
        const archive = chatArchiveSchema.parse(value)
        if (archive.teamId !== this.teamId || archive.messages.length % 2 || new Set(archive.messages.map(message => message.id)).size !== archive.messages.length) throw new Error('Chat archive identity mismatch')
        for (let index = 0; index < archive.messages.length; index++) {
          if (archive.messages[index].role !== (index % 2 ? 'assistant' : 'user')) throw new Error('Chat archive turn order is invalid')
        }
        this.conversationId = archive.conversationId
        this.activeTurnId = archive.activeTurnId
        this.dirty = archive.messages.some(message => message.state === 'pending')
        this.snapshot = { ...this.snapshot, draft: archive.draft, messages: archive.messages.map(message => message.state === 'pending' ? { ...message, state: 'stopped' } : message) }
      }
    } catch {
      this.persistenceBlocked = true
      this.snapshot = { ...this.snapshot, storageError: '聊天记录无法读取，原记录未覆盖；本次对话仅临时保留。' }
    }
    this.update({ ...this.snapshot, ready: true }, false)
    if (this.syncOnRestore && this.source.history) await this.synchronize()
    else if (this.activeTurnId && this.source.resume) void this.resume(this.activeTurnId)
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
      const archive: ChatArchive = { version: 1, teamId: this.teamId, conversationId: this.conversationId, draft: this.snapshot.draft, messages: this.snapshot.messages, activeTurnId: this.activeTurnId }
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
    this.activeTurnId = ''
    this.update({ ...this.snapshot, phase: 'idle', error, messages: this.snapshot.messages.map(message => message.state === 'pending' ? { ...message, state } : message) })
  }

  synchronize(force = false): Promise<void> {
    if (!this.snapshot.ready) return this.ready.then(() => this.synchronize(force))
    if (this.syncFlight) return this.syncFlight
    if (!this.source.history || this.active || this.snapshot.canceling || this.synchronized && !force) return Promise.resolve()
    this.synchronized = true
    this.syncFlight = this.readHistory().finally(() => { this.syncFlight = undefined })
    return this.syncFlight
  }
  private async readHistory() {
    this.olderController?.abort(); this.olderController = undefined
    const controller = new AbortController(); this.syncController = controller
    this.update({ ...this.snapshot, syncing: true, historyError: null, loadingOlder: false, olderError: null }, false)
    try {
      const page = chatHistoryPageSchema.parse(await this.source.history!({ version: '1.0', type: 'history', teamId: this.teamId, conversationId: this.conversationId, cursor: '', limit: 20 }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])))
      if (controller.signal.aborted) return
      this.synchronized = true; this.historyCursor = page.nextCursor; this.activeTurnId = page.activeTurnId
      this.update({ ...this.snapshot, syncing: false, historyError: null, error: null, phase: page.activeTurnId ? 'thinking' : 'idle', hasMoreHistory: page.hasMore, messages: mergeHistory(this.snapshot.messages, page.turns) })
      await this.flush()
      if (page.activeTurnId && this.activeTurnId === page.activeTurnId && !this.snapshot.canceling && this.source.resume) void this.resume(page.activeTurnId)
    } catch (error) {
      if (!controller.signal.aborted) this.update({ ...this.snapshot, syncing: false, historyError: error instanceof Error ? error.message : '聊天历史同步失败' }, false)
    } finally { if (this.syncController === controller) { this.syncController = undefined; if (this.snapshot.syncing) this.update({ ...this.snapshot, syncing: false }, false) } }
  }
  async loadOlder() {
    if (!this.source.history || this.snapshot.syncing || !this.snapshot.hasMoreHistory || this.snapshot.loadingOlder) return
    const cursor = this.historyCursor, controller = new AbortController(); this.olderController = controller
    this.update({ ...this.snapshot, loadingOlder: true, olderError: null }, false)
    try {
      const page = chatHistoryPageSchema.parse(await this.source.history({ version: '1.0', type: 'history', teamId: this.teamId, conversationId: this.conversationId, cursor, limit: 20 }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])))
      if (controller.signal.aborted) return
      if (page.hasMore && page.nextCursor === cursor) throw new Error('聊天历史游标未前进')
      this.historyCursor = page.nextCursor
      this.update({ ...this.snapshot, loadingOlder: false, hasMoreHistory: page.hasMore, messages: mergeHistory(this.snapshot.messages, page.turns, true) })
      await this.flush()
    } catch (error) {
      if (!controller.signal.aborted) this.update({ ...this.snapshot, loadingOlder: false, olderError: error instanceof Error ? error.message : '较早记录加载失败' }, false)
    } finally { if (this.olderController === controller) this.olderController = undefined }
  }

  async send(content: string) {
    if (!this.snapshot.ready) await this.ready
    const text = content.trim()
    if (!text || text.length > 4000 || this.active || this.activeTurnId || this.snapshot.syncing || this.snapshot.historyError || this.snapshot.canceling) return
    // Send only complete turns, with bounded context. Interrupted responses stay visible locally.
    const history: ChatTurn[] = this.snapshot.messages.flatMap((message, index) => message.role === 'assistant' && message.state === 'complete'
      ? [this.snapshot.messages[index - 1], message].map(({ role, content }) => ({ role, content })) : []).slice(-20)
    while (history.reduce((total, message) => total + message.content.length, 0) > 100000) history.splice(0, 2)
    history.push({ role: 'user', content: text })
    const turnId = crypto.randomUUID()
    this.activeTurnId = turnId
    this.update({ ...this.snapshot, draft: '', phase: 'thinking', error: null, messages: [...this.snapshot.messages,
      { id: messageId(turnId, 'user'), role: 'user', content: text, state: 'complete' },
      { id: messageId(turnId, 'assistant'), role: 'assistant', content: '', state: 'pending' },
    ] })
    await this.receive(turnId, (controller) => this.source.stream({ version: '1.0', type: 'send', turnId, teamId: this.teamId, conversationId: this.conversationId, messages: history }, controller.signal))
  }

  private async resume(turnId: string) {
    if (!this.source.resume || this.active) return
    this.activeTurnId = turnId
    this.update({ ...this.snapshot, phase: 'thinking', error: null, messages: this.snapshot.messages.map(message => message.id === messageId(turnId, 'assistant') ? { ...message, state: 'pending' } : message) })
    await this.receive(turnId, controller => this.source.resume!({ version: '1.0', type: 'resume', turnId, teamId: this.teamId, conversationId: this.conversationId }, controller.signal))
  }
  private async receive(turnId: string, events: (controller: AbortController) => AsyncIterable<ChatEvent>) {
    const controller = new AbortController(); this.active = controller
    const timer = setTimeout(() => {
      if (this.active !== controller) return
      this.active = null
      this.timeout = undefined
      controller.abort()
      this.finish('error', '回复超时，请稍后重试')
      if (this.source.history) this.update({ ...this.snapshot, historyError: '回复接收超时，请重新同步会话' }, false)
    }, this.timeoutMs)
    this.timeout = timer
    try {
      for await (const event of events(controller)) {
        if (this.active !== controller) return
        if (event.type === 'error') throw new Error(event.message)
        if (event.type === 'done') {
          if (!this.snapshot.messages.find(message => message.id === messageId(turnId, 'assistant'))?.content.trim()) throw new Error('聊天服务没有返回回复')
          this.finish('complete')
          return
        }
        if (event.type === 'status') this.update({ ...this.snapshot, phase: event.phase })
        if (event.type === 'snapshot') {
          if (event.state === 'complete' && !event.text.trim()) throw new Error('聊天服务没有返回回复')
          this.update({ ...this.snapshot, messages: this.snapshot.messages.map(message => message.id === messageId(turnId, 'assistant') ? { ...message, content: event.text, state: event.state } : message), phase: event.state === 'pending' ? event.text ? 'streaming' : 'thinking' : 'idle' })
          if (event.state !== 'pending') { this.finish(event.state, event.state === 'error' ? event.message || '回复生成失败' : null); return }
        }
        if (event.type === 'delta' && event.text) {
          const last = this.snapshot.messages.find(message => message.id === messageId(turnId, 'assistant'))!
          if (last.content.length + event.text.length > 50000) throw new Error('回复已达到长度上限')
          this.update({ ...this.snapshot, phase: 'streaming', messages: this.snapshot.messages.map(message => message === last ? { ...last, content: last.content + event.text } : message) })
        }
      }
      if (this.active === controller) throw new Error('连接提前结束，请重试')
    } catch (error) {
      if (this.active === controller) {
        this.finish('error', error instanceof Error ? error.message : '暂时无法回复，请重试')
        if (this.source.history) this.update({ ...this.snapshot, historyError: this.snapshot.error }, false)
      }
    } finally {
      clearTimeout(timer)
      if (this.active === controller) { this.active = null; this.timeout = undefined }
      await this.flush()
    }
  }

  stop(): Promise<boolean> {
    if (this.snapshot.canceling && this.cancelFlight) return this.cancelFlight
    const turnId = this.activeTurnId
    const active = this.active
    this.active = null; clearTimeout(this.timeout); this.timeout = undefined; active?.abort()
    if (active || turnId) this.finish('stopped')
    void this.flush()
    if (turnId && this.source.cancel) {
      const controller = new AbortController(); this.cancelController = controller
      const conversationId = this.conversationId
      this.update({ ...this.snapshot, canceling: true }, false)
      const cancellation = Promise.resolve().then(() => this.source.cancel!({ version: '1.0', type: 'cancel', teamId: this.teamId, conversationId, turnId }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])))
        .then(() => true)
        .catch(error => {
          if (!controller.signal.aborted && this.cancelController === controller && this.conversationId === conversationId) {
            const message = `停止生成失败：${error instanceof Error ? error.message : '请重新同步会话'}`
            this.activeTurnId = turnId
            this.update({ ...this.snapshot, phase: 'thinking', error: message, historyError: this.source.history ? message : null })
          }
          return false
        })
        .finally(() => {
          if (this.cancelFlight === cancellation) this.cancelFlight = undefined
          if (this.cancelController === controller) { this.cancelController = undefined; if (this.conversationId === conversationId) this.update({ ...this.snapshot, canceling: false }, false) }
        })
      this.cancelFlight = cancellation
      return cancellation
    }
    return Promise.resolve(true)
  }
  clear() { this.stop(); this.syncController?.abort(); this.olderController?.abort(); this.synchronized = false; this.historyCursor = ''; this.conversationId = crypto.randomUUID(); this.update({ ...this.snapshot, draft: '', messages: [], phase: 'idle', error: null, historyError: null, syncing: false, loadingOlder: false, hasMoreHistory: false, olderError: null, canceling: false }); void this.flush() }
  detach() {
    this.synchronized = false
    this.syncController?.abort(); this.olderController?.abort(); this.cancelController?.abort()
    const active = this.active; this.active = null; clearTimeout(this.timeout); this.timeout = undefined; active?.abort()
    if (active || this.snapshot.syncing || this.snapshot.loadingOlder || this.snapshot.canceling) this.update({ ...this.snapshot, phase: 'idle', syncing: false, loadingOlder: false, canceling: false })
    void this.flush()
  }
  dispose() { this.detach() }
}
