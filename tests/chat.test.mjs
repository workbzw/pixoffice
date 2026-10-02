import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, ChatSession, HttpChatSource
before(async () => {
  server = await createTestServer()
  ;({ ChatSession } = await server.ssrLoadModule('/src/chat/ChatSession.ts'))
  ;({ HttpChatSource } = await server.ssrLoadModule('/src/chat/sources.ts'))
})
after(() => server?.close())

test('chat follows actual stream states and returns to idle on completion', async () => {
  const phases = [], requests = []
  const session = new ChatSession({ kind: 'test', async *stream(request) {
    requests.push(request)
    yield { type: 'status', phase: 'thinking' }
    yield { type: 'delta', text: '你好' }
    yield { type: 'delta', text: '，世界' }
    yield { type: 'done' }
  } })
  session.subscribe(() => phases.push(session.getSnapshot().phase))
  await session.send('问题一')
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
  const session = new ChatSession({ kind: 'test', async *stream(_request, incoming) {
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
    const session = new ChatSession({ kind: 'test', async *stream() { yield* events } })
    await session.send('test')
    assert.equal(session.getSnapshot().phase, 'idle')
    assert.ok(session.getSnapshot().error)
    assert.equal(session.getSnapshot().messages.at(-1).state, 'error')
  }
})

test('timeout stops busy even when the source ignores cancellation', async () => {
  let resume
  const wait = new Promise(resolve => { resume = resolve })
  const session = new ChatSession({ kind: 'test', async *stream() { await wait; yield { type: 'done' } } }, 15)
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
      const bytes = new TextEncoder().encode('{"type":"delta","text":"中文"}\n{"type":"done"}')
      return new Response(new ReadableStream({ start(controller) {
        for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2))
        controller.close()
      } }), { headers: { 'content-type': 'application/x-ndjson' } })
    }
    const events = []
    for await (const event of new HttpChatSource('http://localhost/chat').stream({ version: '1.0', conversationId: 'test', messages: [] }, new AbortController().signal)) events.push(event)
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
    for await (const event of new HttpChatSource('http://localhost/chat').stream({}, new AbortController().signal)) assert.equal(event.type, 'done')
    assert.equal(cancelled, true)
  } finally { globalThis.fetch = oldFetch }
})

test('a stopped request cannot affect its successor or enter the next request context', async () => {
  let resume, calls = 0
  const wait = new Promise(resolve => { resume = resolve })
  const session = new ChatSession({ kind: 'test', async *stream(request) {
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

test('HTTP chat rejects wrong content, malformed events, oversized lines and interrupted streams', async () => {
  const oldFetch = globalThis.fetch
  try {
    for (const [body, type] of [['<html>error</html>', 'text/html'], ['{"type":"unknown"}\n', 'application/x-ndjson'], ['x'.repeat(32001), 'application/x-ndjson'], ['{"type":"delta","text":"half"}\n', 'application/x-ndjson']]) {
      globalThis.fetch = async () => new Response(body, { headers: { 'content-type': type } })
      await assert.rejects(async () => { for await (const event of new HttpChatSource('http://localhost/chat').stream({}, new AbortController().signal)) void event })
    }
  } finally { globalThis.fetch = oldFetch }
})
