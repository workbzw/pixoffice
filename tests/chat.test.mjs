import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, ChatSession, HttpChatSource, ChatStorageConflict
before(async () => {
  server = await createTestServer()
  ;({ ChatSession } = await server.ssrLoadModule('/example/office-web/src/chat/ChatSession.ts'))
  ;({ HttpChatSource } = await server.ssrLoadModule('/example/office-web/src/chat/sources.ts'))
  ;({ ChatStorageConflict } = await server.ssrLoadModule('/example/office-web/src/chat/persistence.ts'))
})
after(() => server?.close())

test('chat follows actual stream states and returns to idle on completion', async () => {
  const phases = [], requests = []
  const session = new ChatSession('team-a', { kind: 'test', async *stream(request) {
    requests.push(request)
    yield { type: 'status', phase: 'thinking' }
    yield { type: 'delta', text: '你好' }
    yield { type: 'delta', text: '，世界' }
    yield { type: 'done' }
  } })
  session.subscribe(() => phases.push(session.getSnapshot().phase))
  await session.send('问题一')
  assert.equal(requests[0].teamId, 'team-a')
  assert.ok(phases.includes('thinking')); assert.ok(phases.includes('streaming'))
  assert.equal(session.getSnapshot().phase, 'idle')
  assert.equal(session.getSnapshot().messages.at(-1).content, '你好，世界')
  await session.send('问题二')
  assert.deepEqual(requests[1].messages.map(m => m.role), ['user', 'assistant', 'user'])
  assert.equal(requests[1].conversationId, requests[0].conversationId)
  session.clear()
  await session.send('新问题')
  assert.notEqual(requests[2].conversationId, requests[0].conversationId)
  assert.equal(requests[2].messages.length, 1)
})

test('stop clears busy immediately and ignores late replies; no duplicate sends', async () => {
  let resume, signal
  const wait = new Promise(resolve => { resume = resolve })
  const session = new ChatSession('team-a', { kind: 'test', async *stream(_request, incoming) {
    signal = incoming
    await wait
    yield { type: 'delta', text: 'late' }
    yield { type: 'done' }
  } })
  const pending = session.send('first')
  await session.send('duplicate')
  assert.equal(session.getSnapshot().messages.length, 2)
  session.stop()
  assert.equal(signal.aborted, true)
  assert.equal(session.getSnapshot().phase, 'idle')
  resume(); await pending
  assert.equal(session.getSnapshot().messages.at(-1).content, '')
  assert.equal(session.getSnapshot().messages.at(-1).state, 'stopped')
})

test('failed, empty and truncated responses never remain busy', async () => {
  for (const events of [[{ type: 'error', message: '模型暂不可用' }], [{ type: 'done' }], [{ type: 'delta', text: '部分回复' }]]) {
    const session = new ChatSession('team-a', { kind: 'test', async *stream() { yield* events } })
    await session.send('test')
    assert.equal(session.getSnapshot().phase, 'idle')
    assert.ok(session.getSnapshot().error)
    assert.equal(session.getSnapshot().messages.at(-1).state, 'error')
  }
})

test('timeout stops busy even when the source ignores cancellation', async () => {
  let resume
  const wait = new Promise(resolve => { resume = resolve })
  const session = new ChatSession('team-a', { kind: 'test', async *stream() { await wait; yield { type: 'done' } } }, { timeoutMs: 15 })
  const pending = session.send('timeout')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(session.getSnapshot().phase, 'idle')
  assert.match(session.getSnapshot().error, /超时/)
  resume(); await pending
})

test('HTTP chat handles split UTF-8 and final NDJSON line without a newline', async () => {
  const oldFetch = globalThis.fetch
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.method, 'POST')
      assert.equal(JSON.parse(options.body).teamId, 'team-a')
      const bytes = new TextEncoder().encode('{"type":"delta","text":"中文"}\n{"type":"done"}')
      return new Response(new ReadableStream({ start(controller) {
        for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2))
        controller.close()
      } }), { headers: { 'content-type': 'application/x-ndjson' } })
    }
    const events = []
    for await (const event of new HttpChatSource('http://localhost/chat').stream({ version: '1.0', type: 'send', turnId: 'turn', teamId: 'team-a', conversationId: 'test', messages: [] }, new AbortController().signal)) events.push(event)
    assert.deepEqual(events, [{ type: 'delta', text: '中文' }, { type: 'done' }])
  } finally { globalThis.fetch = oldFetch }
})

test('HTTP chat cancels the reader after done instead of waiting for the connection to close', async () => {
  const oldFetch = globalThis.fetch
  let cancelled = false
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"type":"done"}\n'))
    }, cancel() { cancelled = true } }), { headers: { 'content-type': 'application/x-ndjson' } })
    for await (const event of new HttpChatSource('http://localhost/chat').stream({ version: '1.0', type: 'send', turnId: 'turn', teamId: 'team-a', conversationId: 'test', messages: [] }, new AbortController().signal)) assert.equal(event.type, 'done')
    assert.equal(cancelled, true)
  } finally { globalThis.fetch = oldFetch }
})

