import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { createTestServer } from './helpers/vite.mjs'

let server, createOfficeRuntime, OfficeRuntime, PluginHost, ResourceManager, GridNavigation, pack
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts'))
  ;({ OfficeRuntime } = await server.ssrLoadModule('/src/runtime/OfficeRuntime.ts'))
  ;({ PluginHost } = await server.ssrLoadModule('/src/runtime/plugins.ts'))
  ;({ ResourceManager } = await server.ssrLoadModule('/src/runtime/resources.ts'))
  ;({ GridNavigation } = await server.ssrLoadModule('/src/runtime/navigation.ts'))
  pack = await server.ssrLoadModule('/src/runtime/builtin/officePack.ts')
})
after(() => server?.close())

const base = id => ({ protocolVersion: '2.0', sceneId: 'office-1', commandId: id })
const visit = (id = 'visit', visitor = 'marvis', host = 'code-agent') => ({ ...base(id), type: 'activity.start', capability: 'office.visit', participants: [{ entityId: visitor, role: 'visitor' }, { entityId: host, role: 'host' }], params: { stops: [{ hostId: host, message: 'hello' }], durationMs: 300 } })
const focus = (id = 'focus', actor = 'marvis') => ({ ...base(id), type: 'activity.start', capability: 'office.focus', participants: [{ entityId: actor, role: 'worker' }], params: { title: 'analysis' } })
const emote = (id = 'emote', actor = 'marvis') => ({ ...base(id), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: actor, role: 'actor' }], params: { animation: 'emotes/wave', durationMs: 300 } })
function setup(options = {}) {
  let now = 1000
  const runtime = createOfficeRuntime({ now: () => now, ...options })
  return { runtime, advance(ms) { for (let i = 0; i < ms; i += 50) { now += 50; runtime.tick(50) } }, jump(ms) { now += ms; runtime.tick(0) } }
}
const noClaims = runtime => assert(runtime.snapshot().resources.every(r => !r.holders.length))

test('headless runtime executes a visit, emits phases and restores seated posture', () => {
  const { runtime, advance } = setup()
  const initial = runtime.readActors()[0].position
  assert.equal(runtime.submit(visit()).status, 'running')
  advance(500)
  assert.deepEqual(runtime.readActors()[0].position, initial)
  assert.equal(runtime.readActors()[0].seatTransition.stage, 'rising')
  advance(1100)
  assert.notDeepEqual(runtime.readActors()[0].position, initial)
  advance(20000)
  assert.equal(runtime.getRecord('visit').status, 'completed')
  assert.deepEqual(runtime.readActors()[0].position, initial)
  assert.equal(runtime.readActors()[0].posture, 'seated')
  assert(runtime.snapshot().events.some(e => e.type === 'activity.phase'))
  noClaims(runtime)
})

test('schema, scene, duplicate ID and plugin parameter validation precede execution', () => {
  const { runtime } = setup()
  for (const value of [null, {}, { ...visit(), protocolVersion: '9' }, { ...visit(), injectedCode: 'eval' }]) assert.equal(runtime.submit(value).error.code, 'INVALID_COMMAND')
  assert.equal(runtime.submit({ ...visit('wrong-scene'), sceneId: 'other' }).error.code, 'SCENE_MISMATCH')
  assert.equal(runtime.submit({ ...visit('bad-params'), params: { stops: 'bad' } }).error.code, 'INVALID_PARAMS')
  assert.equal(runtime.submit(visit()).status, 'running')
  assert.equal(runtime.submit(visit()).status, 'running')
  assert.equal(runtime.snapshot().activities.length, 1)
  assert.equal(runtime.submit({ ...visit(), params: { stops: [] } }).error.code, 'COMMAND_ID_CONFLICT')
})

test('resource conflict queues fairly; unrelated actors continue in parallel', () => {
  const { runtime, advance } = setup()
  runtime.submit(visit('first'))
  assert.equal(runtime.submit(visit('second', 'file-agent', 'marvis')).status, 'queued')
  assert.equal(runtime.submit(visit('third', 'review-agent', 'data-agent')).status, 'running')
  assert.equal(runtime.submit({ ...emote('reject'), busyPolicy: 'reject' }).error.code, 'BUSY')
  advance(60000)
  for (const id of ['first', 'second', 'third']) assert.equal(runtime.getRecord(id).status, 'completed')
  noClaims(runtime)
})

