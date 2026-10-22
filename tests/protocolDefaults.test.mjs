import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandSchema } from '@pixoffice/protocol'
import { jsonObjectSchema, responseEnvelopeSchema } from '@pixoffice/protocol/schema'
import { mapOperationSchema } from '@pixoffice/protocol/map'
import { officeMessageSchema, officeSnapshotSchema } from '@pixoffice/protocol/office-integration'
import { emptyWhiteboard } from '@pixoffice/protocol/office-ui'
import { chatEventSchema, chatRequestSchema } from '@pixoffice/protocol/chat'
import { emptyPlot, plotStateSchema } from '@pixoffice/scene-farm'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'
import { SseMessageTransport } from '@pixoffice/runtime/adapters/sse'

function assertNoNull(value, path = '$') {
  assert.notEqual(value, null, path)
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) assertNoNull(child, `${path}.${key}`)
}
const post = (app, payload) => app.inject({ method: 'POST', url: '/api/pixoffice/messages',
  headers: { authorization: `Bearer ${DEMO_API_KEY}` }, payload })
const minimal = () => ({ schemaVersion: '1.0', seq: 1, workspace: { id: 'defaults', name: '默认值办公室' } })
const command = () => ({ protocolVersion: '2.0', sceneId: 'defaults', commandId: 'one', type: 'activity.start',
  capability: 'scene.say', participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '开始' } })

test('requests contain only the operation and parameters, never a response envelope', () => {
  assert.equal(officeMessageSchema.parse({ type: 'office.read' }).teamId, '')
  assert.throws(() => officeMessageSchema.parse({ code: 200, msg: '', data: { type: 'office.read' } }))
  assert.throws(() => officeMessageSchema.parse({ type: 'office.read', teamId: null }))
})

test('omitted snapshot fields receive fixed, null-free defaults without inventing required identities or versions', () => {
  const snapshot = officeSnapshotSchema.parse({ ...minimal(), conversations: [{ id: 'main', title: '主会话', employees: [{ id: 'dev', name: '开发' }], tasks: [
    { id: 'one', title: '登录', status: 'queued', updatedAt: '2026-10-18T10:00:00Z' },
  ] }] })
  assert.deepEqual(snapshot.conversations[0].employees[0], { id: 'dev', name: '开发', sceneActorId: '', role: '', online: false })
  assert.equal(snapshot.conversations[0].tasks[0].assigneeId, ''); assert.equal(snapshot.conversations[0].tasks[0].progress, -1); assert.equal(snapshot.conversations[0].tasks[0].summary, '')
  assert.deepEqual(snapshot.system, { cpuPercent: -1, memoryPercent: -1, networkKbps: -1 })
  assert.deepEqual(snapshot.conversations[0].whiteboard, emptyWhiteboard()); assert.deepEqual(snapshot.conversations[0].events, [])
  assert.deepEqual(officeSnapshotSchema.parse({ ...minimal(), conversations: [{ id: 'main', title: '主会话', whiteboard: {} }] }).conversations[0].whiteboard, emptyWhiteboard())
  assertNoNull(snapshot)
  assert.throws(() => officeSnapshotSchema.parse({ ...minimal(), seq: 0 }))
  assert.throws(() => officeSnapshotSchema.parse({ ...minimal(), workspace: { id: '', name: '无效' } }))
})

test('all nested JSON values and map bindings reject null instead of silently coercing it', () => {
  for (const value of [null, { nested: null }, { list: [1, null] }, { list: [{ nested: null }] }]) {
    assert.equal(jsonObjectSchema.safeParse(value).success, false)
    assert.equal(commandSchema.safeParse({ ...command(), params: value }).success, false)
  }
  assert.equal(commandSchema.safeParse({ protocolVersion: '2.0', sceneId: 'defaults', commandId: 'state', type: 'object.state.set',
    entityId: 'board', expectedStateRevision: 0, state: { nested: null } }).success, false)
  assert(mapOperationSchema.safeParse({ op: 'binding.set', actorId: 'one', homeId: '' }).success)
  assert.equal(mapOperationSchema.safeParse({ op: 'binding.set', actorId: 'one', homeId: null }).success, false)
  assert.equal(chatEventSchema.safeParse({ type: 'delta', text: '答复', extra: null }).success, false)
  assert.equal(chatRequestSchema.safeParse({ version: '1.0', type: 'send', turnId: 'turn', teamId: 'defaults', conversationId: 'one', messages: [{ role: 'user', content: null }] }).success, false)
})

