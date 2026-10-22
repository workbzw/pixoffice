import type { OfficeChatSource } from '@pixoffice/protocol/chat'
import type { DashboardConversation } from '@pixoffice/protocol/dashboard'
import { notifySubscribers } from '../notifications.ts'
import { ChatSession } from './ChatSession.ts'
import { chatWorkspaceArchiveSchema } from './persistence.ts'
import type { ChatArchive, ChatWorkspaceArchive, ChatWorkspacePersistence } from './persistence.ts'
import { PreviewChatSource } from './sources.ts'

export type ConversationEntry = { id: string; title: string; session: ChatSession; local: boolean; data?: DashboardConversation }
export type ChatWorkspaceSnapshot = { conversations: readonly ConversationEntry[]; selectedId: string; ready: boolean; storageError: string | null; deletingIds: readonly string[] }
export function conversationState(entry: ConversationEntry) {
  if (entry.session.getSnapshot().phase !== 'idle' || entry.data?.tasks.some(task => task.status === 'running')) return 'running'
  if (entry.data?.tasks.some(task => task.status === 'blocked')) return 'blocked'
  if (entry.data?.tasks.length && entry.data.tasks.every(task => task.status === 'completed')) return 'completed'
  return 'queued'
}

/** Conversation streams live independently of the selected transcript. */
export class ChatWorkspace {
  readonly source: OfficeChatSource
  readonly teamId: string
  readonly ready: Promise<void>
  private entries = new Map<string, ConversationEntry>()
  private archives = new Map<string, ChatArchive>()
  private deletedIds = new Set<string>()
  private unsubscribers = new Map<string, () => void>()
  private removals = new Map<string, Promise<void>>()
  private state: ChatWorkspaceSnapshot = { conversations: [], selectedId: '', ready: false, storageError: null, deletingIds: [] }
  private listeners = new Set<() => void>()
  private readonly persistence?: ChatWorkspacePersistence
  private persisted: unknown
  private blocked = false
  private dirty = false
  private saving?: Promise<void>
  private saveTimer?: ReturnType<typeof setTimeout>
  private catalogue: readonly DashboardConversation[] = []
  private readonly requestDelete?: (id: string) => Promise<void>
  private readonly onRemoved?: (id: string) => void