test('a stopped request cannot affect its successor or enter the next request context', async () => {
  let resume, calls = 0
  const wait = new Promise(resolve => { resume = resolve })
  const session = new ChatSession('team-a', { kind: 'test', async *stream(request) {
    calls++
    if (calls === 1) { await wait; yield { type: 'delta', text: 'old' } }
    else { assert.deepEqual(request.messages, [{ role: 'user', content: 'second' }]); yield { type: 'delta', text: 'new' } }
    yield { type: 'done' }
  } })
  const old = session.send('first')
  session.stop()
  await session.send('second')
  resume(); await old
  assert.equal(session.getSnapshot().messages.at(-1).content, 'new')
  assert.equal(session.getSnapshot().messages.at(-1).state, 'complete')
  assert.equal(session.getSnapshot().phase, 'idle')
})

const echoSource = { kind: 'test', async *stream(request) { yield { type: 'delta', text: `answer:${request.teamId}` }; yield { type: 'done' } } }
function memoryPersistence() {
  let archive
  return { read: async () => structuredClone(archive), write: async value => { archive = structuredClone(value) } }
}

test('each team restores its complete conversation, draft and conversation ID independently', async t => {
  const storageA = memoryPersistence(), storageB = memoryPersistence()
  const a = new ChatSession('a', echoSource, { persistence: storageA }), b = new ChatSession('b', echoSource, { persistence: storageB })
  t.after(() => { a.dispose(); b.dispose() })
  await a.ready; await b.ready
  for (let i = 0; i < 12; i++) await a.send(`question:${i}`)
  a.setDraft('A unfinished draft'); b.setDraft('B unfinished draft')
  await a.flush(); await b.flush()
  const conversationId = (await storageA.read()).conversationId
  const restored = new ChatSession('a', echoSource, { persistence: storageA })
  t.after(() => restored.dispose())
  await restored.ready
  assert.equal(restored.getSnapshot().messages.length, 24, 'persistence must not use the smaller model-context window')
  assert.equal(restored.getSnapshot().draft, 'A unfinished draft')
  await restored.send('resume')
  assert.equal((await storageA.read()).conversationId, conversationId)
  assert.equal((await storageB.read()).messages.length, 0)
  assert.equal((await storageB.read()).draft, 'B unfinished draft')
})

test('unmounting a team view cannot stop its stream or lose its draft', async t => {
  let resume
  const wait = new Promise(resolve => { resume = resolve })
  const a = new ChatSession('a', { kind: 'test', async *stream() {
    yield { type: 'delta', text: 'first' }; await wait; yield { type: 'delta', text: '-second' }; yield { type: 'done' }
  } }), b = new ChatSession('b', echoSource)
  t.after(() => { a.dispose(); b.dispose() })
  const unmount = a.subscribe(() => {})
  const pending = a.send('A question')
  await new Promise(resolve => setImmediate(resolve))
  unmount(); a.setDraft('A next question')
  await b.send('B question')
  assert.equal(a.getSnapshot().phase, 'streaming')
  resume(); await pending
  assert.equal(a.getSnapshot().messages.at(-1).content, 'first-second')
  assert.equal(a.getSnapshot().draft, 'A next question')
  assert.equal(b.getSnapshot().messages.at(-1).content, 'answer:b')
})

test('refresh restores a partial answer as interrupted, never as a resumed stream', async t => {
  let resume
  const wait = new Promise(resolve => { resume = resolve }), storage = memoryPersistence()
  const session = new ChatSession('a', { kind: 'test', async *stream() {
    yield { type: 'delta', text: 'partial' }; await wait; yield { type: 'done' }
  } }, { persistence: storage })
  await session.ready
  const pending = session.send('question')
  await new Promise(resolve => setImmediate(resolve)); await session.flush()
  const checkpoint = await storage.read()
  let writes = 0
  const restored = new ChatSession('a', { kind: 'test', async *stream() { throw new Error('must not auto-resume') } }, {
    persistence: { read: async () => checkpoint, write: async () => { writes++ } },
  })
  t.after(() => restored.dispose())
  await restored.ready
  assert.equal(restored.getSnapshot().phase, 'idle')
  assert.equal(restored.getSnapshot().messages.at(-1).state, 'stopped')
  assert.equal(restored.getSnapshot().messages.at(-1).content, 'partial')
  await restored.flush(); assert.equal(writes, 1)
  session.stop(); resume(); await pending
})

test('failed reads preserve the original archive, and failed writes keep visible conversation data', async t => {
  let writes = 0
  const broken = new ChatSession('a', echoSource, { persistence: { read: async () => ({ invalid: true }), write: async () => { writes++ } } })
  t.after(() => broken.dispose()); await broken.ready
  await broken.send('temporary question'); await broken.flush()
  assert.equal(writes, 0)
  assert.match(broken.getSnapshot().storageError, /原记录未覆盖/)
  const quota = new ChatSession('b', echoSource, { persistence: { read: async () => undefined, write: async () => { throw new Error('quota') } } })
  t.after(() => quota.dispose()); await quota.ready
  await quota.send('keep me')
  assert.equal(quota.getSnapshot().messages.at(-1).content, 'answer:b')
  assert.match(quota.getSnapshot().storageError, /保存失败/)
})

