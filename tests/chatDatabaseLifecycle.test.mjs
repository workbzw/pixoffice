import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'

async function setup(t, factory) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else delete globalThis.indexedDB })
  const server = await createTestServer(); t.after(() => server.close())
  const { browserChatPersistence } = await server.ssrLoadModule('/example/office-web/src/chat/persistence.ts')
  return browserChatPersistence('test-team', 'test-source')
}
function database(read = () => undefined) {
  return { closed: false, close() { this.closed = true }, transaction() {
    const transaction = { objectStore: () => ({ get() {
      const request = { result: read() }
      queueMicrotask(() => transaction.oncomplete?.())
      return request
    } }) }
    return transaction
  } }
}

test('a synchronous IndexedDB open failure does not permanently poison future storage attempts', async t => {
  let calls = 0
  const persistence = await setup(t, { open() {
    if (++calls === 1) throw new Error('temporarily denied')
    const request = { result: database() }
    queueMicrotask(() => request.onsuccess?.())
    return request
  } })
  await assert.rejects(persistence.read(), /temporarily denied/)
  assert.equal(await persistence.read(), undefined)
  assert.equal(calls, 2)
})

test('a blocked open that later succeeds closes its abandoned connection and cannot invalidate a newer one', async t => {
  const requests = []
  const persistence = await setup(t, { open() { const request = { result: database() }; requests.push(request); return request } })
  const first = persistence.read()
  await new Promise(resolve => setImmediate(resolve))
  const rejected = assert.rejects(first, /blocked/)
  requests[0].onblocked(); await rejected
  const second = persistence.read()
  await new Promise(resolve => setImmediate(resolve))
  requests[1].onsuccess(); await second
  requests[0].onsuccess()
  assert.equal(requests[0].result.closed, true)
  requests[0].onerror?.()
  await persistence.read()
  assert.equal(requests.length, 2, 'late callbacks cannot discard the newer cached connection')
  requests[1].result.onversionchange()
  assert.equal(requests[1].result.closed, true)
  const third = persistence.read()
  await new Promise(resolve => setImmediate(resolve))
  requests[2].onsuccess(); await third
  assert.equal(requests.length, 3)
})

test('chat persistence rejects null archives at both read and write boundaries', async t => {
  let stored, opens = 0
  const persistence = await setup(t, { open() {
    opens++
    const request = { result: database(() => stored) }
    queueMicrotask(() => request.onsuccess?.())
    return request
  } })
  const valid = { version: 2, teamId: 'test-team', selectedId: 'chat', conversations: [{ id: 'chat', title: '会话', local: true, chat: { version: 1, teamId: 'test-team', conversationId: 'chat', draft: '', messages: [] } }] }
  const invalid = [null, { ...valid, selectedId: null }, { ...valid, conversations: [null] }]
  for (const archive of invalid) await assert.rejects(persistence.write(archive, undefined))
  assert.equal(opens, 0, 'invalid data cannot open a write transaction')
  for (const archive of invalid) { stored = archive; await assert.rejects(persistence.read()) }
  stored = valid
  assert.deepEqual(await persistence.read(), valid)
  stored = undefined
  assert.equal(await persistence.read(), undefined)
})

test('long histories save only the changed page and retain optimistic conflict protection', async t => {
  const persistence = await setup(t, new IDBFactory())
  const messages = Array.from({ length: 240 }, (_, index) => ({ id: `message-${index}`, role: index % 2 ? 'assistant' : 'user', content: `正文 ${index}`, state: 'complete' }))
  const archive = { version: 2, teamId: 'test-team', selectedId: 'chat', deletedIds: [], conversations: [{ id: 'chat', title: '长会话', local: true,
    chat: { version: 1, teamId: 'test-team', conversationId: 'chat', activeTurnId: '', draft: '', messages } }] }
  await persistence.write(archive, undefined)
  const originalPut = IDBObjectStore.prototype.put, writes = []
  IDBObjectStore.prototype.put = function (value, key) { writes.push({ store: this.name, key }); return originalPut.call(this, value, key) }
  t.after(() => { IDBObjectStore.prototype.put = originalPut })
  const expected = await persistence.read()
  const updated = { ...expected, conversations: expected.conversations.map(entry => ({ ...entry, chat: { ...entry.chat,
    messages: entry.chat.messages.map((message, index) => index === 239 ? { ...message, content: '继续生成的最后一条回复' } : message) } })) }
  await persistence.write(updated, expected)
  assert.equal(writes.filter(write => write.store === 'chat-pages').length, 1)
  const restored = await persistence.read()
  assert.equal(restored.conversations[0].chat.messages.length, 240)
  assert.equal(restored.conversations[0].chat.messages[239].content, '继续生成的最后一条回复')
  await assert.rejects(persistence.write(expected, expected), /another page/)
  writes.length = 0
  const withDraft = { ...updated, conversations: [{ ...updated.conversations[0], chat: { ...updated.conversations[0].chat, draft: '只保存草稿' } }] }
  await persistence.write(withDraft, updated)
  assert.equal(writes.filter(write => write.store === 'chat-pages').length, 0, 'draft changes never rewrite message pages')
  await persistence.write({ ...withDraft, selectedId: '', deletedIds: ['chat'], conversations: [] }, withDraft)
  assert.deepEqual((await persistence.read()).conversations, [])
})

test('an existing complete archive becomes paged storage without dropping any messages', async t => {
  const factory = new IDBFactory(), persistence = await setup(t, factory)
  const legacy = { version: 2, teamId: 'test-team', selectedId: 'chat', conversations: [{ id: 'chat', title: '已保存的会话', local: true,
    chat: { version: 1, teamId: 'test-team', conversationId: 'chat', draft: '', messages: [
      { id: 'u', role: 'user', content: '原问题', state: 'complete' }, { id: 'a', role: 'assistant', content: '原回复', state: 'complete' },
    ] } }] }
  await persistence.read()
  const db = await new Promise((resolve, reject) => { const request = factory.open('pixoffice-chat', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  await new Promise((resolve, reject) => { const transaction = db.transaction('conversations', 'readwrite'); transaction.objectStore('conversations').put(legacy, JSON.stringify(['workspace-v2','test-source','test-team'])); transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error) })
  db.close()
  const expected = await persistence.read()
  await persistence.write(expected, expected)
  assert.deepEqual((await persistence.read()).conversations[0].chat.messages, legacy.conversations[0].chat.messages)
})
