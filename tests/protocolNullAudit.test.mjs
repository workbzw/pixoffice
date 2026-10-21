import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { z } from 'zod'
import { commandSchema, batchSchema } from '@pixoffice/protocol'
import { assertProtocolObject, assertProtocolValue, jsonObjectSchema, jsonValueSchema, parseProtocolObject, responseEnvelopeSchema, stringifyDocumentObject, stringifyProtocolObject } from '@pixoffice/protocol/schema'
import { relayMessageSchema } from '@pixoffice/protocol/relay'
import { mapDocumentSchema, mapEditSchema, mapOperationSchema } from '@pixoffice/protocol/map'
import { chatEventSchema, chatRequestSchema } from '@pixoffice/protocol/chat'
import { officeRequestSchema, officeSnapshotSchema, officeReplySchema, officeDeliverySchema, officeSyncSchema, officeSyncStartSchema, officeSyncCompleteSchema,
  officeClosedSchema, officeUiActionSchema, officeUiPresentationSchema, officeErrorResultSchema, officeSuccessResultSchema } from '@pixoffice/protocol/office-integration'
import { whiteboardTaskBoardSchema } from '@pixoffice/protocol/office-ui'
import { createSceneRuntime } from '@pixoffice/runtime/createSceneRuntime'
import { SseMessageTransport } from '@pixoffice/runtime/adapters/sse'
import { referenceOfficeScenePack, officeScenePack, describeOfficeScene } from '@pixoffice/scene-office/core'
import { classroomScenePack } from '@pixoffice/scene-classroom'
import { createFarmScenePack } from '@pixoffice/scene-farm'
import { createPixOfficeServer, DEMO_API_KEY } from '../server/dist/app.js'

function paths(value, path = []) {
  return [path, ...(value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => paths(child, [...path, key])) : [])]
}
function replaceAt(value, path) {
  if (!path.length) return null
  const copy = structuredClone(value); let parent = copy
  for (const key of path.slice(0, -1)) parent = parent[key]
  parent[path.at(-1)] = null
  return copy
}
function assertWire(value) {
  const source = stringifyProtocolObject(value), parsed = JSON.parse(source)
  for (const path of paths(parsed)) {
    let child = parsed; for (const key of path) child = child[key]
    assert.notEqual(child, null, path.join('.'))
  }
  return parsed
}
const board = { template: 'task-board-v1', title: '协议审查', status: 'running', tagline: '', description: '', note: '',
  link: { label: '资料', url: 'https://example.com/' }, steps: [{ id: 'step', title: '检查', progress: -1 }] }
const snapshot = () => officeSnapshotSchema.parse({ schemaVersion: '1.0', seq: 1, workspace: { id: 'audit', name: '审查' },
  employees: [{ id: 'dev', name: '开发', sceneActorId: 'office-lead', role: '', online: false }],
  tasks: [{ id: 'task', title: '审查', assigneeId: 'dev', status: 'running', progress: -1, summary: '', updatedAt: '2026-10-18T10:00:00Z' }],
  events: [{ id: 'event', kind: 'note', summary: '检查', occurredAt: '2026-10-18T10:00:00Z', taskId: 'task', employeeId: 'dev', fromEmployeeId: 'dev' }], whiteboard: board })
const dialog = { target: 'dialog', content: { template: 'detail-v1', title: '详情', description: '', fields: [{ label: '任务', value: '' }], actions: [{ id: 'ok', label: '确认' }] } }
const common = { protocolVersion: '2.0', sceneId: 'audit', commandId: 'command', after: ['before'], busyPolicy: 'queue', timeoutMs: 1000, expiresAt: '2026-10-18T12:00:00Z' }
const activity = { ...common, type: 'activity.start', capability: 'audit.custom', participants: [{ entityId: 'office-lead', role: 'actor' }], params: { text: '', nested: [{ value: '', enabled: false, count: -1 }] } }
const map = { format: 'ai-office-map', version: 2, unit: 'cell', sceneId: 'audit', width: 8, height: 8, gridSize: 1,
  bounds: { left: 0, top: 0, right: 8, bottom: 8 }, walkableArea: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }],
  blockedAreas: [{ id: 'area', name: '区域', bounds: { left: 1, top: 1, right: 2, bottom: 2 } }],
  props: [{ id: 'prop', name: '物品', templateId: 'object', position: { x: 3, y: 3 }, anchors: { entry: { x: 2, y: 3 } } }],
  bindings: [{ actorId: 'actor', homeId: '', position: { x: 0, y: 0 } }] }

