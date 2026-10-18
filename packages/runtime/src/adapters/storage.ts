import type { Persistence } from '../model.ts'
import { canonical } from '@pixoffice/protocol'
import { parseProtocolObject, stringifyDocumentObject } from '@pixoffice/protocol/schema'

export function sceneStorageKey(sceneId: string, productNamespace = 'classic'): string {
  if (!productNamespace.trim() || !sceneId.trim()) throw new Error('Product namespace and scene ID must not be empty')
  return `pixoffice:${encodeURIComponent(productNamespace)}:runtime:v2:${encodeURIComponent(sceneId)}`
}

export function browserPersistence(storage: Storage, sceneId: string, productNamespace?: string): Persistence {
  const key = sceneStorageKey(sceneId, productNamespace)
  return {
    load() { const value = storage.getItem(key); return value === null ? undefined : parseProtocolObject(value) },
    save(checkpoint) { storage.setItem(key, stringifyDocumentObject(checkpoint)) },
    replaceWithBackup(expected, checkpoint) {
      const original = storage.getItem(key)
      if (original === null || canonical(parseProtocolObject(original)) !== canonical(expected)) {
        throw new Error('存档已被其他页面修改，请刷新后重试')
      }
      const replacement = stringifyDocumentObject(checkpoint)
      const backupKey = `${key}:backup:${Date.now()}:${globalThis.crypto.randomUUID()}`
      // Never replace the active save unless its exact original bytes are backed up.
      storage.setItem(backupKey, original)
      storage.setItem(key, replacement)
    },
  }
}
