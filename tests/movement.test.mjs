import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { base, visit, move, safeTick, until, completed, noClaims } from './helpers/grid.mjs'
let server, createOfficeRuntime, MovementController, GridNavigation, pack, advanceCell, actorPixels
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts'))
  ;({ MovementController } = await server.ssrLoadModule('/packages/runtime/src/movement.ts'))
  ;({ GridNavigation } = await server.ssrLoadModule('/packages/runtime/src/navigation.ts'))
  ;({ advanceCell } = await server.ssrLoadModule('/packages/runtime/src/cellMovement.ts'))
  ;({ actorPixels } = await server.ssrLoadModule('/example/office-web/src/scene/gridProjection.ts'))
  pack = await server.ssrLoadModule('/example/office-web/src/runtime/builtin/officePack.ts')
})
after(() => server?.close())
function fixture() {
  const world = pack.createOfficeWorld(), templates = { template: id => pack.officeObjects.templates.find(t => t.id === id) }
  const nav = new GridNavigation(templates)
  return { world, nav, movement: new MovementController(nav, templates) }
}
function standing(actor, position) { actor.position = position; actor.posture = 'standing'; actor.using = undefined }
test('position commits only at integer cell boundaries while pixels interpolate smoothly', () => {
  const { world, nav } = fixture(), actor = world.actors[0]
  standing(actor, { x: 8, y: 6 })
  const start = actorPixels(actor)
  advanceCell(world, actor, { x: 9, y: 6 }, 240, nav)
  assert.deepEqual(actor.position, { x: 8, y: 6 })
  assert.deepEqual(actorPixels(actor), { x: start.x + 25, y: start.y })
  advanceCell(world, actor, { x: 9, y: 6 }, 240, nav)
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
  assert.throws(() => r.setEditing(true), { code: 'BUSY' })
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
