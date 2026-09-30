import type { Persistence } from '../model'
import { canonical } from '../protocol'

export function browserPersistence(storage: Storage, sceneId: string): Persistence {
  const key = `ai-office:plugin-runtime:v1:${sceneId}`
  return {
    load() { const value = storage.getItem(key); return value == null ? null : JSON.parse(value) },
    save(checkpoint) { storage.setItem(key, JSON.stringify(checkpoint)) },
    replaceWithBackup(expected, checkpoint) {
      const original = storage.getItem(key)
      if (original == null || canonical(JSON.parse(original)) !== canonical(expected)) {
        throw new Error('存档已被其他页面修改，请刷新后重试')
      }
      const replacement = JSON.stringify(checkpoint)
      const backupKey = `${key}:backup:${Date.now()}:${globalThis.crypto.randomUUID()}`
      // Never replace the active save unless its exact original bytes are backed up.
      storage.setItem(backupKey, original)
      storage.setItem(key, replacement)
    },
  }
}
