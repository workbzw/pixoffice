import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { beginMapEdit } from './helpers/map.mjs'
import { base, visit, move, safeTick, until, completed, noClaims } from './helpers/grid.mjs'
let server, createOfficeRuntime, MovementController, GridNavigation, pack, advanceCell, actorPixels, CELL_STEP_MS
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts'))
  ;({ MovementController } = await server.ssrLoadModule('/packages/runtime/src/movement.ts'))
  ;({ GridNavigation } = await server.ssrLoadModule('/packages/runtime/src/navigation.ts'))
  ;({ advanceCell, CELL_STEP_MS } = await server.ssrLoadModule('/packages/runtime/src/cellMovement.ts'))
  ;({ actorPixels } = await server.ssrLoadModule('@pixoffice/scene-office/pixi/projection'))
  pack = await server.ssrLoadModule('@pixoffice/scene-office/core/pack')
})
after(() => server?.close())
function fixture() {
  const world = pack.createOfficeWorld(), templates = { template: id => pack.officeObjects.templates.find(t => t.id === id) }
  const nav = new GridNavigation(templates)
  return { world, nav, movement: new MovementController(nav, templates) }
}
function standing(actor, position) { actor.position = position; actor.posture = 'standing'; actor.using = undefined }
function routeError(run, reasonCode) {
  let fault
  assert.throws(run, error => {
    assert.equal(error.code, 'NO_ROUTE')
    assert.equal(error.reasonCode, reasonCode)
    fault = error
    return true
  })
  return fault
}
test('occupied and reserved goals report distinct reasons and identify the actor, target and cell', () => {
  const { world, nav, movement } = fixture(), [actor, other] = world.actors
  standing(actor, { x: 8, y: 6 })
  const target = nav.anchor(world, 'desk-1', 'conversationLeft')
  const move = { actorId: actor.id, targetId: 'desk-1', anchor: 'conversationLeft' }
  standing(other, target)
  const occupied = routeError(() => movement.resolve(world, move, new Set(), []), 'TARGET_OCCUPIED')
  assert.match(occupied.message, /\[TARGET_OCCUPIED\]/)
  assert(occupied.message.includes(actor.name) && occupied.message.includes(other.name))
  assert.equal(occupied.details.actorId, actor.id)
  assert.equal(occupied.details.targetId, 'desk-1')
  assert.deepEqual(occupied.details.failures[0].position, target)
  assert.equal(occupied.details.failures[0].blockers[0].entityId, other.id)
  const reserved = routeError(() => movement.resolve(world, move, new Set(), [target]), 'TARGET_RESERVED')
  assert.deepEqual(reserved.details.failures[0].position, target)
})
test('mixed candidate failures retain every reason instead of blaming the last candidate', () => {
  const { world, nav, movement } = fixture(), [actor, other] = world.actors
  standing(actor, { x: 8, y: 6 })
  const left = nav.anchor(world, 'desk-1', 'conversationLeft'), right = nav.anchor(world, 'desk-1', 'conversationRight')
  standing(other, right)
  const error = routeError(() => movement.resolve(world, { actorId: actor.id, targetId: 'desk-1', anchor: 'conversationLeft', alternatives: ['conversationRight'] }, new Set(), [left]), 'MULTIPLE_ROUTE_FAILURES')
  assert.deepEqual(error.details.failures.map(failure => [failure.anchor, failure.reasonCode]), [
    ['conversationLeft', 'TARGET_RESERVED'], ['conversationRight', 'TARGET_OCCUPIED'],
  ])
  assert(error.message.includes('TARGET_RESERVED') && error.message.includes('TARGET_OCCUPIED'))
})
test('temporarily occupied departure passages identify the blocking actors', () => {
  const { world, movement } = fixture(), actor = world.actors[0]
  const ports = movement.seats.ports(world, actor.homeId)
  assert.equal(ports.length, 2)
  ports.forEach((port, index) => standing(world.actors[index + 1], port.approach))
  const error = routeError(() => movement.resolve(world, { actorId: actor.id, targetId: 'desk-3', anchor: 'conversationLeft' }, new Set(), []), 'DEPARTURE_OCCUPIED')
  assert.equal(error.details.failures.length, 2)
  assert.deepEqual(error.details.failures.flatMap(failure => failure.blockers.map(blocker => blocker.entityId)).sort(), world.actors.slice(1, 3).map(actor => actor.id).sort())
})
test('unavailable departure and arrival entrances are distinct from occupied targets', () => {
  for (const departure of [true, false]) {
    const { world, nav, movement } = fixture(), actor = world.actors[0]
    const ports = movement.seats.ports(world, actor.homeId)
    world.blockedAreas = ports.map((port, index) => ({ id: `blocked-${index}`, name: 'Blocked entrance', bounds: {
      left: port.approach.x, top: port.approach.y, right: port.approach.x + 1, bottom: port.approach.y + 1,
    } }))
    if (!departure) standing(actor, nav.anchor(world, actor.homeId, 'visitorFront'))
    const error = routeError(() => movement.resolve(world, { actorId: actor.id, targetId: departure ? 'desk-3' : actor.homeId, anchor: departure ? 'conversationLeft' : 'seat' }, new Set(), []), departure ? 'DEPARTURE_ENTRY_UNAVAILABLE' : 'ARRIVAL_ENTRY_UNAVAILABLE')
    assert.equal(error.details.failures[0].propId, actor.homeId)
  }
})
test('navigation distinguishes blocked start, blocked goal and disconnected paths', () => {
  const { world, nav } = fixture()
  const from = { x: 8, y: 6 }, to = nav.anchor(world, 'desk-1', 'conversationLeft'), blocked = world.actors[0].position
  assert(nav.walkable(world, from) && nav.walkable(world, to))
  routeError(() => nav.path(world, blocked, to), 'START_BLOCKED')
  routeError(() => nav.path(world, from, blocked), 'TARGET_BLOCKED')
  world.blockedAreas = [{ id: 'divider', name: 'Divider', bounds: { left: 9, top: world.bounds.top, right: 10, bottom: world.bounds.bottom } }]
  const error = routeError(() => nav.path(world, from, to), 'PATH_DISCONNECTED')
  assert.deepEqual(error.details, { from, to })
})
test('route diagnostics survive command receipts, events and checkpoint restoration', () => {
  let saved
  const persistence = { load: () => saved, save: checkpoint => { saved = structuredClone(checkpoint) } }
  const runtime = createOfficeRuntime({ persistence })
  try {
    runtime.submit(move('occupy-target', 'desk-1', 'conversationLeft', 'code-agent'))
    completed(runtime, 'occupy-target')
    const result = runtime.submit(move('blocked-target', 'desk-1', 'conversationLeft'))
    assert.equal(result.error.code, 'NO_ROUTE')
    assert.equal(result.error.reasonCode, 'TARGET_OCCUPIED')
    assert.equal(result.error.details.actorId, 'office-lead')
    const event = runtime.snapshot().events.find(event => event.type === 'command.status' && event.data.commandId === 'blocked-target' && event.data.status === 'failed')
    assert.deepEqual(event.data.error, result.error)
    const recovered = createOfficeRuntime({ persistence })
    try { assert.deepEqual(recovered.getRecord('blocked-target').error, result.error) }
    finally { recovered.dispose() }
  } finally { runtime.dispose() }
})
test('position commits only at integer cell boundaries while pixels interpolate smoothly', () => {
  const { world, nav } = fixture(), actor = world.actors[0]
  standing(actor, { x: 8, y: 6 })
  const start = actorPixels(actor)
  advanceCell(world, actor, { x: 9, y: 6 }, CELL_STEP_MS / 2, nav)
  assert.deepEqual(actor.position, { x: 8, y: 6 })
  assert.deepEqual(actorPixels(actor), { x: start.x + 25, y: start.y })
  advanceCell(world, actor, { x: 9, y: 6 }, CELL_STEP_MS / 2, nav)
  assert.deepEqual(actor.position, { x: 9, y: 6 })
  assert.equal(actor.step, undefined)
  assert.throws(() => advanceCell(world, actor, { x: 11, y: 6 }, 50, nav), { code: 'INVALID_STEP' })
})
test('a committed edge owns both cells so opposite actors cannot swap through one another', () => {
  const { world, nav } = fixture(), [a, b] = world.actors
  standing(a, { x: 8, y: 6 }); standing(b, { x: 10, y: 6 })
  assert.equal(advanceCell(world, a, { x: 9, y: 6 }, 50, nav), 'moving')
  assert.equal(advanceCell(world, b, { x: 9, y: 6 }, 50, nav), 'blocked')
  standing(b, { x: 9, y: 5 })
  assert.equal(advanceCell(world, b, { x: 9, y: 6 }, 50, nav), 'blocked')
})
test('standing visitors already at either side stop there instead of circling a workstation', () => {
  for (const anchor of ['conversationLeft', 'conversationRight', 'visitorFront']) {
    const { world, nav, movement } = fixture(), actor = world.actors[0]
    standing(actor, nav.anchor(world, 'desk-1', anchor))
    const result = movement.resolve(world, { actorId: actor.id, targetId: 'desk-1', anchor: 'conversationLeft', alternatives: ['conversationRight', 'visitorFront'] }, new Set(), [])
    assert.deepEqual(result.destination, actor.position)
    assert.equal(result.distance, 0)
    assert.deepEqual(result.path, [])
  }
})
test('seated horizontal neighbors depart and arrive on the nearest side', () => {
  for (const [a, b, side] of [[0, 1, 'seatRight'], [1, 0, 'seatLeft'], [2, 3, 'seatRight'], [3, 2, 'seatLeft'], [4, 5, 'seatRight'], [5, 4, 'seatLeft']]) {
    const { world, nav, movement } = fixture(), actor = world.actors[a]
    const result = movement.resolve(world, { actorId: actor.id, targetId: world.actors[b].homeId, anchor: 'conversationLeft', alternatives: ['conversationRight', 'visitorFront'] }, new Set(), [])
    assert.deepEqual(result.departure.approach, nav.anchor(world, actor.homeId, side))
  }
})
test('an occupied arrival entrance selects an available alternative instead of waiting at it', () => {
  const { world, nav, movement } = fixture(), [actor, other] = world.actors
  standing(actor, { x: 5, y: 6 })
  standing(other, nav.anchor(world, actor.homeId, 'seatLeft'))
  const result = movement.resolve(world, { actorId: actor.id, targetId: actor.homeId, anchor: 'seat' }, new Set(), [])
  assert.notDeepEqual(result.arrival.approach, other.position)
  assert.deepEqual(result.arrival.approach, nav.anchor(world, actor.homeId, 'seatRight'))
})
test('returning from accessible rear visitor positions goes around to a side entrance, never through the backrest', () => {
  // The bottom-row rear cells are outside the room; the other four are reachable.
  for (let index = 0; index < 4; index++) {
    const { world, nav, movement } = fixture(), actor = world.actors[index]
    standing(actor, nav.anchor(world, actor.homeId, 'visitorFront'))
    const result = movement.resolve(world, { actorId: actor.id, targetId: actor.homeId, anchor: 'seat' }, new Set(), [])
    const sideEntrances = ['seatLeft', 'seatRight'].map(anchor => nav.anchor(world, actor.homeId, anchor))
    assert(sideEntrances.some(point => point.x === result.arrival.approach.x && point.y === result.arrival.approach.y))
    assert(result.path.length > 0, 'a rear visitor position is not a seat entrance')
    assert(result.path.every(point => nav.walkable(world, point)), 'ordinary walking stays outside the chair footprint')
    assert(result.arrival.passage.every(point => point.y === result.arrival.seat.y), 'docking only crosses the seat from its side')
    movement.start(result)
    for (let tick = 0; tick < 300 && movement.busy(actor); tick++) movement.advance(world, actor, 50)
    assert.equal(movement.busy(actor), false)
    assert.equal(actor.posture, 'seated')
    assert.deepEqual(actor.using, { propId: actor.homeId, interactionId: 'seat' })
  }
})
test('blocked side entrances fail routing instead of falling back to the chair back', () => {
  const { world, nav, movement } = fixture(), actor = world.actors[0]
  standing(actor, nav.anchor(world, actor.homeId, 'visitorFront'))
  world.blockedAreas = ['seatLeft', 'seatRight'].map((anchor, index) => {
    const point = nav.anchor(world, actor.homeId, anchor)
    return { id: `blocked-${index}`, name: 'Blocked entrance', bounds: { left: point.x, top: point.y, right: point.x + 1, bottom: point.y + 1 } }
  })
  assert.throws(() => movement.resolve(world, { actorId: actor.id, targetId: actor.homeId, anchor: 'seat' }, new Set(), []), { code: 'NO_ROUTE' })
})
test('newly blocked path cells cause replanning without fractional or diagonal shortcuts', () => {
  const { world, nav, movement } = fixture(), [actor, other] = world.actors
  standing(actor, { x: 8, y: 6 }); standing(other, { x: 14, y: 6 })
  movement.start(movement.resolve(world, { actorId: actor.id, targetId: 'desk-1', anchor: 'visitor' }, new Set(), []))
  standing(other, { x: 9, y: 6 })
  for (let i = 0; i < 250 && movement.busy(actor); i++) movement.advance(world, actor, 50)
  assert.deepEqual(actor.position, nav.anchor(world, 'desk-1', 'visitor'))
  assert.equal(movement.busy(actor), false)
})
test('all thirty directed colleague visits finish with integer cells and collision reservations', () => {
  const ids = pack.createOfficeWorld().actors.map(a => a.id)
  for (const a of ids) for (const b of ids) {
    if (a === b) continue
    const runtime = createOfficeRuntime()
    assert.equal(runtime.submit(visit('visit', a, b)).status, 'running')
    completed(runtime, 'visit')
    assert(runtime.readActors().every(actor => actor.posture === 'seated'))
    noClaims(runtime)
  }
})
test('a tour stays out of its seat between hosts and returns only after all handoffs', () => {
  const r = createOfficeRuntime(), command = visit()
  command.participants.push({ entityId: 'app-agent', role: 'host' })
  command.params.stops.push({ hostId: 'app-agent', message: 'next' })
  r.submit(command)
  let left = false, returned = false, speeches = new Set()
  until(r, () => {
    const a = r.readActors()[0]
    if (a.posture === 'standing') left = true
    if (left && a.posture === 'seated') returned = true
    if (a.speech) speeches.add(a.speech.text)
    if (returned) assert.equal(speeches.size, 2)
    return r.getRecord('visit').status !== 'running'
  })
  assert.equal(r.getRecord('visit').status, 'completed')
  noClaims(r)
})
test('cancelling a normal step finishes just that edge and holds resources until it settles', () => {
  const r = createOfficeRuntime()
  r.submit(move('walk', 'whiteboard-1', 'attendee1'))
  until(r, () => r.readActors()[0].step && !r.readActors()[0].seatTransition)
  const target = r.readActors()[0].step.to
  r.submit({ ...base('cancel'), type: 'command.cancel', targetCommandId: 'walk' })
  assert.equal(beginMapEdit(r, 'busy-draft').error.code, 'BUSY')
  for (let i = 0; i < 12; i++) safeTick(r)
  assert.deepEqual(r.readActors()[0].position, target)
  assert.equal(r.readActors()[0].motion, undefined)
  noClaims(r)
})
test('invalid foreign-seat use fails without leaking resource claims', () => {
  const r = createOfficeRuntime()
  assert.equal(r.submit(move('foreign', 'desk-1', 'seat')).error.code, 'SEAT_NOT_OWNED')
  noClaims(r)
})