test('every value position in all request, response and event variants rejects an injected null', t => {
  const fixtures = [], add = (schema, ...values) => values.forEach(value => fixtures.push([schema, value]))
  const state = snapshot()
  add(officeRequestSchema,
    { type: 'offices.initialize', offices: [state], chat: { url: 'https://backend.example/chat' } }, { type: 'office.snapshot', teamId: 'audit', snapshot: state },
    { type: 'office.read', teamId: 'audit' }, { type: 'office.capabilities' }, { type: 'ui.next', timeoutMs: 1000 },
    { type: 'ui.respond', interactionId: 'interaction', presentation: dialog },
    { type: 'ui.respond', interactionId: 'interaction', presentation: { target: 'whiteboard', snapshot: state } },
    { type: 'decision.request', teamId: 'audit', timeoutMs: 1000, decision: { id: 'menu', actorId: 'office-lead', kind: 'confirmation', title: '确认', description: '', confirmLabel: '是', rejectLabel: '否' } },
    { type: 'decision.request', teamId: 'audit', timeoutMs: 1000, decision: { id: 'menu', actorId: '', kind: 'choice', title: '选择', description: '', options: [{ id: 'a', label: '甲', description: '' }, { id: 'b', label: '乙', description: '' }] } })
  add(commandSchema, activity, { ...common, type: 'activity.stop', activityId: 'activity' }, { ...common, type: 'command.cancel', targetCommandId: 'target' },
    { ...common, type: 'actor.presentation.set', actorId: 'actor', sourceRevision: 1, status: 'thinking', title: '' },
    { ...common, type: 'object.state.set', entityId: 'prop', expectedStateRevision: 0, state: { title: '', values: [{ value: false }] } })
  add(batchSchema, { mode: 'parallel', commands: [activity] }, { mode: 'sequence', commands: [activity] })
  add(relayMessageSchema, { teamId: 'audit', command: activity }, { teamId: 'audit', command: { mode: 'sequence', commands: [activity] } })
  add(mapDocumentSchema, map)
  const operations = [{ op: 'prop.put', prop: map.props[0] }, { op: 'prop.remove', id: 'prop' },
    { op: 'floor.set', points: map.walkableArea }, { op: 'blocked.put', area: map.blockedAreas[0] }, { op: 'blocked.remove', id: 'area' },
    { op: 'binding.set', actorId: 'actor', homeId: '', position: { x: 0, y: 0 } }, { op: 'map.replace', document: map }]
  add(mapOperationSchema, ...operations)
  add(mapEditSchema, { action: 'begin', expectedLayoutRevision: 0 },
    { action: 'patch', draftId: 'draft', expectedDraftRevision: 0, requireValid: false, operations },
    ...['undo', 'redo', 'validate', 'commit', 'cancel'].map(action => ({ action, draftId: 'draft', expectedDraftRevision: 0 })),
    { action: 'route', draftId: 'draft', expectedDraftRevision: 0, from: { x: 0, y: 0 }, to: { x: 2, y: 2 } })
  add(whiteboardTaskBoardSchema, board)
  add(officeUiPresentationSchema, dialog, { target: 'whiteboard', snapshot: state })
  const actions = [{ id: 'action', teamId: 'audit', action: 'actor.inspect', actorId: 'actor' },
    { id: 'action', teamId: 'audit', action: 'employee.inspect', employeeId: 'dev' },
    ...['task.start', 'task.block', 'task.complete'].map(action => ({ id: 'action', teamId: 'audit', action, taskId: 'task' })),
    { id: 'action', teamId: 'audit', action: 'task.assign', taskId: 'task', assigneeId: 'dev' },
    { id: 'action', teamId: 'audit', action: 'dialog.action', interactionId: 'interaction', optionId: 'ok' }]
  add(officeUiActionSchema, ...actions)
  add(officeSuccessResultSchema, { actions: [actions[0]] }, { actions: [] }, { interactionId: 'interaction', delivered: true },
    { teamId: 'audit', seq: 1, status: 'ignored', reasonCode: 'STALE_SEQ' },
    { teamId: 'audit', decisionId: 'menu', choiceId: 'ok', label: '确认' })
  const scene = { protocolVersion: '2.0', sceneId: 'audit', command: { type: 'object' }, batch: { type: 'object' },
    actors: [{ id: 'actor', name: '人物', templateId: 'person', position: { x: 0, y: 0 }, presentation: { status: 'idle', title: '', sourceRevision: 0 } }],
    objects: [{ id: 'prop', name: '物品', templateId: 'object', state: { value: '' }, stateRevision: 0, stateSchema: { type: 'object' } }],
    capabilities: [{ id: 'audit.custom', name: '行为', params: { type: 'object' }, participants: { min: 0, max: -1,
      roles: [{ role: 'actor', min: 0, max: 1 }], rules: ['示例'] } }] }
  const ui = { slots: [{ id: 'dialog', content: 'detail-v1', persistent: false, update: 'ui.respond' }], actions: ['actor.inspect'],
    actionSchema: { type: 'object' }, presentationSchema: { type: 'object' }, whiteboardSchema: { type: 'object' } }
  add(officeSuccessResultSchema,
    { offices: [{ id: 'audit', name: '办公室', seq: 1, runtimeReady: false, taskCount: 0 }], actors: [{ id: 'actor', name: '人物' }], supportedMessages: ['office.read'], sceneCommandProtocol: '2.0', ui },
    { snapshot: state, scene, pendingDecisions: ['menu'] },
    { scene, ui, requests: { type: 'object' }, responses: { success: { type: 'object' }, error: { type: 'object' } } })
  const fault = { reasonCode: 'INVALID_MESSAGE', details: { expected: '', values: [{ label: '', count: -1 }] }, issues: [{ path: ['tasks', 0], message: '' }] }
  add(officeErrorResultSchema, fault)
  add(officeReplySchema, { responseToken: 'token', result: { code: 400, msg: '', data: fault } }, { responseToken: 'token', result: { code: 200, msg: '', data: { actions: [] } } })
  add(officeDeliverySchema, { type: 'office.request', responseToken: 'token', remainingMs: 10000, request: { type: 'offices.initialize', offices: [state] } })
  add(officeSyncSchema, { type: 'office.sync', snapshot: state })
  add(officeSyncStartSchema, { type: 'office.sync.start', stateId: 'server-instance' })
  add(officeSyncCompleteSchema, { type: 'office.sync.complete', offices: [{ teamId: 'audit', seq: 1 }] })
  add(officeClosedSchema, { type: 'office.request.closed', responseToken: 'token' })
  add(chatRequestSchema, { version: '1.0', teamId: 'audit', conversationId: 'conversation', messages: [{ role: 'user', content: '' }, { role: 'assistant', content: '' }] })
  add(chatEventSchema, { type: 'status', phase: 'thinking' }, { type: 'delta', text: '' }, { type: 'done' }, { type: 'error', message: '失败' })
  add(responseEnvelopeSchema, { code: 200, msg: 'OK', data: { offices: [state] } }, { code: 400, msg: '', data: fault })
  let mutations = 0
  for (const [schema, value] of fixtures) {
    assert(schema.safeParse(value).success, JSON.stringify(value))
    assertWire(schema.parse(value))
    for (const path of paths(value)) {
      assert.equal(schema.safeParse(replaceAt(value, path)).success, false, `Accepted null at ${path.join('.')}`)
      mutations++
    }
  }
  t.diagnostic(`${fixtures.length} protocol variants; ${mutations} null-injection positions rejected`)
})

