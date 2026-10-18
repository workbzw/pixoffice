import { z } from 'zod'
import { canonical } from '@pixoffice/protocol'

export const chatArchiveSchema = z.strictObject({
  version: z.literal(1), teamId: z.string().min(1), conversationId: z.string().min(1), draft: z.string().max(4000),
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

export class ChatStorageConflict extends Error {
  readonly code = 'CHAT_STORAGE_CONFLICT'
  constructor() { super('Chat storage was updated by another page'); this.name = 'ChatStorageConflict' }
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  if (database) return database
  const opening = Promise.resolve().then(() => new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    const request = indexedDB.open('pixoffice-chat', 1)
    const fail = (error: unknown) => { if (!settled) { settled = true; reject(error) } }
    request.onupgradeneeded = () => request.result.createObjectStore('conversations')
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

export function browserChatPersistence(teamId: string, sourceKey: string): ChatPersistence | undefined {
  if (typeof indexedDB === 'undefined') return undefined
  const key = JSON.stringify([sourceKey, teamId])
  return {
    async read() {
      const db = await openDatabase()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('conversations', 'readonly')
        const request = transaction.objectStore('conversations').get(key)
        transaction.oncomplete = () => {
          try { resolve(request.result === undefined ? undefined : chatArchiveSchema.parse(request.result)) }
          catch (error) { reject(error) }
        }
        transaction.onabort = () => reject(transaction.error ?? new Error('Chat storage read failed'))
      })
    },
    async write(archive, expected) {
      const checked = chatArchiveSchema.parse(archive)
      const db = await openDatabase()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('conversations', 'readwrite')
        const store = transaction.objectStore('conversations')
        const request = store.get(key)
        let conflict = false
        // Compare and replace in one transaction, without page locks or backend coordination.
        request.onsuccess = () => {
          if (canonical(request.result) !== canonical(expected)) { conflict = true; transaction.abort(); return }
          store.put(checked, key)
        }
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(conflict ? new ChatStorageConflict() : transaction.error ?? new Error('Chat storage write failed'))
      })
    },
  }
}
