import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { chatPath } from '@pixoffice/protocol/chat'
import { createExampleChatServer } from '../integration/clients/chat-server.mjs'

const office = { schemaVersion: '1.0', seq: 1, workspace: { id: 'chat-office', name: 'Chat office' } }
const payload = { version: '1.0', type: 'send', turnId: 'turn-a', teamId: 'chat-office', conversationId: 'conversation-a', messages: [{ role: 'user', content: 'Hello' }] }
const post = (app, body, headers = { authorization: `Bearer ${DEMO_API_KEY}` }) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers, payload: body })
const initialize = (app, url) => post(app, { type: 'offices.initialize', offices: [office], ...(url === undefined ? {} : { chat: { url } }) })
const events = text => text.trim().split('\n').map(line => JSON.parse(line))
async function setup(t, handler, options = {}) {
  const upstream = createServer(handler)
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/chat`
  const app = await createPixOfficeServer(options), base = await app.listen({ port: 0, host: '127.0.0.1' })
  t.after(async () => {
    await app.close()
    upstream.closeAllConnections()
    await new Promise(resolve => upstream.close(resolve))
  })
  return { app, base, upstreamUrl }
}
const chat = (base, options = {}) => fetch(`${base}${chatPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), ...options })

test('backend initialization registers a streaming chat service without any browser build setting', async t => {
  const requests = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const { app, base, upstreamUrl } = await setup(t, async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push({ body: JSON.parse(body), headers: request.headers })
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write('{"type":"status","phase":"thinking"}\n')
    await gate
    const bytes = Buffer.from('{"type":"delta","text":"## 中文回复"}\n{"type":"done"}')
    for (let i = 0; i < bytes.length; i += 2) response.write(bytes.subarray(i, i + 2))
    response.end()
  })
  t.after(() => release())
  assert.equal((await initialize(app, upstreamUrl)).statusCode, 202, 'chat registration works while the browser is offline')
  const response = await chat(base, { headers: { 'Content-Type': 'application/json', Cookie: 'viewer=private', Authorization: 'Bearer browser-secret' } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/)
  const reader = response.body.getReader(), first = await reader.read()
  assert.match(new TextDecoder().decode(first.value), /thinking/, 'the first event arrives before the answer completes')
  release()
  let text = ''
  for (;;) { const value = await reader.read(); if (value.done) break; text += new TextDecoder().decode(value.value) }
  assert.deepEqual(events(text), [{ type: 'delta', text: '## 中文回复' }, { type: 'done' }])
  assert.deepEqual(requests[0].body, payload)
  assert.equal(requests[0].headers.authorization, undefined)
  assert.equal(requests[0].headers.cookie, undefined)
})

test('chat configuration changes take effect immediately, omitted config is retained and empty URL disables chat', async t => {
  const paths = []
  const { app, base, upstreamUrl } = await setup(t, (request, response) => {
    paths.push(request.url)
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.end('{"type":"delta","text":"OK"}\n{"type":"done"}\n')
  })
  await initialize(app, upstreamUrl)
  await (await chat(base)).text()
  await post(app, { type: 'offices.initialize', offices: [], chat: { url: `${upstreamUrl}/new` } })
  await (await chat(base)).text()
  await initialize(app)
  await (await chat(base)).text()
  assert.deepEqual(paths, ['/chat', '/chat/new', '/chat/new'])
  const invalid = await post(app, { type: 'offices.initialize', offices: [{ ...office, seq: 2, conversations: [{ id: 'main', title: 'Main', employees: [{ id: 'bad', name: 'Bad', sceneActorId: 'missing' }] }] }], chat: { url: '' } })
  assert.equal(invalid.statusCode, 422)
  assert.equal((await chat(base)).status, 200, 'rejected initialization cannot change registered configuration')
  await post(app, { type: 'offices.initialize', offices: [], chat: { url: '' } })
  const disabled = await chat(base)
  assert.equal(disabled.status, 503)
  assert.equal((await disabled.json()).data.reasonCode, 'CHAT_NOT_CONFIGURED')
})