test('capabilities reject unknown participant roles and unrelated extra participants', () => {
  const { runtime } = setup()
  const wrongHost = visit('wrong-role')
  wrongHost.participants[1].role = 'observer'
  assert.equal(runtime.submit(wrongHost).error.code, 'INVALID_PARTICIPANTS')
  const extra = focus('extra-person')
  extra.participants.push({ entityId: 'code-agent', role: 'observer' })
  assert.equal(runtime.submit(extra).error.code, 'INVALID_PARTICIPANTS')
  const meeting = { ...base('wrong-meeting-role'), type: 'activity.start', capability: 'office.meeting',
    participants: [{ entityId: 'marvis', role: 'speaker' }, { entityId: 'code-agent', role: 'observer' }],
    params: { boardId: 'whiteboard-1', text: 'Agenda' } }
  assert.equal(runtime.submit(meeting).error.code, 'INVALID_PARTICIPANTS')
  noClaims(runtime)
})

test('four-person meeting has a shared activity and waits for all arrivals', () => {
  const { runtime, advance } = setup()
  const participants = ['marvis', 'code-agent', 'file-agent', 'app-agent'].map((entityId, i) => ({ entityId, role: i ? 'attendee' : 'speaker' }))
  runtime.submit({ ...base('meeting'), type: 'activity.start', capability: 'office.meeting', participants, params: { boardId: 'whiteboard-1', text: 'Agenda', durationMs: 1000 } })
  advance(500)
  assert.equal(runtime.snapshot().activities[0].phaseIndex, 0)
  assert.equal(runtime.snapshot().activities[0].participants.length, 4)
  for (let elapsed = 0; elapsed < 60000 && runtime.getRecord('meeting').status === 'running'; elapsed += 50) advance(50)
  assert.equal(runtime.getRecord('meeting').status, 'completed')
  assert(runtime.readActors().every(a => a.posture === 'seated'))
  noClaims(runtime)
})

test('continuous activity outlives its start command and stops explicitly', () => {
  const { runtime, advance } = setup()
  const started = runtime.submit(focus())
  assert.equal(started.status, 'completed')
  advance(5000)
  assert.equal(runtime.snapshot().activities[0].status, 'active')
  assert.equal(runtime.submit(emote()).status, 'queued')
  assert.equal(runtime.submit({ ...base('stop'), type: 'activity.stop', activityId: started.activityId }).status, 'completed')
  advance(5000)
  assert.equal(runtime.getRecord('emote').status, 'completed')
  assert.equal(runtime.getRecord('focus').status, 'completed', 'start-command result remains immutable')
  noClaims(runtime)
})

test('cancel stops movement in place, frees resources and does not teleport', () => {
  const { runtime, advance } = setup()
  runtime.submit(visit())
  for (let i = 0; i < 80 && runtime.readActors()[0].seatTransition; i++) advance(50)
  advance(50)
  const position = runtime.readActors()[0].step?.to ?? runtime.readActors()[0].position
  runtime.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'visit' })
  advance(1000)
  assert.deepEqual(runtime.readActors()[0].position, position)
  assert.equal(runtime.readActors()[0].motion, undefined)
  assert.equal(runtime.getRecord('visit').status, 'cancelled')
  noClaims(runtime)
})

test('presentation state is independent of movement and rejects stale revisions', () => {
  const { runtime, advance } = setup()
  runtime.submit(visit()); advance(500)
  const motion = runtime.readActors()[0].motion
  const command = { ...base('presentation'), type: 'actor.presentation.set', actorId: 'marvis', status: 'thinking', title: 'External task', sourceRevision: 1 }
  assert.equal(runtime.submit(command).status, 'completed')
  assert.deepEqual(runtime.readActors()[0].motion, motion)
  assert.equal(runtime.submit({ ...command, commandId: 'stale' }).error.code, 'STALE_REVISION')
  advance(20000)
  assert.equal(runtime.readActors()[0].presentation.title, 'External task')
})

