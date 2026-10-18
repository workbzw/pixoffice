import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPixOfficeServer, DEMO_API_KEY, defaultStaticRoot } from '../server/dist/app.js'
import { fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MessageRelay } from '../server/dist/relay.js'

const command = (id = 'one', team = 'office-1') => ({ protocolVersion: '2.0', sceneId: team, commandId: id, type: 'activity.start', capability: 'scene.say', participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: 'Hello', durationMs: 1000 } })
const payload = (id = 'one', team = 'office-1') => ({ teamId: team, command: command(id, team) })
const post = (app, body = payload(), key = DEMO_API_KEY) => app.inject({ method: 'POST', url: '/api/pixoffice/messages', headers: { authorization: `Bearer ${key}` }, payload: body })
async function setup(t, options = {}) {
  const app = await createPixOfficeServer(options)
  const base = await app.listen({ port: 0, host: '127.0.0.1' })
  t.after(() => app.close())
  return { app, base }
}
async function subscribe(t, base, teams = 'office-1', headers = {}) {
  const controller = new AbortController()
  const response = await fetch(`${base}/api/pixoffice/events?teams=${teams}`, { signal: controller.signal, headers })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = ''
  const frame = async () => {
    while (!buffer.includes('\n\n')) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('SSE closed')
      buffer += decoder.decode(chunk.value, { stream: true })
    }
    const boundary = buffer.indexOf('\n\n'), result = buffer.slice(0, boundary)
    buffer = buffer.slice(boundary + 2)
    return result
  }
  assert.match(await frame(), /connected/)
  const close = async () => { controller.abort(); await reader.cancel().catch(() => {}) }
  t.after(close)
  return { close, async message() { for (;;) { const value = await frame(); if (value.startsWith('data: ')) return JSON.parse(value.slice(6)) } } }
}

test('POST requires only a bearer key and rejects bad payloads with the unified envelope', async t => {
  const { app } = await setup(t)
  for (const key of ['', 'wrong']) {
    const response = await post(app, payload(), key)
    assert.equal(response.statusCode, 401); assert.equal(response.json().code, 401)
    assert.deepEqual(Object.keys(response.json()).sort(), ['code', 'data', 'msg'])
  }
  const invalid = await post(app, { unexpected: true })
  assert.equal(invalid.statusCode, 400); assert.equal(invalid.json().code, 400)
  assert.equal((await post(app, { ...payload(), requestId: 'retired' })).statusCode, 400)
  const mismatch = payload(); mismatch.command.sceneId = 'another-team'
  assert.equal((await post(app, mismatch)).statusCode, 400)
  const retired = payload()
  retired.command = { protocolVersion: '2.0', sceneId: 'office-1', commandId: 'old-layout', type: 'layout.apply', expectedLayoutRevision: 0, placements: [] }
  assert.equal((await post(app, retired)).statusCode, 400)
})
test('an online page receives POST messages through SSE without any acknowledgement endpoint', async t => {
  const { app, base } = await setup(t), page = await subscribe(t, base)
  const response = await post(app)
  assert.equal(response.statusCode, 200)
  assert.deepEqual(Object.keys(response.json()).sort(), ['code', 'data', 'msg'])
  assert.equal(response.json().data.forwarded, 1)
  assert.deepEqual(await page.message(), payload())
})
test('a custom key overrides the default and neither runtime config nor errors expose it', async t => {
  const key = 'private-example-key', { app } = await setup(t, { apiKey: key })
  assert.equal((await post(app)).statusCode, 401)
  assert.equal((await post(app, payload(), key)).statusCode, 409)
  const config = await app.inject('/pixoffice-config.js')
  assert.match(config.body, /relayUrl/); assert(!config.body.includes(key)); assert(!config.body.includes(DEMO_API_KEY))
  await assert.rejects(createPixOfficeServer({ apiKey: '' }), /must not be empty/)
})
test('offline teams return an explicit error and the server does not keep messages for later', async t => {
  const { app, base } = await setup(t)
  const response = await post(app, payload('offline'))
  assert.equal(response.statusCode, 409)
  assert.equal(response.json().data.reasonCode, 'NO_RECEIVER')
  const page = await subscribe(t, base)
  await post(app, payload('fresh'))
  assert.equal((await page.message()).command.commandId, 'fresh')
})
test('teams route independently and parallel pages receive the same message rather than stealing it', async t => {
  const { app, base } = await setup(t)
  const first = await subscribe(t, base, 'office-1,office-2'), second = await subscribe(t, base, 'office-2')
  const a = await post(app, payload('a'))
  assert.equal(a.json().data.forwarded, 1); assert.equal((await first.message()).teamId, 'office-1')
  const b = await post(app, payload('b', 'office-2'))
  assert.equal(b.json().data.forwarded, 2)
  assert.equal((await first.message()).command.commandId, 'b'); assert.equal((await second.message()).command.commandId, 'b')
  assert.equal((await post(app, payload('missing', 'office-3'))).statusCode, 409)
})
test('server bounds body size, subscriptions and socket buffers instead of accumulating messages', async t => {
  const { app, base } = await setup(t, { maxConnections: 1, maxBufferedBytes: 1 })
  await subscribe(t, base)
  assert.equal((await fetch(`${base}/api/pixoffice/events?teams=office-1`)).status, 503)
  const response = await post(app)
  assert.equal(response.statusCode, 503)
  assert.equal(response.json().data.reasonCode, 'RECEIVER_UNAVAILABLE')
  assert.equal((await post(app, { text: 'x'.repeat(65537) })).statusCode, 413)
})
test('invalid subscriptions and cross-site browser reads are rejected', async t => {
  const { app } = await setup(t)
  for (const url of ['/api/pixoffice/events', '/api/pixoffice/events?teams=bad%20id']) assert.equal((await app.inject(url)).statusCode, 400)
  const oversized = '/api/pixoffice/events?teams=' + Array.from({ length: 101 }, (_, index) => `team-${index}`).join(',')
  assert.equal((await app.inject(oversized)).statusCode, 400)
  const response = await app.inject({ url: '/api/pixoffice/events?teams=office-1', headers: { origin: 'https://untrusted.example', 'sec-fetch-site': 'cross-site' } })
  assert.equal(response.statusCode, 403)
})

