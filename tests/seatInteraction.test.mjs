import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { base, visit, use, safeTick, until, completed, noClaims, distance } from './helpers/grid.mjs'
let server, createOfficeRuntime, OfficeRuntime, GridNavigation, SeatInteractions, PluginHost, pack
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/src/runtime/createOfficeRuntime.ts'))
  ;({ OfficeRuntime } = await server.ssrLoadModule('/src/runtime/OfficeRuntime.ts'))
  ;({ GridNavigation } = await server.ssrLoadModule('/src/runtime/navigation.ts'))
  ;({ SeatInteractions } = await server.ssrLoadModule('/src/runtime/seatInteraction.ts'))
  ;({ PluginHost } = await server.ssrLoadModule('/src/runtime/plugins.ts'))
  pack = await server.ssrLoadModule('/src/runtime/builtin/officePack.ts')
})
after(() => server?.close())
test('furniture entrances and use paths contain adjacent whole cells only', () => {
  const r = createOfficeRuntime(), world = r.readWorld(), templates = { template: id => r.template(id) }
  const interactions = new SeatInteractions(r.navigation, templates)
  for (const prop of world.props) for (const id of Object.keys(r.template(prop.templateId).interactions)) {
    const ports = interactions.ports(world, prop.id, id)
    assert(ports.length > 0)
    for (const port of ports) {
      assert(r.navigation.walkable(world, port.approach))
      assert.deepEqual(port.passage[0], port.seat)
      assert.deepEqual(port.passage.at(-1), port.approach)
      port.passage.slice(1).forEach((p, i) => assert.equal(distance(port.passage[i], p), 1))
    }
  }
})
test('ordinary movement cannot cross any furniture, including an empty chair', () => {
  const r = createOfficeRuntime(), world = r.readWorld(), p = world.props[0].position
  for (const cell of [{ x: p.x, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }]) assert(!r.navigation.walkable(world, cell))
  assert(r.navigation.walkable(world, { x: p.x, y: p.y + 1 }, { contact: { propId: 'desk-0', interactionId: 'seat' } }))
})
test('office chairs dock from the sides and retain rear anchors for ordinary movement', () => {
  const r = createOfficeRuntime(), world = r.readWorld()
  try {
    const interactions = new SeatInteractions(r.navigation, { template: id => r.template(id) })
    assert.deepEqual(r.template('office.workstation').interactions.seat.approaches, ['seatLeft', 'seatRight'])
    for (const prop of world.props.filter(item => item.templateId === 'office.workstation')) {
      const ports = interactions.ports(world, prop.id)
      assert.equal(ports.length, 2)
      assert(ports.every(port => port.approach.y === port.seat.y))
      assert.deepEqual(r.navigation.anchor(world, prop.id, 'visitorFront'), { x: prop.position.x, y: prop.position.y + 2 })
    }
  } finally { r.dispose() }
})
test('blocking a left entrance is valid when another entrance remains connected', () => {
  const r = createOfficeRuntime(), world = r.readWorld()
  world.blockedAreas = [{ id: 'left-block', name: 'Blocked cell', bounds: { left: 5, top: 5, right: 6, bottom: 6 } }]
  assert.doesNotThrow(() => r.navigation.validate(world))
  const interactions = new SeatInteractions(r.navigation, { template: id => r.template(id) })
  const ports = interactions.ports(world, 'desk-0')
  assert(ports.length > 0)
  assert(ports.every(p => p.approach.x !== 5 || p.approach.y !== 5))
})
test('seat interactions raise, walk, align and sit while chairs remain fixed', () => {
  const r = createOfficeRuntime(), original = r.readWorld().props, stages = new Set()
  r.submit(visit())
  until(r, () => {
    const a = r.readActors()[0]
    if (a.seatTransition) stages.add(a.seatTransition.stage)
    assert.deepEqual(r.readWorld().props, original)
    return r.getRecord('visit').status !== 'running'
  })
  assert.equal(r.getRecord('visit').status, 'completed')
  assert.deepEqual([...stages].sort(), ['aligning', 'entering', 'exiting', 'rising', 'sitting'])
  assert.deepEqual(r.readActors()[0].using, { propId: 'desk-0', interactionId: 'seat' })
  noClaims(r)
})
test('cancellation at every transition stage settles safely and releases reserved cells', () => {
  for (const stage of ['rising', 'exiting', 'aligning', 'entering', 'sitting']) {
    const r = createOfficeRuntime()
    r.submit(visit())
    until(r, () => r.readActors()[0].seatTransition?.stage === stage)
    for (let i = 0; i < 2; i++) safeTick(r)
    r.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'visit' })
    until(r, () => !r.readActors()[0].seatTransition && !r.readActors()[0].step)
    assert.equal(r.getRecord('visit').status, 'cancelled')
    noClaims(r)
    assert.doesNotThrow(() => r.setEditing(true))
  }
})
test('a seated host turns to listen and reply without leaving the chair', () => {
  const r = createOfficeRuntime(), position = r.readActors()[1].position
  r.submit(visit())
  until(r, () => r.readActors()[0].speech)
  assert.deepEqual(r.readActors()[1].position, position)
  assert.equal(r.readActors()[1].posture, 'seated')
  assert.notEqual(r.readActors()[1].facing, 'back')
  until(r, () => r.readActors()[1].speech)
  r.submit({ ...base('stop'), type: 'command.cancel', targetCommandId: 'visit' })
  for (let i = 0; i < 30; i++) safeTick(r)
  assert.equal(r.readActors()[1].facing, 'back')
  noClaims(r)
})
test('standing expressions exit before playing and restore the owned seat afterwards', () => {
  const r = createOfficeRuntime()
  r.submit({ ...base('emote'), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: 'marvis', role: 'actor' }], params: { animation: 'emotes/wave', durationMs: 300 } })
  until(r, () => r.readActors()[0].expression)
  assert.equal(r.readActors()[0].posture, 'standing')
  assert(r.navigation.walkable(r.readWorld(), r.readActors()[0].position))
  completed(r, 'emote')
  assert.equal(r.readActors()[0].posture, 'seated')
})
test('generic furniture use reaches the whiteboard, queues competitors and returns home', () => {
  const r = createOfficeRuntime()
  assert.equal(r.submit(use('first')).status, 'running')
  assert.equal(r.submit(use('second', 'whiteboard-1', 'code-agent')).status, 'queued')
  until(r, () => r.readActors()[0].using?.propId === 'whiteboard-1')
  assert.equal(r.readActors()[0].posture, 'standing')
  completed(r, 'first'); completed(r, 'second')
  assert(r.readActors().every(a => a.posture === 'seated'))
  noClaims(r)
})
test('cancelled furniture use frees the shared resource for the next waiting user', () => {
  const r = createOfficeRuntime()
  r.submit(use('first'))
  r.submit(use('second', 'whiteboard-1', 'code-agent'))
  until(r, () => r.readActors()[0].seatTransition?.stage === 'exiting')
  r.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'first' })
  completed(r, 'second')
  noClaims(r)
})
test('cancelling during actual appliance use vacates its cell before releasing the queue', () => {
  const r = createOfficeRuntime()
  const first = use('first'); first.params.durationMs = 30000
  r.submit(first); r.submit(use('second', 'whiteboard-1', 'code-agent'))
  until(r, () => r.readActors()[0].using?.propId === 'whiteboard-1')
  r.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'first' })
  completed(r, 'second'); noClaims(r)
  assert.equal(r.readActors()[0].using, undefined)
})
test('a plugin-defined standing appliance can occupy an internal use cell', () => {
  const world = pack.createOfficeWorld()
  world.props.push({ id: 'appliance', templateId: 'test.appliance', name: 'Appliance', position: { x: 14, y: 7 }, state: {}, stateRevision: 0 })
  const plugin = { id: 'test.appliance', name: 'Appliance', apiVersion: 1, version: '1.0.0', templates: [{
    id: 'test.appliance', name: 'Appliance', view: 'fallback', footprint: { left: 0, top: 0, right: 1, bottom: 1 },
    anchors: { use: { x: 0, y: 0 }, entrance: { x: 0, y: 1 } }, resources: {},
    interactions: { operate: { name: 'Operate', anchor: 'use', approaches: ['entrance'], cells: [{ x: 0, y: 0 }], posture: 'standing', facing: 'back' } },
  }] }
  const r = new OfficeRuntime({ world, plugins: [...pack.builtinPlugins, plugin], createNavigation: templates => new GridNavigation(templates) })
  r.submit(use('appliance-use', 'appliance', 'marvis', 'operate'))
  until(r, () => r.readActors()[0].using?.propId === 'appliance')
  assert.deepEqual(r.readActors()[0].position, { x: 14, y: 7 })
  completed(r, 'appliance-use'); noClaims(r)
})
test('plugin registration rejects fractional geometry and unsafe internal entrances', () => {
  for (const mutate of [
    t => { t.footprint.right = 1.5 },
    t => { t.anchors.seat.x = .5 },
    t => { t.interactions.seat.cells.push({ x: 4, y: 4 }) },
    t => { t.interactions.seat.approaches = ['seat'] },
  ]) {
    const host = new PluginHost(), plugin = { ...pack.officeObjects, templates: structuredClone(pack.officeObjects.templates) }
    mutate(plugin.templates[0])
    assert.throws(() => host.register(plugin), { code: 'INVALID_TEMPLATE' })
  }
})
test('disposing during cancellation releases retained body and furniture claims', () => {
  const r = createOfficeRuntime()
  r.submit(visit()); safeTick(r)
  r.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'visit' })
  r.dispose(); noClaims(r)
})
