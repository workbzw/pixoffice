import { z } from 'zod'
import { canonical } from '@pixoffice/protocol'

export const chatArchiveSchema = z.strictObject({
  version: z.literal(1), teamId: z.string().min(1), conversationId: z.string().min(1), draft: z.string().max(4000),
  activeTurnId: z.string().max(100).default(''),
  messages: z.array(z.strictObject({
    id: z.string().min(1), role: z.enum(['user', 'assistant']), content: z.string().max(50000),
    state: z.enum(['complete', 'pending', 'stopped', 'error']),
  })),
})
export type ChatArchive = z.infer<typeof chatArchiveSchema>
export interface ChatPersistence {
  read(): Promise<unknown>
  write(archive: ChatArchive, expected: unknown): Promise<void>
}
export const chatWorkspaceArchiveSchema = z.strictObject({ version: z.literal(2), teamId: z.string().min(1), selectedId: z.string(),
  deletedIds: z.array(z.string().min(1)).default([]),
  conversations: z.array(z.strictObject({ id: z.string().min(1), title: z.string().min(1).max(160), local: z.boolean(), chat: chatArchiveSchema })),
}).superRefine((value, context) => {
  const ids = new Set(value.conversations.map(item => item.id))
  if (ids.size !== value.conversations.length || value.selectedId && !ids.has(value.selectedId)
    || new Set(value.deletedIds).size !== value.deletedIds.length || value.deletedIds.some(id => ids.has(id))
    || value.conversations.some(item => item.chat.teamId !== value.teamId || item.id !== item.chat.conversationId)) context.addIssue({ code: 'custom', message: '会话目录或身份无效' })
})
export type ChatWorkspaceArchive = z.infer<typeof chatWorkspaceArchiveSchema>
export interface ChatWorkspacePersistence {
  read(): Promise<unknown>
  write(archive: ChatWorkspaceArchive, expected: unknown): Promise<void>
}

export class ChatStorageConflict extends Error {
  readonly code = 'CHAT_STORAGE_CONFLICT'
  constructor() { super('Chat storage was updated by another page'); this.name = 'ChatStorageConflict' }
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  if (database) return database
  const opening = Promise.resolve().then(() => new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    const request = indexedDB.open('pixoffice-chat', 2)
    const fail = (error: unknown) => { if (!settled) { settled = true; reject(error) } }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('conversations')) request.result.createObjectStore('conversations')
      if (!request.result.objectStoreNames.contains('chat-pages')) request.result.createObjectStore('chat-pages')
    }
    request.onerror = () => fail(request.error)
    request.onblocked = () => fail(new Error('Chat storage is blocked by another page'))
    request.onsuccess = () => {
      const db = request.result
      if (settled) { db.close(); return }
      settled = true
      db.onversionchange = () => { db.close(); if (database === opening) database = undefined }
      resolve(db)
    }
  })).catch(error => { if (database === opening) database = undefined; throw error })
  database = opening
  return opening
}