test('ambiguous repeated subscription fields return a validation error rather than a server error', async t => {
  const { app } = await setup(t)
  for (const query of ['teams=office-1&teams=office-2', 'teams=office-1&teams=office-1']) {
    const response = await app.inject(`/api/pixoffice/events?${query}`)
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().code, 400)
  }
})
test('a configured public HTTPS origin works behind an HTTP reverse proxy without trusting arbitrary headers', async t => {
  const { app, base } = await setup(t, { publicOrigin: 'https://pixoffice.example.com' })
  const page = await subscribe(t, base, 'office-1', { Origin: 'https://pixoffice.example.com' })
  assert.equal((await post(app)).statusCode, 200)
  assert.equal((await page.message()).command.commandId, 'one')
  const invalid = await app.inject({ url: '/api/pixoffice/events?teams=office-1', headers: { Origin: 'https://untrusted.example', 'x-forwarded-host': 'untrusted.example', 'x-forwarded-proto': 'https' } })
  assert.equal(invalid.statusCode, 403)
  await assert.rejects(createPixOfficeServer({ publicOrigin: 'https://pixoffice.example.com/path' }), /without a path/)
})
test('retired polling, lease and diagnostic endpoints are not present', async t => {
  const { app } = await setup(t)
  for (const url of ['/scene/commands', '/scene/state', '/scene/events', '/scene/capabilities']) assert.equal((await app.inject(url)).statusCode, 404)
  assert.equal((await app.inject({ method: 'POST', url: '/scene/connect', payload: {} })).statusCode, 404)
})
test('connection relay keeps no pending history and cleans up on close', () => {
  const relay = new MessageRelay(), received = []
  assert.deepEqual(relay.publish('one', 'not-retained'), { matched: 0, forwarded: 0 })
  relay.add({ teams: new Set(['one']), send: frame => { received.push(frame); return true }, close: () => {} })
  assert.deepEqual(received, [])
  assert.deepEqual(relay.publish('one', 'fresh'), { matched: 1, forwarded: 1 })
  assert.deepEqual(received, ['fresh'])
  relay.close(); assert.equal(relay.size, 0)
})
test('production serves the same multipage build and overrides only public runtime configuration', async t => {
  assert.equal(defaultStaticRoot, fileURLToPath(new URL('../dist/', import.meta.url)))
  const root = await mkdtemp(path.join(tmpdir(), 'pixoffice-static-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'office'))
  await writeFile(path.join(root, 'office/index.html'), '<html>shared React build</html>')
  await writeFile(path.join(root, 'pixoffice-config.js'), 'globalThis.__PIXOFFICE_CONFIG__ = {};')
  const { app } = await setup(t, { staticRoot: root })
  const page = await app.inject('/office/')
  assert.equal(page.statusCode, 200); assert.match(page.body, /shared React build/)
  const config = await app.inject('/pixoffice-config.js')
  assert.match(config.body, /relayUrl/); assert.equal(config.headers['cache-control'], 'no-store')
})
