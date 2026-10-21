import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { chatPath } from '@pixoffice/protocol/chat'

const office = { schemaVersion: '1.0', seq: 1, workspace: { id: 'chat-office', name: 'Chat office' } }
const payload = { version: '1.0', teamId: 'chat-office', conversationId: 'conversation-a', messages: [{ role: 'user', content: 'Hello' }] }
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
  const invalid = await post(app, { type: 'offices.initialize', offices: [{ ...office, seq: 2, employees: [{ id: 'bad', name: 'Bad', sceneActorId: 'missing' }] }], chat: { url: '' } })
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