test('serialized saves cannot overwrite a cleared conversation with an older write', async t => {
  let resume, archive, first = true
  const wait = new Promise(resolve => { resume = resolve })
  const session = new ChatSession('a', echoSource, { persistence: {
    read: async () => undefined,
    async write(value) { if (first) { first = false; await wait }; archive = structuredClone(value) },
  } })
  t.after(() => session.dispose()); await session.ready
  session.setDraft('old draft')
  const saving = session.flush()
  session.clear(); session.setDraft('new draft')
  resume(); await saving
  assert.equal(archive.draft, 'new draft')
  assert.deepEqual(archive.messages, [])
})

test('a stale page cannot replace another page history with its old draft', async t => {
  let archive
  const persistence = () => ({
    read: async () => structuredClone(archive),
    async write(value, expected) {
      if (JSON.stringify(archive) !== JSON.stringify(expected)) throw new ChatStorageConflict()
      archive = structuredClone(value)
    },
  })
  const a = new ChatSession('a', echoSource, { persistence: persistence() })
  const b = new ChatSession('a', echoSource, { persistence: persistence() })
  t.after(() => { a.dispose(); b.dispose() })
  await a.ready; await b.ready
  await a.send('keep this conversation')
  const saved = structuredClone(archive)
  b.setDraft('a stale page draft'); await b.flush()
  assert.deepEqual(archive, saved)
  assert.equal(b.getSnapshot().draft, 'a stale page draft', 'unsaved content remains visible')
  assert.match(b.getSnapshot().storageError, /其他页面更新/)
  await b.send('a temporary question'); await b.flush()
  assert.deepEqual(archive, saved, 'a conflicting page stays unable to overwrite the saved history')
  a.setDraft('fresh draft'); await a.flush()
  assert.equal(archive.draft, 'fresh draft')
})

test('a temporary save failure keeps pending data and retries on the next flush', async t => {
  let available = false, writes = 0, archive
  const session = new ChatSession('a', echoSource, { persistence: {
    read: async () => undefined,
    async write(value, expected) {
      writes++
      assert.deepEqual(expected, archive)
      if (!available) throw new Error('temporarily unavailable')
      archive = structuredClone(value)
    },
  } })
  t.after(() => session.dispose()); await session.ready
  session.setDraft('save after recovery'); await session.flush()
  assert.equal(writes, 1); assert.match(session.getSnapshot().storageError, /保存失败/)
  available = true; await session.flush()
  assert.equal(writes, 2); assert.equal(archive.draft, 'save after recovery')
  assert.equal(session.getSnapshot().storageError, null)
  await session.send('next question')
  assert.equal(archive.messages.length, 2, 'successful retries advance the expected archive')
})

test('closing a read-only page does not manufacture a competing storage write', async () => {
  let writes = 0
  const session = new ChatSession('a', echoSource, { persistence: { read: async () => undefined, write: async () => { writes++ } } })
  await session.ready; session.dispose(); await session.flush()
  assert.equal(writes, 0)
})

test('storage conflict codes survive adapter reloads without relying on class identity', async t => {
  const session = new ChatSession('a', echoSource, { persistence: {
    read: async () => undefined,
    write: async () => { throw Object.assign(new Error('another adapter instance'), { code: 'CHAT_STORAGE_CONFLICT' }) },
  } })
  t.after(() => session.dispose()); await session.ready
  session.setDraft('keep in memory'); await session.flush()
  assert.match(session.getSnapshot().storageError, /其他页面更新/)
})

test('reading a conversation does not schedule writes from abandoned render instances', async () => {
  let writes = 0
  const session = new ChatSession('a', echoSource, { persistence: { read: async () => undefined, write: async () => { writes++ } } })
  await session.ready; await session.flush()
  assert.equal(writes, 0)
  session.setDraft('a real edit'); await session.flush()
  assert.equal(writes, 1)
  session.dispose(); await session.flush()
})

test('HTTP chat rejects wrong content, malformed events, oversized lines and interrupted streams', async () => {
  const oldFetch = globalThis.fetch
  try {
    for (const [body, type] of [['<html>error</html>', 'text/html'], ['{"type":"unknown"}\n', 'application/x-ndjson'], ['x'.repeat(350001), 'application/x-ndjson'], ['{"type":"delta","text":"half"}\n', 'application/x-ndjson']]) {
      globalThis.fetch = async () => new Response(body, { headers: { 'content-type': type } })
      await assert.rejects(async () => { for await (const event of new HttpChatSource('http://localhost/chat').stream({ version: '1.0', type: 'send', turnId: 'turn', teamId: 'team-a', conversationId: 'test', messages: [] }, new AbortController().signal)) void event })
    }
  } finally { globalThis.fetch = oldFetch }
})