test('wall-clock deadline and timeout terminate without requiring animation catch-up', () => {
  const { runtime, jump } = setup()
  runtime.submit({ ...visit('timeout'), timeoutMs: 100 })
  jump(5000)
  assert.equal(runtime.getRecord('timeout').error.code, 'EXECUTION_TIMEOUT')
  runtime.submit(focus())
  runtime.submit({ ...emote(), expiresAt: new Date(6500).toISOString() })
  jump(1000)
  assert.equal(runtime.getRecord('emote').status, 'expired')
})

test('sequential batch stops after failed prerequisite; independent parallel batch continues', () => {
  const { runtime, advance } = setup()
  const results = runtime.submitBatch({ mode: 'sequence', commands: [{ ...emote('one'), capability: 'unknown' }, emote('two')] })
  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].error.code, 'DEPENDENCY_FAILED')
  const parallel = runtime.submitBatch({ mode: 'parallel', commands: [emote('p1'), emote('p2', 'code-agent')] })
  assert(parallel.every(r => r.status === 'running'))
  advance(5000); noClaims(runtime)
})

test('plugin dependency checks, operation discovery and busy-disable policy', () => {
  const host = new PluginHost()
  assert.throws(() => host.register(pack.officeVisits), /office.objects/)
  host.register(pack.officeObjects)
  assert.throws(() => host.register(pack.officeObjects), /office.objects/)
  const { runtime, advance } = setup()
  runtime.submit(visit())
  assert.throws(() => runtime.setPluginEnabled('office.visits', false), /插件/)
  advance(20000)
  runtime.setPluginEnabled('office.visits', false)
  assert.equal(runtime.submit(visit('disabled')).error.code, 'UNSUPPORTED_CAPABILITY')
  runtime.setPluginEnabled('office.visits', true)
  assert.equal(runtime.submit(visit('enabled')).status, 'running')
  const info = runtime.describe()
  assert(info.command.oneOf || info.command.anyOf)
  assert(info.plugins.find(p => p.id === 'office.visits').operations[0].params.properties.stops)
})

test('state changes validate capability schemas and revisions, not arbitrary fields', () => {
  const { runtime } = setup()
  const command = { ...base('board'), type: 'object.state.set', entityId: 'whiteboard-1', expectedStateRevision: 0, state: { title: 'Title', text: 'Body' } }
  assert.equal(runtime.submit(command).status, 'completed')
  assert.equal(runtime.submit({ ...command, commandId: 'old' }).error.code, 'REVISION_CONFLICT')
  assert.equal(runtime.submit({ ...command, commandId: 'desk', entityId: 'desk-0', state: { position: { x: 0, y: 0 } } }).error.code, 'STATE_READONLY')
  assert.equal(runtime.submit({ ...command, commandId: 'unsafe', expectedStateRevision: 1, state: { title: 'x', text: 'x', script: 'x' } }).status, 'failed')
})

function layout(runtime, id = 'layout', mutate = () => {}) {
  const world = runtime.readWorld()
  const placements = world.props.map(p => ({ entityId: p.id, position: { ...p.position } }))
  mutate(placements)
  return { ...base(id), type: 'layout.apply', expectedLayoutRevision: world.layoutRevision, placements }
}
test('layout update is atomic and recomputes seat bindings, navigation and version', () => {
  const { runtime, advance } = setup()
  const command = layout(runtime, 'layout', p => { p[0].position.x += 1 })
  const expectedX = command.placements[0].position.x
  runtime.setEditing(true)
  assert.equal(runtime.submit(visit()).error.code, 'EDITING')
  assert.equal(runtime.submit(command).status, 'completed')
  runtime.setEditing(false)
  assert.equal(runtime.readActors()[0].position.x, expectedX)
  assert.equal(runtime.readWorld().layoutRevision, 1)
  assert.equal(runtime.submit({ ...command, commandId: 'old-layout' }).error.code, 'REVISION_CONFLICT')
  const before = runtime.readWorld()
  assert.equal(runtime.submit(layout(runtime, 'overlap', p => { p[0].position = p[1].position })).error.code, 'OVERLAP')
  assert.deepEqual(runtime.readWorld(), before)
  runtime.submit(visit('after-layout')); advance(20000)
  assert.equal(runtime.getRecord('after-layout').status, 'completed')
  assert.equal(runtime.readActors()[0].position.x, expectedX)
})