test('special object keys cannot hide null from generic JSON or command validation', () => {
  for (const value of [JSON.parse('{"__proto__":null}'), JSON.parse('{"nested":{"__proto__":null}}'), JSON.parse('{"values":[{"__proto__":null}]}')]) {
    assert.equal(jsonObjectSchema.safeParse(value).success, false)
    assert.equal(jsonValueSchema.safeParse(value).success, false)
    assert.equal(commandSchema.safeParse({ ...activity, params: value }).success, false)
    assert.throws(() => stringifyProtocolObject(value))
    assert.throws(() => parseProtocolObject(JSON.stringify(value)))
    assert.equal(mapDocumentSchema.safeParse({ ...map, props: [{ ...map.props[0], anchors: value }] }).success, false)
  }
})

test('serialization cannot convert sparse arrays, undefined array entries, non-finite numbers or custom JSON values into null', () => {
  const values = [{ value: NaN }, { value: Infinity }, { value: [undefined] }, { value: Array(1) }, { value: { toJSON() { return null } } }]
  const cyclic = {}; cyclic.self = cyclic; values.push(cyclic)
  const deep = {}; let nested = deep
  for (let index = 0; index < 66; index++) { nested.child = {}; nested = nested.child }
  values.push(deep)
  for (const value of values) assert.throws(() => stringifyProtocolObject(value))
  assert.deepEqual(parseProtocolObject('{"text":"null","values":[]}'), { text: 'null', values: [] })
})