test('chat validates initialization authority, URLs, office ownership, request values and browser origin', async t => {
  let calls = 0
  const { app, base, upstreamUrl } = await setup(t, (_request, response) => { calls++; response.end() })
  assert.equal((await initialize(app)).statusCode, 202)
  const unconfigured = await chat(base)
  assert.equal((await unconfigured.json()).data.reasonCode, 'CHAT_NOT_CONFIGURED')
  assert.equal((await post(app, { type: 'offices.initialize', offices: [], chat: { url: upstreamUrl } }, {})).statusCode, 401)
  for (const url of [null, '/chat', 'ftp://example.com/chat', 'https://user:secret@example.com/chat', 'https://example.com/chat#fragment']) {
    assert.equal((await post(app, { type: 'offices.initialize', offices: [], chat: { url } })).statusCode, 400)
  }
  await initialize(app, upstreamUrl)
  for (const [body, status] of [[{ ...payload, teamId: 'missing' }, 404], [{ ...payload, messages: null }, 400], [{ ...payload, messages: [{ role: 'user', content: null }] }, 400]]) {
    assert.equal((await chat(base, { body: JSON.stringify(body) })).status, status)
  }
  assert.equal((await chat(base, { headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example', 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
  assert.equal(calls, 0)
})

test('upstream HTTP failures, wrong response types and redirects return structured errors', async t => {
  for (const kind of ['http', 'content-type', 'redirect']) {
    const { app, base, upstreamUrl } = await setup(t, (_request, response) => {
      response.writeHead(kind === 'http' ? 401 : kind === 'redirect' ? 302 : 200, kind === 'redirect' ? { Location: '/other' } : { 'Content-Type': 'text/plain' })
      response.end('private backend error')
    })
    await initialize(app, upstreamUrl)
    const response = await chat(base), body = await response.json()
    assert.equal(response.status, 502)
    assert.equal(body.code, 502)
    assert.equal(body.data.reasonCode, 'CHAT_UPSTREAM_ERROR')
    assert.doesNotMatch(JSON.stringify(body), /private backend error/)
  }
})

test('invalid, null-containing, oversized and truncated upstream events produce a terminal stream error', async t => {
  for (const body of ['{"type":"delta","text":null}\n', '{bad json}\n', '{"type":"delta","text":"partial"}\n', 'x'.repeat(32001)]) {
    const { app, base, upstreamUrl } = await setup(t, (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); response.end(body)
    })
    await initialize(app, upstreamUrl)
    const response = await chat(base), received = events(await response.text())
    assert.equal(received.at(-1).type, 'error')
    assert.doesNotMatch(JSON.stringify(received), /:null/)
  }
})

test('chat timeout cancels upstream before headers and after streaming has started', async t => {
  for (const started of [false, true]) {
    const { app, base, upstreamUrl } = await setup(t, (_request, response) => {
      if (started) { response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); response.write('{"type":"status","phase":"thinking"}\n') }
    }, { chatTimeoutMs: 50 })
    await initialize(app, upstreamUrl)
    const response = await chat(base)
    if (started) {
      const received = events(await response.text())
      assert.equal(received.at(-1).type, 'error'); assert.match(received.at(-1).message, /超时/)
    } else {
      assert.equal(response.status, 504)
      assert.equal((await response.json()).data.reasonCode, 'CHAT_TIMEOUT')
    }
  }
})

test('stopping browser chat closes the upstream request and does not block the next chat', async t => {
  let closed, calls = 0
  const upstreamClosed = new Promise(resolve => { closed = resolve })
  const { app, base, upstreamUrl } = await setup(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    if (++calls === 1) { response.once('close', closed); response.write('{"type":"delta","text":"first"}\n') }
    else response.end('{"type":"delta","text":"second"}\n{"type":"done"}\n')
  })
  await initialize(app, upstreamUrl)
  const controller = new AbortController(), first = await chat(base, { signal: controller.signal })
  const reader = first.body.getReader()
  await reader.read(); controller.abort(); await reader.cancel().catch(() => {})
  await Promise.race([upstreamClosed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Upstream was not cancelled')), 2000); timer.unref() })])
  assert.deepEqual(events(await (await chat(base)).text()), [{ type: 'delta', text: 'second' }, { type: 'done' }])
})

test('history pages and refreshed receivers use the same continuing backend turn; cancel is explicit', async t => {
  const engine = createExampleChatServer({ seedTurns: 60, chunkDelayMs: 20, replyText: '长回复内容。'.repeat(15) })
  const upstream = await engine.listen({ host: '127.0.0.1', port: 0 })
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(async () => { await app.close(); await engine.close() })
  await initialize(app, `${upstream}/chat`)
  const operation = (data, options = {}) => chat(base, { body: JSON.stringify({ version: '1.0', teamId: 'chat-office', conversationId: 'conversation-a', ...data }), ...options })
  const history = async cursor => (await (await operation({ type: 'history', cursor, limit: 20 })).json()).data
  const recent = await history(''), older = await history(recent.nextCursor)
  assert.equal(recent.turns[0].id, 'seed-40'); assert.equal(older.turns[0].id, 'seed-20')
  const controller = new AbortController()
  const started = await operation({ type: 'send', turnId: 'long-turn', messages: [{ role: 'user', content: '继续生成' }] }, { signal: controller.signal })
  const first = started.body.getReader(); await first.read(); controller.abort(); await first.cancel().catch(() => {})
  await new Promise(resolve => setTimeout(resolve, 70))
  const checkpoint = await history('')
  assert.equal(checkpoint.activeTurnId, 'long-turn'); assert(checkpoint.turns.at(-1).assistant.length > 0)
  const resumed = await operation({ type: 'resume', turnId: 'long-turn' }), reader = resumed.body.getReader()
  const initial = new TextDecoder().decode((await reader.read()).value)
  assert.match(initial, /"type":"snapshot"/)
  const stopped = await operation({ type: 'cancel', turnId: 'long-turn' })
  assert.deepEqual((await stopped.json()).data, { stopped: true })
  let rest = ''; for (;;) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value) }
  assert.match(rest, /"state":"stopped"/)
  const saved = await history('')
  assert.equal(saved.activeTurnId, ''); assert.equal(saved.turns.at(-1).state, 'stopped')
  assert.equal(saved.turns.filter(turn => turn.id === 'long-turn').length, 1)
})

test('chat control responses reject null history and resume streams require a complete first snapshot', async t => {
  const { app, base, upstreamUrl } = await setup(t, async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk
    const input = JSON.parse(text)
    response.writeHead(200, { 'Content-Type': input.type === 'resume' ? 'application/x-ndjson' : 'application/json' })
    response.end(input.type === 'resume' ? '{"type":"delta","text":"missing snapshot"}\n{"type":"done"}\n' : JSON.stringify({ code: 200, msg: 'OK', data: { turns: null, nextCursor: '', hasMore: false, activeTurnId: '' } }))
  })
  await initialize(app, upstreamUrl)
  const json = await chat(base, { body: JSON.stringify({ version: '1.0', type: 'history', teamId: 'chat-office', conversationId: 'conversation-a', cursor: '', limit: 20 }) })
  assert.equal(json.status, 502)
  const stream = await chat(base, { body: JSON.stringify({ version: '1.0', type: 'resume', teamId: 'chat-office', conversationId: 'conversation-a', turnId: 'turn' }) })
  assert.equal(events(await stream.text())[0].type, 'error')
})