test('editing and layout changes reject active activity and queued spatial work', () => {
  const { runtime } = setup()
  runtime.submit(focus())
  assert.throws(() => runtime.setEditing(true), /活动/)
  assert.equal(runtime.submit(layout(runtime)).error.code, 'BUSY')
})

test('layout errors name objects and distinguish overlap, clearance and out-of-bounds', () => {
  const { runtime } = setup()
  const before = runtime.readWorld()
  assert.doesNotThrow(() => runtime.navigation.validate(before))
  const moveBoard = (id, position) => runtime.submit(layout(runtime, id, placements => {
    placements.find(p => p.entityId === 'whiteboard-1').position = position
  }))
  const desk = before.props.find(p => p.id === 'desk-2').position
  const overlap = moveBoard('overlapping-board', { ...desk })
  assert.equal(overlap.error.code, 'OVERLAP')
  assert.match(overlap.error.message, /周理.*占用|协作白板.*周理/)
  assert.doesNotMatch(overlap.error.message, /desk-2|whiteboard-1/)
  const close = moveBoard('nearby-board', { x: desk.x - 1, y: desk.y })
  assert.equal(close.error.code, 'OVERLAP')
  const outside = moveBoard('outside-board', { x: 100, y: 300 })
  assert.equal(outside.error.code, 'OUT_OF_BOUNDS')
  assert.match(outside.error.message, /协作白板.*超出/)
  assert.deepEqual(runtime.readWorld(), before, 'invalid placements never change the saved layout')
})

test('snapshots are isolated and two runtime instances do not share world or queues', () => {
  const first = setup().runtime, second = setup().runtime
  first.submit(visit())
  const snapshot = first.snapshot()
  snapshot.world.actors[0].position.x = -900
  snapshot.activities[0].plan.phases.length = 0
  assert.equal(second.snapshot().activities.length, 0)
  assert.notEqual(first.readActors()[0].position.x, -900)
  assert(first.snapshot().activities[0].plan.phases.length > 0)
  first.dispose(); noClaims(first)
  assert.equal(first.submit(emote()).error.code, 'RUNTIME_DISPOSED')
  assert.equal(second.submit(emote()).status, 'running')
})

test('persisted queued/running commands fail explicitly on restart; dedup survives reload', () => {
  let saved
  const persistence = { load: () => saved, save: data => { saved = structuredClone(data) } }
  const { runtime, advance } = setup({ persistence })
  runtime.submit(visit()); advance(500)
  runtime.submit(emote())
  const recovered = setup({ persistence }).runtime
  assert.equal(recovered.getRecord('visit').error.code, 'OUTCOME_UNKNOWN')
  assert.equal(recovered.getRecord('emote').error.code, 'RUNTIME_RESTARTED')
  assert.equal(recovered.submit(visit()).status, 'failed')
  assert.equal(recovered.snapshot().activities.length, 0)
  noClaims(recovered)
})

test('corrupt or incompatible checkpoints are preserved rather than overwritten', () => {
  let writes = 0
  const runtime = setup({ persistence: { load: () => ({ version: 999 }), save: () => { writes++ } } }).runtime
  assert(runtime.snapshot().persistenceError)
  assert.equal(runtime.submit(visit()).error.code, 'PERSISTENCE_FAILED')
  assert.equal(writes, 0)
})