test('dynamic array entries cannot change to null between validation and serialization', () => {
  for (const enumerable of [false, true]) {
    let reads = 0
    const values = []
    Object.defineProperty(values, '0', { enumerable, get() { return reads++ === 0 ? 'safe' : null } })
    assert.throws(() => assertProtocolObject({ values }), /Accessors are not allowed/)
    assert.equal(reads, 0, 'validation must inspect descriptors without invoking a getter')
    assert.throws(() => stringifyProtocolObject({ values }), /Accessors are not allowed/)
    assert.equal(reads, 0)
    assert.equal(jsonObjectSchema.safeParse({ values }).success, false)
  }
})

test('serialization verifies its final output even if a proxy changes inspected data', () => {
  const value = new Proxy({ content: 'safe' }, { get(target, key, receiver) {
    return key === 'content' ? null : Reflect.get(target, key, receiver)
  } })
  assert.throws(() => stringifyProtocolObject({ value }), /Null is not allowed/)
  const values = new Proxy(['safe'], { get(target, key, receiver) {
    return key === '0' ? undefined : Reflect.get(target, key, receiver)
  } })
  assert.throws(() => stringifyProtocolObject({ values }), /Null is not allowed/)
})

test('local document serialization omits optional properties but never writes explicit or implicit null', () => {
  assert.deepEqual(JSON.parse(stringifyDocumentObject({ value: '', optional: undefined, nested: { optional: undefined } }, 2)), { value: '', nested: {} })
  for (const value of [undefined, null, [], { value: null }, { value: NaN }, { value: Infinity }, { values: [undefined] }, { values: Array(1) }, { value: { toJSON: () => null } }]) {
    assert.throws(() => stringifyDocumentObject(value))
  }
  assert.throws(() => stringifyProtocolObject({ optional: undefined }), 'wire requests remain strict')
})

test('actual scene states and discovery schemas serialize without null in office, classroom and farm', () => {
  for (const pack of [officeScenePack, referenceOfficeScenePack, classroomScenePack, createFarmScenePack(() => 0)]) {
    const runtime = createSceneRuntime(pack)
    try {
      assertWire(runtime.describe()); assertWire(runtime.readWorld())
      if (pack === referenceOfficeScenePack) assertWire(describeOfficeScene(runtime))
    } finally { runtime.dispose() }
  }
})

test('scene commands, editing, runtime events, checkpoints and exports stay null-free throughout their lifecycle', () => {
  for (const pack of [officeScenePack, referenceOfficeScenePack, classroomScenePack, createFarmScenePack(() => 0)]) {
    const runtime = createSceneRuntime(pack)
    const check = value => assertProtocolValue(JSON.parse(stringifyDocumentObject({ value })))
    const inspect = () => {
      for (const value of [runtime.snapshot(), runtime.checkpoint(), runtime.exportMap(), runtime.readActivePhases(), runtime.describe()]) check(value)
    }
    const command = (commandId, value) => ({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId, ...value })
    try {
      inspect()
      const actor = runtime.readActors()[0]
      check(runtime.submit(command('presentation', { type: 'actor.presentation.set', actorId: actor.id, sourceRevision: 1, status: 'thinking', title: '' })))
      check(runtime.submit(command('speech', { type: 'activity.start', capability: 'scene.say', participants: [{ entityId: actor.id, role: 'actor' }], params: { text: 'null is text', durationMs: 1000 } })))
      inspect()
      runtime.tick(50); inspect()
      check(runtime.submit(command('cancel', { type: 'command.cancel', targetCommandId: 'speech' })))
      check(runtime.submit(command('unsupported', { type: 'activity.start', capability: 'audit.unsupported', participants: [], params: {} })))
      check(runtime.submit(command('edit', { type: 'map.edit', edit: { action: 'begin', expectedLayoutRevision: runtime.readWorld().layoutRevision } })))
      inspect()
      const draft = runtime.editorSnapshot()
      assert(draft)
      check(runtime.submit(command('close-edit', { type: 'map.edit', edit: { action: 'cancel', draftId: draft.id, expectedDraftRevision: draft.revision } })))
      inspect()
    } finally { runtime.dispose(); inspect() }
  }
})

