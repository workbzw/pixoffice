import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

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
  const valid = { version: 1, teamId: 'test-team', conversationId: 'chat', draft: '', messages: [] }
  const invalid = [null, { ...valid, draft: null }, { ...valid, messages: [null] }]
  for (const archive of invalid) await assert.rejects(persistence.write(archive, undefined))
  assert.equal(opens, 0, 'invalid data cannot open a write transaction')
  for (const archive of invalid) { stored = archive; await assert.rejects(persistence.read()) }
  stored = valid
  assert.deepEqual(await persistence.read(), valid)
  stored = undefined
  assert.equal(await persistence.read(), undefined)
})