test('response data is always an object and every nested null is invalid', () => {
  for (const data of [[], '', false, -1, null, { missing: null }, { offices: [null] }]) {
    assert.equal(responseEnvelopeSchema.safeParse({ code: 200, msg: 'OK', data }).success, false)
  }
  assert(responseEnvelopeSchema.safeParse({ code: 200, msg: 'OK', data: {} }).success)
  assert(responseEnvelopeSchema.safeParse({ code: 200, msg: 'OK', data: { offices: [] } }).success)
})

test('actual success and validation responses are object-only and null-free, including capability schemas', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const initialized = await post(app, { type: 'offices.initialize', offices: [minimal()] })
  assert.equal(initialized.statusCode, 202)
  const cases = [
    { type: 'office.capabilities' },
    { type: 'offices.initialize', offices: [{ ...minimal(), conversations: [{ id: 'main', title: '主会话', whiteboard: null }] }] },
    { type: 'offices.initialize', offices: [{ ...minimal(), conversations: [{ id: 'main', title: '主会话', tasks: null }] }] },
    { teamId: 'defaults', command: { ...command(), params: { nested: [{ value: null }] } } },
    { code: 200, msg: '', data: { type: 'office.read' } },
  ]
  for (const [index, payload] of cases.entries()) {
    const response = await post(app, payload), body = response.json()
    assert.equal(response.statusCode, index === 0 ? 200 : 400)
    assert.deepEqual(Object.keys(body).sort(), ['code', 'data', 'msg'])
    assert(!Array.isArray(body.data)); assert.equal(typeof body.data, 'object'); assertNoNull(body)
  }
})

test('an empty user-operation wait returns a fixed empty actions array', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const response = await post(app, { type: 'ui.next', timeoutMs: 1000 })
  assert.equal(response.statusCode, 200); assert.deepEqual(response.json().data, { actions: [] }); assertNoNull(response.json())
})

test('SSE recovery emits direct typed events with normalized null-free snapshot objects', async t => {
  const app = await createPixOfficeServer(), base = await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(() => app.close())
  const snapshot = { ...minimal(), conversations: [{ id: 'main', title: '主会话', tasks: Array.from({ length: 600 }, (_, index) => ({
    id: `task-${index}`, title: '任务', status: 'queued', updatedAt: '2026-10-18T10:00:00Z',
  })) }] }
  const request = { type: 'offices.initialize', offices: [snapshot] }
  assert(Buffer.byteLength(JSON.stringify(request)) < 65536)
  assert.equal((await post(app, request)).statusCode, 202)
  const controller = new AbortController(), response = await fetch(`${base}/api/pixoffice/events?workspace=1`, { signal: controller.signal })
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = ''
  t.after(async () => { controller.abort(); await reader.cancel().catch(() => {}) })
  for (;;) {
    const end = buffer.indexOf('\n\n')
    if (end < 0) {
      const part = await reader.read(); assert.equal(part.done, false)
      buffer += decoder.decode(part.value, { stream: true }); continue
    }
    const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
    const line = frame.split('\n').find(item => item.startsWith('data: '))
    if (!line) continue
    const event = JSON.parse(line.slice(6)); assertNoNull(event)
    if (event.type === 'office.sync.start') continue
    assert.equal(event.type, 'office.sync'); assert.equal(event.snapshot.conversations[0].whiteboard.title, '')
    assert.equal(event.snapshot.system.cpuPercent, -1)
    assert.equal('code' in event, false); assert.equal('data' in event, false)
    assert(Buffer.byteLength(line.slice(6)) > 65536, 'normalized snapshots may grow beyond the incoming request limit')
    const source = { close() {} }, received = []
    const disconnect = new SseMessageTransport('', () => source).connect({ teamIds: [], workspace: true,
      onStatus() {}, onMessage: value => received.push(value) })
    source.onmessage({ data: line.slice(6) }); disconnect()
    assert.equal(received.length, 1); assert.equal(received[0].snapshot.conversations[0].tasks.length, 600)
    break
  }
})

test('farm object states use explicit empty values and cannot reintroduce null into the protocol', () => {
  assert.deepEqual(emptyPlot(), { crop: '', plantedAt: -1, wateredAt: -1 }); assertNoNull(emptyPlot())
  assert.deepEqual(plotStateSchema.parse({}), emptyPlot())
  assert.equal(plotStateSchema.safeParse({ crop: null, plantedAt: null, wateredAt: null }).success, false)
})
