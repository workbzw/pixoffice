import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { access, readFile } from 'node:fs/promises'
import { createTestServer } from './helpers/vite.mjs'

let server, SceneMessageClient, SseMessageTransport, connectSceneRelay, createOfficeRuntime, officeTeamTransport, sceneRelayUrl
before(async () => {
  server = await createTestServer()
  ;({ SceneMessageClient } = await server.ssrLoadModule('/packages/runtime/src/adapters/messages.ts'))
  ;({ SseMessageTransport, connectSceneRelay } = await server.ssrLoadModule('/packages/runtime/src/adapters/sse.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ officeTeamTransport } = await server.ssrLoadModule('/example/office-web/src/application/connectOfficeTeam.ts'))
  ;({ sceneRelayUrl } = await server.ssrLoadModule('/example/shared/scene/connectionConfig.ts'))
})
after(() => server?.close())
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
function browserGlobal(t, key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key] })
}
const command = (id, team = 'team-a') => ({ protocolVersion: '2.0', sceneId: team, commandId: id, type: 'activity.start', capability: 'scene.say', participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: 'Hello', durationMs: 30000 } })
const message = (id, team = 'team-a', payload = command(id, team)) => ({ teamId: team, command: payload })
function fakeSource(url) {
  return { url, closed: false, close() { this.closed = true }, emit(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }) } }
}
function setup() {
  const sources = []
  const transport = new SseMessageTransport('/', url => { const source = fakeSource(url); sources.push(source); return source })
  return { sources, client: new SceneMessageClient(transport) }
}
function receiver(id) {
  const accepted = []
  return { sceneId: id, accepted, submit(c) { accepted.push(c); return { commandId: c.commandId, status: 'queued' } }, submitBatch(batch) { return batch.commands.map(c => this.submit(c)) } }
}

test('a throwing transport disconnect cannot prevent the replacement subscription or last-owner cleanup', t => {
  t.mock.method(console, 'warn', () => {})
  const scheduled = [], connections = []
  t.mock.method(globalThis, 'queueMicrotask', callback => scheduled.push(callback))
  const drain = () => { while (scheduled.length) scheduled.shift()() }
  const client = new SceneMessageClient({ connect(options) {
    connections.push(options)
    return () => { throw new Error('disconnect failed') }
  } })
  const a = receiver('team-a'), b = receiver('team-b'), stopA = client.register(a)
  drain()
  const stopB = client.register(b)
  assert.doesNotThrow(drain)
  assert.equal(connections.length, 2)
  connections[0].onMessage(message('stale'))
  connections[1].onMessage(message('current', 'team-b'))
  assert.equal(a.accepted.length, 0)
  assert.deepEqual(b.accepted.map(c => c.commandId), ['current'])
  stopA(); stopB()
  assert.doesNotThrow(drain)
  assert.equal(client.size, 0)
})