test('legacy checkpoints inherit the room floor without resetting layout, content or history', () => {
  const original = setup().runtime
  original.submit({ ...base('board-text'), type: 'object.state.set', entityId: 'whiteboard-1', expectedStateRevision: 0, state: { title: '保留议题', text: '保留正文' } })
  const saved = original.checkpoint()
  delete saved.world.walkableArea
  saved.world.props[0].position.x += 1
  saved.world.layoutRevision = 7
  saved.world.actors[0].name = '自定义姓名'
  let writes = 0, persisted
  const { runtime, advance } = setup({ persistence: { load: () => saved, save: value => { writes++; persisted = structuredClone(value) } } })
  assert.equal(runtime.snapshot().persistenceError, undefined)
  assert.equal(writes, 0, 'loading does not overwrite the original checkpoint')
  assert.equal(saved.world.walkableArea, undefined)
  assert.deepEqual(runtime.readWorld().walkableArea, original.readWorld().walkableArea)
  assert.deepEqual(runtime.readWorld().props, saved.world.props)
  assert.equal(runtime.readWorld().layoutRevision, 7)
  assert.equal(runtime.readActors()[0].name, '自定义姓名')
  assert.deepEqual(runtime.getRecord('board-text'), saved.records[0])
  assert(!runtime.navigation.walkable(runtime.readWorld(), { x: 470, y: 165 }))
  runtime.submit(visit('after-floor-upgrade')); advance(20000)
  assert.equal(runtime.getRecord('after-floor-upgrade').status, 'completed')
  assert.deepEqual(persisted.world.walkableArea, original.readWorld().walkableArea)
  assert.deepEqual(persisted.world.props, saved.world.props)
})

test('overlapping saved layouts can recover after backup without losing content or replaying tasks', () => {
  const original = setup().runtime
  original.submit({ ...base('board-text'), type: 'object.state.set', entityId: 'whiteboard-1', expectedStateRevision: 0, state: { title: '保留议题', text: '不要丢失白板内容' } })
  original.submit(visit('interrupted-visit'))
  original.submit(emote('waiting-emote'))
  const saved = original.checkpoint()
  saved.world.actors[0].name = '自定义姓名'
  saved.world.props[2].position = { x: saved.world.props[0].position.x, y: saved.world.props[0].position.y + 1 }
  saved.world.layoutRevision = 7
  let active = structuredClone(saved), backup, replacements = 0
  const persistence = {
    load: () => active, save: value => { active = structuredClone(value) },
    replaceWithBackup(expected, replacement) {
      assert.deepEqual(expected, active)
      backup = structuredClone(active)
      active = structuredClone(replacement)
      replacements++
    },
  }
  const { runtime, advance } = setup({ persistence })
  assert.equal(runtime.snapshot().canRecoverLayout, true)
  assert.equal(runtime.submit(visit('blocked')).error.code, 'PERSISTENCE_FAILED')
  assert.throws(() => runtime.setEditing(true), /先恢复存档/)
  assert.deepEqual(active, saved, 'loading must not silently replace the user layout')
  runtime.recoverLayout()
  assert.equal(replacements, 1)
  assert.deepEqual(backup, saved)
  assert.equal(runtime.snapshot().persistenceError, undefined)
  assert.equal(runtime.snapshot().canRecoverLayout, false)
  assert.equal(runtime.readWorld().layoutRevision, 8)
  assert.equal(runtime.readActors()[0].name, '自定义姓名')
  assert.deepEqual(runtime.readWorld().props.at(-1).state, saved.world.props.at(-1).state)
  assert.deepEqual(runtime.getRecord('board-text'), saved.records[0])
  assert.equal(runtime.getRecord('interrupted-visit').error.code, 'OUTCOME_UNKNOWN')
  assert.equal(runtime.getRecord('waiting-emote').error.code, 'RUNTIME_RESTARTED')
  assert.equal(active.activeActivities.length, 0)
  assert.equal(runtime.snapshot().activities.length, 0)
  assert.equal(runtime.submit(visit('recovered-visit')).status, 'running')
  advance(20000)
  assert.equal(runtime.getRecord('recovered-visit').status, 'completed')
  const reloaded = setup({ persistence }).runtime
  assert.equal(reloaded.snapshot().persistenceError, undefined)
  assert.equal(reloaded.getRecord('recovered-visit').status, 'completed')
  assert.deepEqual(backup, saved, 'later saves must not alter the backup')
  noClaims(runtime)
})