  constructor(teamId: string, source: OfficeChatSource, options: { persistence?: ChatWorkspacePersistence; requestDelete?: (id: string) => Promise<void>; onRemoved?: (id: string) => void } = {}) {
    this.teamId = teamId; this.source = source; this.persistence = options.persistence
    this.requestDelete = options.requestDelete
    this.onRemoved = options.onRemoved
    this.ready = this.restore()
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  get selected() { return this.entries.get(this.state.selectedId)?.session }
  requiresBackendDeletion(id: string) { return Boolean(this.requestDelete && this.entries.get(id)?.data) }
  private emit(change: Partial<ChatWorkspaceSnapshot> = {}) {
    this.state = { ...this.state, ...change, conversations: [...this.entries.values()] }
    notifySubscribers(this.listeners, 'ChatWorkspace')
  }
  private async restore() {
    try {
      const value = await this.persistence?.read()
      this.persisted = value
      if (value !== undefined) {
        const archive = chatWorkspaceArchiveSchema.parse(value)
        if (archive.teamId !== this.teamId) throw new Error('会话不属于当前办公室')
        this.deletedIds = new Set(archive.deletedIds)
        for (const entry of archive.conversations) this.add(entry.id, entry.title, entry.local, entry.chat)
        this.state = { ...this.state, selectedId: archive.selectedId }
        await Promise.all([...this.entries.values()].map(entry => entry.session.ready))
      }
    } catch {
      this.blocked = true
      this.state = { ...this.state, storageError: '会话记录无法读取，原记录未覆盖；本次会话仅临时保留。' }
    }
    this.emit({ ready: true })
    this.sync(this.catalogue)
  }
  private add(id: string, title: string, local: boolean, archive?: ChatArchive) {
    const initial: ChatArchive = archive ?? { version: 1, teamId: this.teamId, conversationId: id, draft: '', activeTurnId: '',
      messages: (this.source instanceof PreviewChatSource && this.teamId === 'office-1' ? this.source.initialHistory(id) : []).map(message => ({ ...message, id: crypto.randomUUID(), state: 'complete' as const })) }
    this.archives.set(id, initial)
    const session = new ChatSession(this.teamId, this.source, { conversationId: id, syncOnRestore: false, persistence: {
      read: async () => initial,
      write: async next => { if (this.entries.get(id)?.session !== session) return; this.archives.set(id, next); this.scheduleSave(); await this.flush() },
    } })
    const entry: ConversationEntry = { id, title, session, local }
    this.entries.set(id, entry)
    this.unsubscribers.set(id, session.subscribe(() => {
      if (entry.local && entry.title === '新会话') {
        const message = session.getSnapshot().messages.find(message => message.role === 'user')
        if (message) { entry.title = message.content.trim().replace(/\s+/g, ' ').slice(0, 36) || '新会话'; this.scheduleSave() }
      }
      this.emit()
    }))
    return entry
  }
  sync(conversations: readonly DashboardConversation[]) {
    this.catalogue = conversations
    if (!this.state.ready) return
    let changed = false
    const remote = new Set(conversations.map(item => item.id))
    for (const entry of this.entries.values()) {
      // Keep archived transcripts, but never leave removed business state visible.
      if (!remote.has(entry.id) && entry.data) { entry.data = undefined; changed = true }
    }
    for (const data of conversations) {
      if (this.deletedIds.has(data.id)) continue
      if (!this.entries.has(data.id)) changed = true
      const entry = this.entries.get(data.id) ?? this.add(data.id, data.title, false)
      if (entry.title !== data.title || entry.local) changed = true
      entry.title = data.title; entry.local = false; entry.data = data
    }
    let selectedId = this.state.selectedId
    if (!this.entries.has(selectedId)) selectedId = this.entries.keys().next().value ?? ''
    this.emit({ selectedId })
    void this.selected?.synchronize()
    if (changed) this.scheduleSave()
  }
  select(id: string) {
    if (!this.state.ready || !this.entries.has(id) || this.state.selectedId === id) return
    this.emit({ selectedId: id }); this.scheduleSave(); void this.selected?.synchronize(true)
  }
  create() {
    if (!this.state.ready) return
    const empty = [...this.entries.values()].find(entry => entry.local && entry.session.getSnapshot().messages.length === 0 && !entry.session.getSnapshot().draft)
    const entry = empty ?? this.add(crypto.randomUUID(), '新会话', true)
    this.emit({ selectedId: entry.id }); this.scheduleSave(); void entry.session.synchronize()
    return entry.id
  }
  remove(id: string): Promise<void> {
    const pending = this.removals.get(id)
    if (pending) return pending
    const entry = this.entries.get(id)
    if (!this.state.ready || !entry) return Promise.reject(new Error('会话不存在或尚未恢复'))
    if (this.blocked) return Promise.reject(new Error('会话存档当前不可写，请刷新后重试'))
    const removal = Promise.resolve().then(async () => {
      if (entry.data) await this.requestDelete?.(id)
      if ((!entry.data || !this.requestDelete) && !await entry.session.stop()) throw new Error('停止生成未确认，未删除会话；请重新同步后重试')
      if (this.entries.get(id) !== entry) return
      const ids = [...this.entries.keys()], index = ids.indexOf(id)
      this.unsubscribers.get(id)?.(); this.unsubscribers.delete(id)
      this.entries.delete(id); this.archives.delete(id); this.deletedIds.add(id)
      entry.session.dispose()
      this.onRemoved?.(id)
      this.emit({ selectedId: this.state.selectedId === id ? ids[index + 1] ?? ids[index - 1] ?? '' : this.state.selectedId })
      this.scheduleSave(); await this.flush()
      if (this.state.storageError) throw new Error('会话已从本页移除，但未能保存删除结果，请勿立即刷新')
    }).finally(() => { this.removals.delete(id); this.emit({ deletingIds: [...this.removals.keys()] }) })
    this.removals.set(id, removal); this.emit({ deletingIds: [...this.removals.keys()] })
    return removal
  }
  private scheduleSave() {
    if (!this.state.ready || !this.persistence || this.blocked) return
    this.dirty = true
    this.saveTimer ??= setTimeout(() => { void this.flush() }, 300)
  }
  flush = (): Promise<void> => {
    clearTimeout(this.saveTimer); this.saveTimer = undefined
    if (this.saving) return this.saving
    if (!this.dirty || !this.persistence || this.blocked) return Promise.resolve()
    this.saving = this.save().finally(() => { this.saving = undefined })
    return this.saving
  }
  private async save() {
    while (this.dirty && this.persistence && !this.blocked) {
      this.dirty = false
      const archive: ChatWorkspaceArchive = { version: 2, teamId: this.teamId, selectedId: this.state.selectedId,
        deletedIds: [...this.deletedIds],
        conversations: [...this.entries.values()].map(({ id, title, local }) => ({ id, title, local, chat: this.archives.get(id)! })) }
      try { await this.persistence.write(archive, this.persisted); this.persisted = archive; if (this.state.storageError) this.emit({ storageError: null }) }
      catch (error) {
        this.dirty = true
        if (error instanceof Error && 'code' in error && error.code === 'CHAT_STORAGE_CONFLICT') this.blocked = true
        this.emit({ storageError: this.blocked ? '会话已被其他页面更新，未覆盖存档；本页内容仅临时保留。' : '会话保存失败，刷新可能丢失最近内容。' })
        return
      }
    }
  }
  stop() { for (const entry of this.entries.values()) entry.session.detach(); void this.flush() }
}