test('static demo config starts no network transport, including non-default teams', () => {
  assert.equal(sceneRelayUrl(), undefined)
  assert.equal(officeTeamTransport({ sceneId: 'office-1' }), undefined)
  assert.equal(officeTeamTransport({ sceneId: 'office-2' }), undefined)
})
test('runtime deployment config enables the same frontend without exposing a key', t => {
  browserGlobal(t, '__PIXOFFICE_CONFIG__', { relayUrl: '/' })
  assert.equal(sceneRelayUrl(), '/')
})
test('retired embedding adapter is not exported or left in source and package output', async () => {
  const manifest = JSON.parse(await readFile(new URL('../packages/runtime/package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.exports['./adapters/embed'], undefined)
  assert.throws(() => import.meta.resolve('@pixoffice/runtime/adapters/embed'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  for (const file of ['src/adapters/embed.ts', 'dist/adapters/embed.js', 'dist/adapters/embed.d.ts', 'dist/adapters/embed.js.map']) {
    await assert.rejects(access(new URL(`../packages/runtime/${file}`, import.meta.url)), { code: 'ENOENT' })
  }
})
test('all teams share one SSE connection and messages route to the matching runtime', async t => {
  const { client, sources } = setup(), a = receiver('team-a'), b = receiver('team-b')
  t.after(client.register(a)); t.after(client.register(b))
  await flush()
  assert.equal(sources.length, 1)
  assert.equal(new URL(sources[0].url, 'http://localhost').searchParams.get('teams'), 'team-a,team-b')
  sources[0].emit(message('a', 'team-a')); sources[0].emit(message('b', 'team-b'))
  assert.deepEqual(a.accepted.map(c => c.commandId), ['a'])
  assert.deepEqual(b.accepted.map(c => c.commandId), ['b'])
  assert(!sources[0].url.includes('key'))
})
test('office assembly uses one shared stream for all team IDs, without polling or uploads', async t => {
  const sources = []
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected HTTP request') })
  browserGlobal(t, 'window', { addEventListener() { throw new Error('Unexpected parent-window message listener') } })
  browserGlobal(t, 'EventSource', class { constructor(url) { const source = fakeSource(url); sources.push(source); return source } })
  const a = receiver('office-1'), b = receiver('office-2')
  const stopA = officeTeamTransport(a, '/')(status => { a.status = status })
  const stopB = officeTeamTransport(b, '/')(status => { b.status = status })
  t.after(stopA); t.after(stopB)
  await flush()
  assert.equal(sources.length, 1)
  sources[0].onopen()
  sources[0].emit(message('second', 'office-2'))
  assert.equal(a.accepted.length, 0); assert.equal(b.accepted.length, 1)
  assert.equal(a.status, '已连接'); assert.equal(b.status, '已连接')
  stopA(); stopB(); await flush()
  assert.equal(sources[0].closed, true)
})
test('adding or removing a team only replaces the subscription, not other runtime queues', async t => {
  const { client, sources } = setup(), a = receiver('team-a'), b = receiver('team-b')
  const stopA = client.register(a); t.after(stopA)
  await flush(); sources[0].emit(message('first'))
  const late = sources[0].onmessage
  const stopB = client.register(b); t.after(stopB)
  await flush()
  assert.equal(sources[0].closed, true)
  late({ data: JSON.stringify(message('late')) })
  sources[1].emit(message('second'))
  assert.deepEqual(a.accepted.map(c => c.commandId), ['first', 'second'])
  stopB(); await flush()
  sources[2].emit(message('third'))
  assert.deepEqual(a.accepted.map(c => c.commandId), ['first', 'second', 'third'])
})
test('invalid JSON, oversized frames and mismatched teams do not block following valid messages', async t => {
  t.mock.method(console, 'warn', () => {})
  const { client, sources } = setup(), a = receiver('team-a')
  t.after(client.register(a)); await flush()
  sources[0].emit('{invalid'); sources[0].emit('x'.repeat(65537))
  sources[0].emit(message('wrong', 'team-a', command('wrong', 'team-b')))
  sources[0].emit(message('good'))
  assert.deepEqual(a.accepted.map(c => c.commandId), ['good'])
})
test('one registration cannot silently replace another runtime with the same team ID', async t => {
  const { client } = setup()
  t.after(client.register(receiver('team-a')))
  assert.throws(() => client.register(receiver('team-a')), /Duplicate runtime/)
})

test('the 101st team is refused without interrupting the existing shared subscription', async t => {
  const { client, sources } = setup(), releases = []
  for (let i = 0; i < 100; i++) releases.push(client.register(receiver(`team-${i}`)))
  t.after(() => releases.forEach(release => release()))
  await flush()
  assert.equal(client.size, 100)
  assert.equal(sources.length, 1)
  assert.throws(() => client.register(receiver('team-101')), /100/)
  await flush()
  assert.equal(client.size, 100)
  assert.equal(sources.length, 1)
  assert.equal(sources[0].closed, false)
  releases[0](); releases.push(client.register(receiver('replacement')))
  await flush()
  assert.equal(client.size, 100)
  assert.equal(sources.length, 2)
})
test('two owners of the same runtime can share a callback without detaching each other', async t => {
  const { client, sources } = setup(), a = receiver('team-a'), callback = () => {}
  const first = client.register(a, callback), second = client.register(a, callback)
  t.after(first); t.after(second); await flush()
  first(); await flush()
  assert.equal(client.size, 1); assert.equal(sources.length, 1); assert.equal(sources[0].closed, false)
  sources[0].emit(message('shared-owner'))
  assert.equal(a.accepted.length, 1)
})
test('a throwing status observer cannot block registration, other teams or delivery', async t => {
  t.mock.method(console, 'warn', () => {})
  const { client, sources } = setup(), a = receiver('team-a'), b = receiver('team-b'), statuses = []
  let stopA
  assert.doesNotThrow(() => { stopA = client.register(a, () => { throw new Error('broken observer') }) })
  t.after(() => stopA?.()); t.after(client.register(b, status => statuses.push(status)))
  await flush()
  assert.equal(sources.length, 1)
  assert.doesNotThrow(() => sources[0].onopen())
  assert.equal(statuses.at(-1), '已连接')
  sources[0].emit(message('still-delivered', 'team-b'))
  assert.equal(b.accepted[0].commandId, 'still-delivered')
  stopA(); await flush()
  assert.equal(client.size, 1)
})
test('reconnect and view-independent subscription preserve local deduplication and active animations', async t => {
  const { client, sources } = setup(), statuses = []
  const runtime = createOfficeRuntime({ sceneId: 'team-a' })
  t.after(() => runtime.dispose())
  const stop = client.register(runtime, status => statuses.push(status)); t.after(stop)
  await flush()
  sources[0].emit(message('same')); sources[0].onerror(); sources[0].onopen(); sources[0].emit(message('same'))
  assert.equal(runtime.snapshot().records.length, 1)
  assert.equal(runtime.getRecord('same').status, 'running')
  assert.equal(statuses.at(-1), '已连接')
  stop(); await flush()
  assert.equal(runtime.getRecord('same').status, 'running')
})
test('frontend runtime remains the bounded execution queue and rejects expired commands locally', async t => {
  t.mock.method(console, 'warn', () => {})
  const { client, sources } = setup()
  const runtime = createOfficeRuntime({ sceneId: 'team-a', now: () => 10000 })
  t.after(() => runtime.dispose()); t.after(client.register(runtime)); await flush()
  sources[0].emit(message('old', 'team-a', { ...command('old'), expiresAt: new Date(1000).toISOString() }))
  assert.equal(runtime.getRecord('old').status, 'expired')
  for (let i = 0; i < 129; i++) sources[0].emit(message(`queued-${i}`))
  assert.equal(runtime.getRecord('queued-128').error.code, 'QUEUE_FULL')
  assert.equal(runtime.snapshot().records.filter(r => ['queued', 'running'].includes(r.status)).length, 128)
})
test('a shared connector closes only after the last team detaches', async t => {
  const sources = []
  browserGlobal(t, 'EventSource', class { constructor(url) { const source = fakeSource(url); sources.push(source); return source } })
  const detach = connectSceneRelay(receiver('one'), '/shared')
  const detachTwo = connectSceneRelay(receiver('two'), '/shared')
  await flush(); detach(); await flush()
  assert.equal(sources.at(-1).closed, false)
  detachTwo(); await flush()
  assert.equal(sources.at(-1).closed, true)
})
test('a transport setup failure is local and cannot crash the application', async t => {
  t.mock.method(console, 'warn', () => {})
  const statuses = [], a = receiver('team-a')
  const client = new SceneMessageClient({ connect() { throw new Error('Invalid connection URL') } })
  t.after(client.register(a, status => statuses.push(status)))
  await flush()
  assert.equal(statuses.at(-1), '未连接')
  client.receive(message('still-local'))
  assert.equal(a.accepted.length, 1)
})