test('failed backup or replacement leaves recovery blocked and runtime state unchanged', () => {
  for (const reason of ['backup quota', 'replacement quota']) {
    const saved = setup().runtime.checkpoint()
    saved.world.props[2].position = { ...saved.world.props[0].position }
    let writes = 0
    const runtime = setup({ persistence: { load: () => saved, save: () => { writes++ }, replaceWithBackup: () => { throw new Error(reason) } } }).runtime
    const before = runtime.snapshot()
    assert.throws(() => runtime.recoverLayout(), new RegExp(reason))
    assert.deepEqual(runtime.snapshot(), before)
    assert.equal(runtime.submit(visit()).error.code, 'PERSISTENCE_FAILED')
    assert.equal(writes, 0)
  }
})

test('recovery cannot reset unknown entities, incompatible plugins, or a valid custom layout', () => {
  for (const variant of ['unknown-entity', 'plugin-version', 'valid-custom', 'no-backup']) {
    const saved = setup().runtime.checkpoint()
    if (variant === 'valid-custom') saved.world.props[0].position.x += 1
    else saved.world.props[2].position = { ...saved.world.props[0].position }
    if (variant === 'unknown-entity') saved.world.props.at(-1).id = 'custom-board'
    if (variant === 'plugin-version') saved.pluginVersions['office.objects'] = '999.0.0'
    let writes = 0
    const runtime = setup({ persistence: { load: () => saved, save: () => { writes++ },
      ...(variant === 'no-backup' ? {} : { replaceWithBackup: () => { writes++ } }),
    } }).runtime
    assert.equal(runtime.snapshot().canRecoverLayout, false, variant)
    assert.throws(() => runtime.recoverLayout(), /无法自动恢复布局/)
    assert.equal(writes, 0)
    if (variant === 'valid-custom') {
      assert.equal(runtime.snapshot().persistenceError, undefined)
      assert.deepEqual(runtime.readWorld().props, saved.world.props)
    } else assert.ok(runtime.snapshot().persistenceError)
  }
})

test('storage failure prevents accepting and executing a new command', () => {
  const runtime = setup({ persistence: { load: () => null, save: () => { throw new Error('quota') } } }).runtime
  const result = runtime.submit(visit())
  assert.equal(result.error.code, 'PERSISTENCE_FAILED')
  assert.equal(runtime.snapshot().activities.length, 0)
})

test('restart reports interrupted continuous activities without changing successful start receipts', () => {
  let saved
  const persistence = { load: () => saved, save: data => { saved = structuredClone(data) } }
  const runtime = setup({ persistence }).runtime
  runtime.submit(focus())
  const recovered = setup({ persistence }).runtime
  assert.equal(recovered.getRecord('focus').status, 'completed')
  assert(recovered.snapshot().events.some(e => e.type === 'activity.ended' && e.data.activityId === 'focus' && e.data.error.code === 'RUNTIME_RESTARTED'))
  noClaims(recovered)
})

test('resources are acquired atomically, never partially held while waiting', () => {
  const resources = new ResourceManager()
  resources.define('a'); resources.define('b')
  assert(resources.acquire('one', [{ resource: 'a', units: 1 }]))
  assert.equal(resources.acquire('two', [{ resource: 'b', units: 1 }, { resource: 'a', units: 1 }]), false)
  assert.deepEqual(resources.snapshot().find(r => r.resource === 'b').holders, [])
  resources.release('one')
  assert(resources.acquire('two', [{ resource: 'a', units: 1 }, { resource: 'b', units: 1 }]))
})