export function browserChatPersistence(teamId: string, sourceKey: string): ChatWorkspacePersistence | undefined {
  if (typeof indexedDB === 'undefined') return undefined
  const key = JSON.stringify(['workspace-v2', sourceKey, teamId])
  const pageSize = 50
  const pageSchema = chatArchiveSchema.shape.messages.max(pageSize)
  const storedSchema = z.strictObject({ format: z.literal('pages-v1'), revision: z.number().int().nonnegative(),
    directory: chatWorkspaceArchiveSchema, pages: z.record(z.string(), z.number().int().nonnegative()) })
  const revisions = new WeakMap<object, number>()
  return {
    async read() {
      const db = await openDatabase()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['conversations', 'chat-pages'], 'readonly')
        const request = transaction.objectStore('conversations').get(key)
        let archive: ChatWorkspaceArchive | undefined, revision: number | undefined, failure: unknown
        const chunks = new Map<string, ChatArchive['messages'][]>()
        request.onsuccess = () => {
          try {
            if (request.result === undefined) return
            if (request.result.format !== 'pages-v1') { chatWorkspaceArchiveSchema.parse(request.result); return }
            const stored = storedSchema.parse(request.result); archive = stored.directory; revision = stored.revision
            for (const entry of archive.conversations) {
              const pages: ChatArchive['messages'][] = []; chunks.set(entry.id, pages)
              const count = stored.pages[entry.id]
              if (count === undefined) throw new Error('Chat page directory is incomplete')
              for (let index = 0; index < count; index++) {
                const page = transaction.objectStore('chat-pages').get([key, entry.id, index])
                page.onsuccess = () => { try { pages[index] = pageSchema.parse(page.result) } catch (error) { failure = error; transaction.abort() } }
              }
            }
          } catch (error) { failure = error; transaction.abort() }
        }
        transaction.oncomplete = () => {
          try {
            if (archive) {
              for (const entry of archive.conversations) entry.chat.messages = chunks.get(entry.id)!.flat()
              revisions.set(archive, revision!); resolve(archive)
            } else {
              if (request.result !== undefined) chatWorkspaceArchiveSchema.parse(request.result)
              resolve(request.result)
            }
          }
          catch (error) { reject(error) }
        }
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Chat storage read failed'))
      })
    },
    async write(archive, expected) {
      // Validate small metadata and changed pages; untouched history is never serialized again.
      const directory = chatWorkspaceArchiveSchema.parse({ ...archive, conversations: archive.conversations.map(entry => ({ ...entry, chat: { ...entry.chat, messages: [] } })) })
      const previous = expected as ChatWorkspaceArchive | undefined
      const expectedRevision = expected && typeof expected === 'object' ? revisions.get(expected) : undefined
      const previousEntries = new Map(previous?.conversations.map(entry => [entry.id, entry]) ?? [])
      const pages = Object.fromEntries(archive.conversations.map(entry => [entry.id, Math.ceil(entry.chat.messages.length / pageSize)]))
      const writes: { id: string; index: number; messages: ChatArchive['messages'] }[] = []
      for (const entry of archive.conversations) {
        const before = previousEntries.get(entry.id)?.chat.messages
        if (expectedRevision !== undefined && before === entry.chat.messages) continue
        for (let index = 0; index < pages[entry.id]; index++) {
          const chunk = entry.chat.messages.slice(index * pageSize, (index + 1) * pageSize)
          if (expectedRevision !== undefined && before && before.length >= index * pageSize + chunk.length && chunk.every((message, offset) => message === before[index * pageSize + offset])
            && Math.min(pageSize, before.length - index * pageSize) === chunk.length) continue
          writes.push({ id: entry.id, index, messages: pageSchema.parse(chunk) })
        }
      }
      const revision = (expectedRevision ?? 0) + 1
      const db = await openDatabase()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['conversations', 'chat-pages'], 'readwrite')
        const store = transaction.objectStore('conversations')
        const request = store.get(key)
        let conflict = false
        // Compare and replace in one transaction, without page locks or backend coordination.
        request.onsuccess = () => {
          const current = request.result
          if (expectedRevision !== undefined ? current?.format !== 'pages-v1' || current.revision !== expectedRevision : canonical(current) !== canonical(expected)) { conflict = true; transaction.abort(); return }
          const pageStore = transaction.objectStore('chat-pages')
          for (const write of writes) pageStore.put(write.messages, [key, write.id, write.index])
          for (const entry of previousEntries.values()) {
            const count = Math.ceil(entry.chat.messages.length / pageSize), next = pages[entry.id] ?? 0
            for (let index = next; index < count; index++) pageStore.delete([key, entry.id, index])
          }
          store.put({ format: 'pages-v1', revision, directory, pages }, key)
        }
        transaction.oncomplete = () => { revisions.set(archive, revision); resolve() }
        transaction.onabort = () => reject(conflict ? new ChatStorageConflict() : transaction.error ?? new Error('Chat storage write failed'))
      })
    },
  }
}
