import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { beginMapEdit, editMapDraft } from './helpers/map.mjs'

let server, createOfficeRuntime, createSceneRuntime, createFarmScenePack, classroomScenePack, DashboardSceneBridge
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ createSceneRuntime } = await server.ssrLoadModule('/packages/runtime/src/createSceneRuntime.ts'))
  ;({ createFarmScenePack } = await server.ssrLoadModule('/packages/scene-farm/src/core/index.ts'))
  ;({ classroomScenePack } = await server.ssrLoadModule('/packages/scene-classroom/src/core/index.ts'))
  ;({ DashboardSceneBridge } = await server.ssrLoadModule('/example/office-web/src/dashboard/sceneBridge.ts'))
})
after(() => server?.close())

const base = (runtime, commandId) => ({ protocolVersion: '2.0', sceneId: runtime.sceneId, commandId })
const board = runtime => runtime.readWorld().props.find(prop => prop.id === 'whiteboard-1')
const summary = progress => ({ workspace: { name: 'Summary' }, employees: [], events: [],
  tasks: [{ id: 'task', title: 'Task', status: 'running', progress }] })

test('demo whiteboard provenance survives record pruning, map edits and checkpoint restoration', t => {
  let checkpoint
  const persistence = { load: () => checkpoint, save: value => { checkpoint = structuredClone(value) } }
  const runtime = createOfficeRuntime({ referenceLayout: true, persistence })
  t.after(() => runtime.dispose())
  new DashboardSceneBridge(runtime, { whiteboard: 'demo-summary' }).sync(summary(80))
  const revision = runtime.readActors().find(actor => actor.id === 'office-lead').presentation.sourceRevision
  for (let i = 1; i <= 520; i++) assert.equal(runtime.submit({ ...base(runtime, `presentation-${i}`),
    type: 'actor.presentation.set', actorId: 'office-lead', status: 'idle', title: '', sourceRevision: revision + i }).status, 'completed')
  assert(runtime.snapshot().records.length < 500)
  assert.equal(beginMapEdit(runtime, 'begin').status, 'completed')
  assert.equal(editMapDraft(runtime, 'commit', { action: 'commit' }).status, 'completed')
  assert.equal(board(runtime).stateSource, 'pixoffice.demo-summary')
  const restored = createOfficeRuntime({ referenceLayout: true, persistence })
  t.after(() => restored.dispose())
  new DashboardSceneBridge(restored, { whiteboard: 'demo-summary' }).sync(summary(66))
  assert.equal(board(restored).state.taskBoard.steps[0].progress, 66)
})

test('an external write of identical board content takes precedence even after refresh', t => {
  let checkpoint
  const persistence = { load: () => checkpoint, save: value => { checkpoint = structuredClone(value) } }
  const runtime = createOfficeRuntime({ referenceLayout: true, persistence })
  t.after(() => runtime.dispose())
  new DashboardSceneBridge(runtime, { whiteboard: 'demo-summary' }).sync(summary(80))
  const current = board(runtime)
  assert.equal(runtime.submit({ ...base(runtime, 'external-board'), type: 'object.state.set', entityId: current.id,
    expectedStateRevision: current.stateRevision, state: current.state }).status, 'completed')
  assert.equal(board(runtime).stateSource, undefined)
  const restored = createOfficeRuntime({ referenceLayout: true, persistence })
  t.after(() => restored.dispose())
  new DashboardSceneBridge(restored, { whiteboard: 'demo-summary' }).sync(summary(66))
  assert.equal(board(restored).state.taskBoard.steps[0].progress, 80)
})

test('pinned history cannot consume the slots reserved for stop and cancel', t => {
  const runtime = createOfficeRuntime(); t.after(() => runtime.dispose())
  runtime.submit({ ...base(runtime, 'focus'), type: 'activity.start', capability: 'office.focus',
    participants: [{ entityId: 'office-lead', role: 'worker' }], params: { title: 'Focus' } })
  const ids = Array.from({ length: 400 }, (_, i) => `p-${i}`)
  ids.forEach((id, i) => runtime.submit({ ...base(runtime, id), type: 'actor.presentation.set', actorId: 'office-lead',
    status: 'working', title: '', sourceRevision: i + 1 }))
  for (let i = 0; i < 109; i++) assert.equal(runtime.submit({ ...base(runtime, `queued-${i}`), type: 'activity.start',
    capability: 'office.emote', participants: [{ entityId: 'office-lead', role: 'actor' }],
    params: { animation: 'emotes/wave', durationMs: 300 }, after: ids.slice(i % 13 * 32, (i % 13 + 1) * 32) }).status, 'queued')
  assert.equal(runtime.snapshot().records.length, 510)
  assert.equal(runtime.submit({ ...base(runtime, 'overflow'), type: 'actor.presentation.set', actorId: 'office-lead',
    status: 'idle', title: '', sourceRevision: 401 }).error.code, 'QUEUE_FULL')
  const stop = { ...base(runtime, 'stop'), type: 'activity.stop', activityId: 'focus' }
  assert.equal(runtime.submit({ ...stop, commandId: 'wrong-scene', sceneId: 'other' }).error.code, 'SCENE_MISMATCH')
  for (let i = 0; i < 4; i++) assert.equal(runtime.submit({ ...stop, commandId: `bad-dependency-${i}`, after: ['queued-0'] }).error.code, 'INVALID_DEPENDENCY')
  assert.equal(runtime.submit(stop).status, 'completed')
  assert.equal(runtime.submit(stop).status, 'completed')
  assert.equal(runtime.submit({ ...base(runtime, 'cancel'), type: 'command.cancel', targetCommandId: 'queued-0' }).status, 'completed')
  assert.equal(runtime.getRecord('queued-0').status, 'cancelled')
  assert(runtime.snapshot().records.length <= 512)
})

