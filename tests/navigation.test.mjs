import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import PF from 'pathfinding'
import { createTestServer } from './helpers/vite.mjs'
import { distance } from './helpers/grid.mjs'
let server, GridNavigation, createOfficeRuntime, compactPath
before(async () => {
  server = await createTestServer()
  ;({ GridNavigation } = await server.ssrLoadModule('/packages/runtime/src/navigation.ts'))
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts'))
  ;({ compactPath } = await server.ssrLoadModule('/packages/runtime/src/orthogonalPath.ts'))
})
after(() => server?.close())
function fixture(positions = [], footprint = { left: 0, top: 0, right: 1, bottom: 1 }) {
  const template = { id: 'test', name: 'Test', view: 'test', footprint, anchors: {}, resources: {} }
  const navigation = new GridNavigation({ template: () => structuredClone(template) })
  const world = { sceneId: 'test', unit: 'cell', width: 12, height: 12, gridSize: 1, layoutRevision: 0,
    bounds: { left: 0, top: 0, right: 12, bottom: 12 }, actors: [],
    props: positions.map((position, i) => ({ id: String(i), name: 'Block', templateId: 'test', position, state: {}, stateRevision: 0 })) }
  return { navigation, world }
}
function safe(nav, world, from, to, query) {
  const path = nav.path(world, from, to, query)
  assert.deepEqual(path.at(-1), to)
  for (const [i, p] of path.entries()) {
    assert.equal(distance(i ? path[i - 1] : from, p), 1)
    assert(nav.segmentClear(world, i ? path[i - 1] : from, p, query))
  }
  return path
}
test('integer-cell routes are shortest and use the fewest bends in open space', () => {
  const { navigation: nav, world } = fixture()
  const from = { x: 1, y: 2 }, to = { x: 9, y: 8 }
  const path = safe(nav, world, from, to)
  assert.equal(path.length, 14)
  assert.equal(compactPath([from, ...path]).length, 3)
  assert.deepEqual(nav.path(world, from, from), [])
  assert.deepEqual(nav.path(world, from, to), path)
  assert.throws(() => nav.path(world, { x: 1.5, y: 2 }, to), { code: 'NO_ROUTE' })
  assert.equal(nav.segmentClear(world, from, { x: 2, y: 3 }), false)
})
test('footprints occupy whole cells but do not inflate into adjacent free cells', () => {
  const { navigation: nav, world } = fixture([{ x: 5, y: 4 }], { left: 0, top: 0, right: 2, bottom: 4 })
  const from = { x: 1, y: 5 }, to = { x: 10, y: 5 }, path = safe(nav, world, from, to)
  assert.equal(path.length, 13)
  assert.equal(compactPath([from, ...path]).length, 4)
  assert(nav.walkable(world, { x: 4, y: 4 }))
  assert(!nav.walkable(world, { x: 5, y: 4 }))
  assert(!nav.segmentClear(world, from, to))
})
test('one-cell passages remain usable and touching corners cannot be crossed diagonally', () => {
  const { navigation: nav, world } = fixture([{ x: 4, y: 0 }, { x: 6, y: 0 }], { left: 0, top: 0, right: 1, bottom: 10 })
  assert.equal(safe(nav, world, { x: 5, y: 0 }, { x: 5, y: 11 }).length, 11)
  assert(!nav.segmentClear(world, { x: 3, y: 9 }, { x: 4, y: 10 }))
})
test('unreachable targets, fractional cells and blocked endpoints never cut furniture', () => {
  const { navigation: nav, world } = fixture([{ x: 5, y: 0 }], { left: 0, top: 0, right: 1, bottom: 12 })
  for (const to of [{ x: 10, y: 5 }, { x: 5, y: 5 }, { x: 4.5, y: 5 }]) assert.throws(() => nav.path(world, { x: 1, y: 5 }, to), { code: 'NO_ROUTE' })
})
test('dynamic actor cells are avoided with adjacent orthogonal steps', () => {
  const { navigation: nav, world } = fixture(), from = { x: 1, y: 5 }, to = { x: 10, y: 5 }
  const query = { obstacles: [{ position: { x: 5, y: 5 } }] }
  assert.equal(safe(nav, world, from, to, query).length, 11)
  assert.equal(nav.path(world, from, to).length, 9)
})
test('geometry and floor edits do not leak cached routes across worlds', () => {
  const { navigation: nav, world } = fixture([{ x: 5, y: 5 }])
  const from = { x: 1, y: 5 }, to = { x: 10, y: 5 }, before = structuredClone(world), moved = structuredClone(world)
  moved.props[0].position.y = 8
  assert.equal(nav.path(world, from, to).length, 11)
  assert.equal(nav.path(moved, from, to).length, 9)
  moved.walkableArea = [{ x: 2, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 2, y: 12 }]
  assert(!nav.walkable(moved, from))
  assert.deepEqual(world, before)
})
test('all thirty office pairs retain A-star shortest length with no extra zigzags', () => {
  const runtime = createOfficeRuntime(), world = runtime.readWorld(), nav = runtime.navigation
  const grid = new PF.Grid(world.width, world.height)
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) grid.setWalkableAt(x, y, nav.walkable(world, { x, y }))
  for (const a of world.actors) for (const b of world.actors) {
    if (a.id === b.id) continue
    const from = nav.anchor(world, a.homeId, 'seatLeft'), to = nav.anchor(world, b.homeId, 'visitor')
    const raw = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.Never }).findPath(from.x, from.y, to.x, to.y, grid.clone()).map(([x, y]) => ({ x, y }))
    const path = safe(nav, world, from, to)
    assert.equal(path.length, raw.length - 1)
    assert(compactPath([from, ...path]).length <= compactPath(raw).length)
  }
})
test('room boundaries always apply, including authorized furniture contact', () => {
  const r = createOfficeRuntime(), world = r.readWorld()
  const contact = { propId: 'desk-0', interactionId: 'seat' }
  for (const p of [{ x: 6, y: 3 }, { x: 3, y: 6 }, { x: 16, y: 6 }, { x: 8, y: 12 }]) assert(!r.navigation.walkable(world, p, { contact }))
  assert(r.navigation.walkable(world, world.actors[0].position, { contact }))
  assert(!r.navigation.walkable(world, { x: 6, y: 4 }, { contact }), 'permission cannot cross the tabletop')
  assert(!r.navigation.walkable(world, world.actors[1].position, { contact }), 'permission does not apply to another desk')
  assert.throws(() => r.navigation.walkable(world, { x: 9, y: 5 }, { contact: { propId: 'desk-0', interactionId: 'invalid' } }), { code: 'INVALID_CONTACT' })
})
test('partial tiles outside sloped floors are not walkable', () => {
  const { navigation: nav, world } = fixture()
  world.walkableArea = [{ x: 3, y: 0 }, { x: 9, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }]
  assert(!nav.walkable(world, { x: 2, y: 0 }))
  assert(nav.walkable(world, { x: 3, y: 1 }))
  world.walkableArea = [{ x: 0, y: 0 }, { x: 12, y: 12 }, { x: 12, y: 0 }, { x: 0, y: 12 }]
  assert.throws(() => nav.validate(world), { code: 'INVALID_WALKABLE_AREA' })
})