test('all project and published asset JSON files contain no null values', async t => {
  let count = 0
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) await inspect(file)
      else if (entry.name.endsWith('.json')) {
        const value = JSON.parse(await readFile(file, 'utf8'))
        assert.doesNotThrow(() => assertProtocolValue(value), file.pathname)
        count++
      }
    }
  }
  for (const root of ['packages', 'server', 'example', 'integration', 'public', 'art']) await inspect(new URL(`../${root}/`, import.meta.url))
  assert(count > 0)
  t.diagnostic(`${count} project and asset JSON files checked recursively`)
})

test('raw protocol POST bodies reject every null before endpoint parsers can strip it', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const headers = { authorization: `Bearer ${DEMO_API_KEY}`, 'content-type': 'application/json' }
  for (const url of ['/api/pixoffice/messages', '/api/pixoffice/ui', '/api/pixoffice/reply']) {
    for (const payload of ['null', '{"__proto__":null}', '{"type":"office.capabilities","nested":[{"value":null}]}']) {
      const response = await app.inject({ method: 'POST', url, headers, payload })
      assert.equal(response.statusCode, 400); assertWire(response.json()); assertProtocolObject(response.json().data)
      assert.equal(response.json().data.reasonCode, 'INVALID_MESSAGE')
      // The secure JSON parser may reject reserved keys before preValidation runs.
      if (!payload.includes('__proto__')) assert.equal(typeof response.json().data.details.path, 'string')
    }
  }
})

test('the SSE receiver never passes null-containing frames to application consumers', t => {
  t.mock.method(console, 'warn', () => {})
  const source = { close() {} }, received = []
  const disconnect = new SseMessageTransport('', () => source).connect({ teamIds: ['audit'], onStatus() {}, onMessage: value => received.push(value) })
  for (const data of ['null', '[]', '{"value":null}', '{"values":[null]}', '{"__proto__":null}']) source.onmessage({ data })
  assert.deepEqual(received, [])
  source.onmessage({ data: '{"type":"example","text":"null","values":[]}' })
  assert.deepEqual(received, [{ type: 'example', text: 'null', values: [] }])
  disconnect()
})

test('the final HTTP serialization boundary blocks null and implicit null on future routes', async t => {
  const app = await createPixOfficeServer(); t.after(() => app.close())
  const invalid = [null, [], { nested: null }, { values: [undefined] }, { value: NaN }, { value: { toJSON() { return null } } }]
  invalid.forEach((data, index) => app.get(`/api/pixoffice/audit-${index}`, async () => ({ code: 200, msg: '', data })))
  app.get('/api/pixoffice/audit-string', async (_request, reply) => reply.type('application/json').send('{"code":200,"msg":"","data":{"value":null}}'))
  for (const index of [...invalid.keys(), 'string']) {
    const response = await app.inject(`/api/pixoffice/audit-${index}`)
    assert.equal(response.statusCode, 500)
    const body = assertWire(response.json()); assert.equal(body.code, 500); assert.equal(body.data.reasonCode, 'INTERNAL_ERROR')
  }
})

test('all exported JSON schemas and their default values are themselves null-free', () => {
  for (const schema of [officeRequestSchema, officeSuccessResultSchema, officeErrorResultSchema, officeReplySchema, relayMessageSchema, commandSchema, mapDocumentSchema, chatRequestSchema]) {
    assertWire(z.toJSONSchema(schema))
  }
})