test('storage failure does not prevent stopping an already-running activity', t => {
  let fail = false
  const runtime = createOfficeRuntime({ persistence: { load: () => null, save() { if (fail) throw new Error('quota') } } })
  t.after(() => runtime.dispose())
  runtime.submit({ ...base(runtime, 'focus'), type: 'activity.start', capability: 'office.focus',
    participants: [{ entityId: 'office-lead', role: 'worker' }], params: { title: 'Focus' } })
  fail = true
  runtime.submit({ ...base(runtime, 'presentation'), type: 'actor.presentation.set', actorId: 'office-lead', status: 'idle', title: '', sourceRevision: 1 })
  assert(runtime.snapshot().persistenceError)
  assert.equal(runtime.submit({ ...base(runtime, 'stop'), type: 'activity.stop', activityId: 'focus' }).status, 'completed')
  assert.equal(runtime.snapshot().activities[0].status, 'cancelled')
  assert(runtime.snapshot().resources.every(resource => !resource.holders.length))
})

test('scene packages atomically reject removal of required objects from maps', t => {
  for (const [pack, id] of [[createFarmScenePack(() => 0), 'harvest-store'], [classroomScenePack, 'blackboard']]) {
    const runtime = createSceneRuntime(pack); t.after(() => runtime.dispose())
    assert.equal(beginMapEdit(runtime, 'begin').status, 'completed')
    const before = runtime.editorSnapshot()
    const result = editMapDraft(runtime, 'remove', { action: 'patch', operations: [{ op: 'prop.remove', id }], requireValid: false })
    assert.equal(result.error.code, 'REQUIRED_ENTITY_MISSING')
    assert.deepEqual(runtime.editorSnapshot(), before)
    const document = runtime.exportMap(); document.props = document.props.filter(prop => prop.id !== id)
    assert.equal(editMapDraft(runtime, 'replace', { action: 'patch', operations: [{ op: 'map.replace', document }] }).error.code, 'REQUIRED_ENTITY_MISSING')
    assert.equal(editMapDraft(runtime, 'commit', { action: 'commit' }).status, 'completed')
    assert(runtime.readWorld().props.some(prop => prop.id === id))
  }
})

test('scene state and required entities are validated on checkpoint restore without overwriting corrupt saves', t => {
  const pack = createFarmScenePack(() => 0), original = createSceneRuntime(pack)
  t.after(() => original.dispose())
  for (const mutate of [world => { world.props = world.props.filter(prop => prop.id !== 'harvest-store') },
    world => { world.props[0].state = { crop: null, plantedAt: -1, wateredAt: -1 } }]) {
    const saved = original.checkpoint(); mutate(saved.world)
    let writes = 0
    const restored = createSceneRuntime(pack, { persistence: { load: () => saved, save: () => { writes++ } } })
    t.after(() => restored.dispose())
    assert(restored.snapshot().persistenceError)
    assert.equal(restored.readWorld().props.length, 7)
    assert.equal(writes, 0)
  }
})

test('new stateful map objects use the template default rather than an invalid empty object', t => {
  const runtime = createOfficeRuntime(); t.after(() => runtime.dispose())
  const original = runtime.exportMap().props.find(prop => prop.templateId === 'office.whiteboard')
  beginMapEdit(runtime, 'begin')
  const result = editMapDraft(runtime, 'replace-board', { action: 'patch', requireValid: true, operations: [
    { op: 'prop.remove', id: original.id }, { op: 'prop.put', prop: { ...original, id: 'new-board' } },
  ] })
  assert.equal(result.status, 'completed')
  assert.equal(editMapDraft(runtime, 'commit', { action: 'commit' }).status, 'completed')
  assert.deepEqual(runtime.readWorld().props.find(prop => prop.id === 'new-board').state, { title: '', text: '' })
})

test('assignment deduplication stays bounded and ignores non-behavior events', t => {
  const runtime = createOfficeRuntime(); t.after(() => runtime.dispose())
  const bridge = new DashboardSceneBridge(runtime), data = summary(0)
  for (const kind of ['note', 'task.assigned']) for (let batch = 0; batch < 20; batch++) {
    data.events = Array.from({ length: 500 }, (_, i) => ({ id: `${kind}-${batch}-${i}`, kind }))
    bridge.sync(data)
    assert(bridge.seenEvents.size <= 1024)
    if (kind === 'note') assert.equal(bridge.seenEvents.size, 0)
  }
  const before = [...bridge.seenEvents]
  bridge.sync(data)
  assert.deepEqual([...bridge.seenEvents], before)
})

test('classroom completion count survives bounded history pruning and excludes cancellations', t => {
  let now = 0
  const runtime = createSceneRuntime(classroomScenePack, { now: () => now }); t.after(() => runtime.dispose())
  const say = id => ({ ...base(runtime, id), type: 'activity.start', capability: 'scene.say',
    participants: [{ entityId: 'teacher', role: 'actor' }], params: { text: 'Hello', durationMs: 300 } })
  for (let i = 0; i < 501; i++) {
    assert.equal(runtime.submit(say(`say-${i}`)).status, 'running')
    for (let step = 0; step < 3; step++) { now += 100; runtime.tick(100) }
    assert.equal(runtime.completedActivityCount, i + 1)
  }
  assert(runtime.snapshot().records.length < 500)
  runtime.submit(say('cancelled'))
  runtime.submit({ ...base(runtime, 'cancel'), type: 'command.cancel', targetCommandId: 'cancelled' })
  runtime.submit({ ...say('failed'), params: {} })
  assert.equal(runtime.completedActivityCount, 501)
})