test('headless core never imports rendering, browser APIs, adapters, or legacy scene globals', () => {
  for (const name of readdirSync('src/runtime').filter(p => p.endsWith('.ts'))) {
    const source = readFileSync(`src/runtime/${name}`, 'utf8')
    assert.doesNotMatch(source, /from ['"](?:pixi|react|@\/scene|.*adapters\/)|\b(?:document|window|localStorage)\b/, name)
  }
  assert.doesNotMatch(readFileSync('src/runtime/OfficeRuntime.ts', 'utf8'), /GridNavigation|pathfinding/)
})

test('runtime uses the injected navigation adapter for validation, anchors and movement', () => {
  const calls = [], factories = []
  let adapter
  const { runtime, advance } = setup({ createNavigation(templates) {
    factories.push(templates)
    const implementation = new GridNavigation(templates)
    adapter = Object.fromEntries(['validate', 'path', 'anchor', 'walkable', 'segmentClear'].map(method => [method, (...args) => {
      calls.push(method)
      return implementation[method](...args)
    }]))
    return adapter
  } })
  assert.equal(factories.length, 1)
  assert.equal(runtime.navigation, adapter)
  assert.deepEqual(calls, ['validate'])
  assert.equal(runtime.submit(visit()).status, 'running')
  advance(20000)
  assert.equal(runtime.getRecord('visit').status, 'completed')
  assert(calls.includes('path'))
  assert(calls.includes('anchor'))
  assert(calls.includes('segmentClear'))
  assert.equal(runtime.submit(layout(runtime)).status, 'completed')
  assert.equal(calls.filter(c => c === 'validate').length, 2)
})

test('missing navigation target fails without leaving resource claims', () => {
  const plugin = { id: 'test.invalid', name: 'Invalid target', apiVersion: 1, version: '1.0.0', capabilities: [{ ...pack.officePersonal.capabilities[1], id: 'test.move', build() { return { title: 'bad', claims: [{ resource: 'actor:marvis:body', units: 1 }], phases: [{ title: 'move', moves: [{ actorId: 'marvis', targetId: 'missing', anchor: 'seat' }] }] } } }] }
  const runtime = new OfficeRuntime({ world: pack.createOfficeWorld(), plugins: [...pack.builtinPlugins, plugin], createNavigation: templates => new GridNavigation(templates) })
  assert.equal(runtime.submit({ ...emote(), capability: 'test.move' }).error.code, 'ENTITY_NOT_FOUND')
  noClaims(runtime)
})

test('generic actors need no workstation and can speak while moving', () => {
  const world = pack.createOfficeWorld()
  world.actors = [world.actors[0]]
  delete world.actors[0].homeId
  delete world.actors[0].using
  world.actors[0].position = { x: 9, y: 6 }
  world.actors[0].posture = 'standing'
  world.props = [world.props.find(p => p.id === 'whiteboard-1')]
  const runtime = new OfficeRuntime({ world, plugins: pack.builtinPlugins, createNavigation: templates => new GridNavigation(templates) })
  assert.equal(runtime.submit({ ...base('move'), type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'marvis', role: 'actor' }], params: { targetId: 'whiteboard-1', anchor: 'attendee1' } }).status, 'running')
  assert.equal(runtime.submit({ ...base('say'), type: 'activity.start', capability: 'scene.say', participants: [{ entityId: 'marvis', role: 'actor' }], params: { text: '边走边说', durationMs: 1000 } }).status, 'running')
  for (let i = 0; i < 10; i++) runtime.tick(50)
  assert(runtime.readActors()[0].motion)
  assert.equal(runtime.readActors()[0].speech.text, '边走边说')
  for (let i = 0; i < 500; i++) runtime.tick(50)
  assert.equal(runtime.getRecord('move').status, 'completed')
  assert.equal(runtime.getRecord('say').status, 'completed')
  assert.equal(runtime.readActors()[0].posture, 'standing')
  noClaims(runtime)
})

test('moving to an occupied seat fails without overlapping a stationary actor', () => {
  const { runtime } = setup()
  const result = runtime.submit({ ...base('occupied'), type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'marvis', role: 'actor' }], params: { targetId: 'desk-1', anchor: 'seat' } })
  assert.equal(result.error.code, 'SEAT_NOT_OWNED')
  noClaims(runtime)
})

test('visiting a colleague who is away first reunites both participants at the host station', () => {
  const { runtime, advance } = setup()
  runtime.submit({ ...base('away'), type: 'activity.start', capability: 'scene.move', participants: [{ entityId: 'code-agent', role: 'actor' }], params: { targetId: 'whiteboard-1', anchor: 'attendee1' } })
  advance(20000)
  runtime.submit(visit())
  advance(30000)
  assert.equal(runtime.getRecord('visit').status, 'completed')
  assert.equal(runtime.readActors()[1].posture, 'seated')
  noClaims(runtime)
})
