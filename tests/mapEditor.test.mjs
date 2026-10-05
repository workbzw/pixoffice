import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, createOfficeRuntime, mapDocumentSchema, editFromUI, furnitureCells, snapFurniture, checkFurniturePlacement, furnitureFootprint, validateFurnitureFootprints, FURNITURE_CELL_SIZE
before(async () => {
  server = await createTestServer()
  ;({ createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts'))
  ;({ mapDocumentSchema } = await server.ssrLoadModule('/packages/runtime/src/map/schema.ts'))
  ;({ editMap: editFromUI } = await server.ssrLoadModule('/example/office-web/src/components/map-editor/commands.ts'))
  ;({ furnitureCells, snapFurniture, checkFurniturePlacement } = await server.ssrLoadModule('/packages/runtime/src/map/placement.ts'))
  ;({ furnitureFootprint, validateFurnitureFootprints, FURNITURE_CELL_SIZE } = await server.ssrLoadModule('/packages/runtime/src/map/furnitureGrid.ts'))
})
after(() => server?.close())
let counter = 0
const base = () => ({ protocolVersion: '2.0', sceneId: 'office-1', commandId: `map-test-${++counter}` })
const begin = runtime => runtime.submit({ ...base(), type: 'map.edit', edit: { action: 'begin', expectedLayoutRevision: runtime.readWorld().layoutRevision } })
function edit(runtime, action, reference = runtime.editorSnapshot()) {
  return runtime.submit({ ...base(), type: 'map.edit', edit: { ...action, draftId: reference.id, expectedDraftRevision: reference.revision } })
}
const patch = (runtime, operations) => edit(runtime, { action: 'patch', operations })
const desk = runtime => runtime.editorSnapshot().document.props.find(p => p.id === 'desk-0')
const ok = result => assert.equal(result.status, 'completed', JSON.stringify(result))
const beginOk = runtime => ok(begin(runtime))
const moveDesk = (runtime, x) => patch(runtime, [{ op: 'prop.put', prop: { ...desk(runtime), position: { x, y: 4 } } }])

test('map editing is an isolated transaction with monotonic undo/redo and cancellation', () => {
  const runtime = createOfficeRuntime(), original = runtime.readWorld()
  beginOk(runtime)
  assert.equal(runtime.editorSnapshot().validation.valid, true)
  ok(moveDesk(runtime, 7))
  assert.deepEqual(runtime.readWorld(), original)
  assert.equal(runtime.readEditorWorld().actors[0].position.x, 7)
  assert.equal(runtime.editorSnapshot().revision, 1)
  ok(edit(runtime, { action: 'undo' }))
  assert.equal(desk(runtime).position.x, 6)
  assert.equal(runtime.editorSnapshot().revision, 2)
  ok(edit(runtime, { action: 'redo' }))
  assert.equal(desk(runtime).position.x, 7)
  ok(edit(runtime, { action: 'cancel' }))
  assert.equal(runtime.isEditing, false)
  assert.equal(runtime.editorSnapshot(), undefined)
  assert.deepEqual(runtime.readWorld(), original)
})

test('UI and external commands use the same draft, stale writes and stale commits fail', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const reference = runtime.editorSnapshot()
  editFromUI(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: { ...desk(runtime), name: 'Human edit' } }] })
  assert.equal(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: reference.document.props[0] }] }, reference).error.code, 'DRAFT_CONFLICT')
  assert.equal(edit(runtime, { action: 'commit' }, reference).error.code, 'DRAFT_CONFLICT')
  assert.equal(desk(runtime).name, 'Human edit')
  ok(edit(runtime, { action: 'undo' }))
  assert.equal(desk(runtime).name, reference.document.props[0].name)
})

test('geometric errors remain editable and cannot overwrite the live map', () => {
  const runtime = createOfficeRuntime(), original = runtime.readWorld(); beginOk(runtime)
  ok(moveDesk(runtime, 11))
  assert.equal(runtime.editorSnapshot().validation.error.code, 'OVERLAP')
  assert.equal(edit(runtime, { action: 'commit' }).error.code, 'OVERLAP')
  assert.deepEqual(runtime.readWorld(), original)
  assert(runtime.editorSnapshot())
  ok(edit(runtime, { action: 'undo' }))
  ok(edit(runtime, { action: 'commit' }))
  assert.equal(runtime.readWorld().layoutRevision, original.layoutRevision + 1)
})

test('commit preserves live object state, presentation and seat binding updates', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  ok(patch(runtime, [{ op: 'binding.set', actorId: 'marvis', homeId: 'desk-1' }, { op: 'binding.set', actorId: 'code-agent', homeId: 'desk-0' }]))
  ok(runtime.submit({ ...base(), type: 'object.state.set', entityId: 'whiteboard-1', expectedStateRevision: 0, state: { title: 'Live state', text: 'Keep this' } }))
  ok(runtime.submit({ ...base(), type: 'actor.presentation.set', actorId: 'marvis', sourceRevision: 1, status: 'working', title: 'Real work' }))
  ok(edit(runtime, { action: 'commit' }))
  const world = runtime.readWorld()
  assert.equal(world.props.find(p => p.id === 'whiteboard-1').state.text, 'Keep this')
  assert.equal(world.props.find(p => p.id === 'whiteboard-1').stateRevision, 1)
  assert.equal(world.actors[0].homeId, 'desk-1')
  assert.equal(world.actors[0].position.x, 11)
  assert.equal(world.actors[0].presentation.title, 'Real work')
  assert(world.actors.every(a => !a.motion && !a.seatTransition))
})

test('blocked rectangles invalidate navigation caches and route preview stays orthogonal', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const from = { x: 8, y: 6 }, to = { x: 10, y: 6 }
  ok(edit(runtime, { action: 'route', from, to }))
  assert.equal(runtime.editorSnapshot().route.distance, 2)
  ok(patch(runtime, [{ op: 'blocked.put', area: { id: 'zone-test', name: 'Do not cross', bounds: { left: 9, top: 6, right: 10, bottom: 7 } } }]))
  assert.equal(runtime.editorSnapshot().route, undefined)
  ok(edit(runtime, { action: 'route', from, to }))
  const route = runtime.editorSnapshot().route, world = runtime.readEditorWorld()
  assert(!route.error, JSON.stringify(route))
  assert(route.distance > 2)
  assert(route.turns >= 2)
  route.points.slice(1).forEach((p, i) => {
    const previous = route.points[i]
    assert(p.x === previous.x || p.y === previous.y)
    assert(runtime.navigation.segmentClear(world, previous, p))
  })
  assert.equal(runtime.navigation.walkable(world, { x: 9, y: 6 }), false)
  ok(edit(runtime, { action: 'undo' }))
  assert.equal(runtime.navigation.walkable(runtime.readEditorWorld(), { x: 9, y: 6 }), true)
})

test('a disconnected floor or blocked seat fails validation; route failure returns readable data', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  ok(patch(runtime, [{ op: 'blocked.put', area: { id: 'wall', name: 'Wall', bounds: { left: 5, top: 5, right: 9, bottom: 7 } } }]))
  assert.equal(runtime.editorSnapshot().validation.valid, false)
  assert.equal(runtime.editorSnapshot().validation.error.code, 'SEAT_BLOCKED')
  ok(edit(runtime, { action: 'route', from: { x: 6, y: 5 }, to: { x: 9, y: 6 } }))
  assert.equal(runtime.editorSnapshot().route.error.code, 'NO_ROUTE')
  ok(edit(runtime, { action: 'undo' }))
  ok(patch(runtime, [{ op: 'floor.set', points: [{ x: 194, y: 236 }, { x: 752, y: 236 }, { x: 300, y: 350 }, { x: 160, y: 11 }, { x: 797, y: 11 }] }]))
  assert.equal(runtime.editorSnapshot().validation.error.code, 'INVALID_WALKABLE_AREA')
  assert.equal(edit(runtime, { action: 'commit' }).status, 'failed')
  ok(edit(runtime, { action: 'undo' }))
  assert.equal(runtime.editorSnapshot().validation.valid, true)
})

test('import is versioned data only; structural failures are atomic and state is not exported', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const document = runtime.exportMap(), before = runtime.editorSnapshot()
  assert(!('state' in document.props[0]))
  assert(!('records' in document))
  assert(mapDocumentSchema.safeParse(document).success)
  assert(!mapDocumentSchema.safeParse({ ...document, script: 'alert(1)' }).success)
  assert(!mapDocumentSchema.safeParse({ ...document, version: 1 }).success)
  assert.equal(patch(runtime, [{ op: 'prop.put', prop: { ...desk(runtime), position: { x: 1e100, y: 4 } } }]).error.code, 'INVALID_COMMAND')
  assert.equal(patch(runtime, [{ op: 'map.replace', document: { ...document, sceneId: 'other' } }]).error.code, 'MAP_MISMATCH')
  assert.equal(patch(runtime, [{ op: 'prop.put', prop: { ...desk(runtime), templateId: 'remote.code' } }]).error.code, 'MISSING_TEMPLATE')
  assert.equal(patch(runtime, [{ op: 'prop.remove', id: 'desk-0' }]).error.code, 'MISSING_BINDING')
  assert.equal(patch(runtime, [{ op: 'prop.put', prop: { ...desk(runtime), anchors: { seat: { x: 100, y: 100 } } } }]).error.code, 'FIXED_SEAT_ANCHOR')
  assert.deepEqual(runtime.editorSnapshot(), before)
})

test('new object resources and anchor overrides are available after commit and survive restore', () => {
  let saved
  const persistence = { load: () => saved, save: value => { saved = structuredClone(value) } }
  const runtime = createOfficeRuntime({ persistence }); beginOk(runtime)
  const p = runtime.editorSnapshot().document.props.find(p => p.id === 'whiteboard-1')
  ok(patch(runtime, [{ op: 'prop.remove', id: p.id }, { op: 'prop.put', prop: { ...p, id: 'board-new', anchors: { attendee1: { x: 0, y: 3 } } } }]))
  ok(edit(runtime, { action: 'commit' }))
  assert(runtime.snapshot().resources.some(r => r.resource === 'prop:board-new:meeting'))
  assert(!runtime.snapshot().resources.some(r => r.resource === 'prop:whiteboard-1:meeting'))
  assert.equal(runtime.navigation.anchor(runtime.readWorld(), 'board-new', 'attendee1').x, 4)
  const restored = createOfficeRuntime({ persistence })
  assert(!restored.snapshot().persistenceError)
  assert.deepEqual(restored.exportMap(), runtime.exportMap())
  assert.equal(restored.editorSnapshot(), undefined)
})

test('persistence failure never replaces the live map and preserves the editable draft', () => {
  let saved, failCommit = false
  const runtime = createOfficeRuntime({ persistence: { load: () => saved, save: value => {
    if (failCommit && value.world.layoutRevision > 0) throw new Error('disk full')
    saved = structuredClone(value)
  } } })
  const original = runtime.readWorld(); beginOk(runtime); ok(moveDesk(runtime, 7)); failCommit = true
  assert.equal(edit(runtime, { action: 'commit' }).error.code, 'PERSISTENCE_FAILED')
  assert.deepEqual(runtime.readWorld(), original)
  assert.deepEqual(saved.world, original)
  assert.equal(desk(runtime).position.x, 7)
  failCommit = false
  ok(edit(runtime, { action: 'commit' }))
  assert.equal(runtime.readWorld().props[0].position.x, 7)
})

test('busy runtime cannot begin; draft blocks activity and legacy layout overwrites', () => {
  const runtime = createOfficeRuntime()
  const activity = runtime.submit({ ...base(), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: 'marvis', role: 'actor' }], params: { animation: 'emotes/wave' } })
  assert.equal(begin(runtime).error.code, 'BUSY')
  runtime.submit({ ...base(), type: 'activity.stop', activityId: activity.activityId })
  for (let i = 0; i < 100; i++) runtime.tick(100)
  beginOk(runtime)
  assert.equal(runtime.submit({ ...base(), type: 'activity.start', capability: 'office.emote', participants: [{ entityId: 'marvis', role: 'actor' }], params: { animation: 'emotes/wave' } }).error.code, 'EDITING')
  assert.equal(runtime.submit({ ...base(), type: 'layout.apply', expectedLayoutRevision: runtime.readWorld().layoutRevision, placements: runtime.readWorld().props.map(p => ({ entityId: p.id, position: p.position })) }).error.code, 'EDITING')
})

test('draft snapshots are detached, redo clears on new edits, history is bounded', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const snapshot = runtime.editorSnapshot(); snapshot.document.props[0].name = 'Not applied'
  assert.notEqual(desk(runtime).name, 'Not applied')
  for (let i = 0; i < 55; i++) ok(patch(runtime, [{ op: 'prop.put', prop: { ...desk(runtime), name: `Name ${i}` } }]))
  for (let i = 0; i < 50; i++) ok(edit(runtime, { action: 'undo' }))
  assert.equal(edit(runtime, { action: 'undo' }).error.code, 'NO_UNDO')
  assert.equal(runtime.editorSnapshot().canRedo, true)
  ok(patch(runtime, [{ op: 'prop.put', prop: { ...desk(runtime), name: 'New branch' } }]))
  assert.equal(runtime.editorSnapshot().canRedo, false)
})

test('furniture drops reject invalid geometry atomically without polluting history or redo', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  ok(moveDesk(runtime, 7)); ok(edit(runtime, { action: 'undo' }))
  const before = runtime.editorSnapshot(), original = runtime.readWorld()
  const bad = { ...desk(runtime), position: { x: 11, y: 4 } }
  assert.equal(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: bad }], requireValid: true }).error.code, 'OVERLAP')
  assert.deepEqual(runtime.editorSnapshot(), before)
  assert.deepEqual(runtime.readWorld(), original)
  ok(edit(runtime, { action: 'redo' }))
  assert.equal(desk(runtime).position.x, 7)
})

test('valid furniture drops are one undo step; stale drops cannot overwrite external changes', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const before = runtime.editorSnapshot()
  ok(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: { ...desk(runtime), position: { x: 7, y: 4 } } }], requireValid: true }))
  assert.equal(runtime.editorSnapshot().revision, before.revision + 1)
  assert.equal(runtime.readEditorWorld().actors[0].position.x, 7)
  assert.equal(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: { ...desk(runtime), position: { x: 8, y: 4 } } }], requireValid: true }, before).error.code, 'DRAFT_CONFLICT')
  ok(edit(runtime, { action: 'undo' })); assert.equal(desk(runtime).position.x, 6)
})

test('drop validation includes interaction reachability, not just visible footprint overlap', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const before = runtime.editorSnapshot()
  const board = before.document.props.find(p => p.id === 'whiteboard-1')
  assert.equal(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: { ...board, position: { x: 4, y: 11 } } }], requireValid: true }).error.code, 'SEAT_BLOCKED')
  assert.deepEqual(runtime.editorSnapshot(), before)
})

test('catalog furniture can be added, collected and undone without copying occupant bindings', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  const prop = { ...desk(runtime), id: 'catalog-desk', name: 'New desk', position: { x: 14, y: 7 } }
  ok(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop }], requireValid: true }))
  assert(!runtime.editorSnapshot().document.bindings.some(b => b.homeId === prop.id))
  ok(edit(runtime, { action: 'patch', operations: [{ op: 'prop.remove', id: prop.id }], requireValid: true }))
  assert(!runtime.editorSnapshot().document.props.some(p => p.id === prop.id))
  ok(edit(runtime, { action: 'undo' }))
  assert(runtime.editorSnapshot().document.props.some(p => p.id === prop.id))
})

test('ground occupancy and pointer previews are data-only, snapped and do not perform path searches', () => {
  const runtime = createOfficeRuntime(); beginOk(runtime)
  assert.deepEqual(snapFurniture({ x: 6.8, y: 4.2 }), { x: 7, y: 4 })
  const board = runtime.template('office.whiteboard'), cells = furnitureCells(board)
  assert.deepEqual(cells, [{ x: 0, y: 0 }, { x: 1, y: 0 }])
  const oldPath = runtime.navigation.path
  runtime.navigation.path = () => { throw new Error('Preview must not search paths') }
  const before = runtime.editorSnapshot()
  const preview = prop => checkFurniturePlacement(before.document, prop, runtime.readWorld(), id => runtime.template(id), runtime.navigation)
  assert.equal(preview({ ...desk(runtime), position: { x: 7, y: 4 } }).valid, true)
  assert.equal(preview({ ...desk(runtime), position: { x: 11, y: 4 } }).error.code, 'OVERLAP')
  assert.deepEqual(runtime.editorSnapshot(), before)
  runtime.navigation.path = oldPath
})

test('furnishing and walking share the same integer cell unit', () => {
  const runtime = createOfficeRuntime(), world = runtime.readWorld()
  assert.equal(FURNITURE_CELL_SIZE, 1)
  assert.equal(world.gridSize, 1)
  assert.equal(runtime.describe().furnitureGrid.cellSize, 1)
  const desk = runtime.template('office.workstation'), board = runtime.template('office.whiteboard')
  assert.equal(furnitureCells(desk).length, 4)
  assert.equal(furnitureCells(board).length, 2)
  const pot = { id: 'test.pot', name: 'Pot', view: 'pot', footprint: { left: 0, right: 1, top: 0, bottom: 1 }, anchors: {}, resources: {} }
  assert.deepEqual(furnitureFootprint(pot), { left: 0, top: 0, right: 1, bottom: 1 })
  assert.equal(furnitureCells(pot).length, 1)
  for (const template of [desk, board, pot]) {
    const b = furnitureFootprint(template), p = snapFurniture({ x: 6.9, y: 4.2 })
    assert.equal((p.x + b.left) % 1, 0)
    assert.equal((p.y + b.top) % 1, 0)
    assert.deepEqual(snapFurniture(p), p)
    assert.deepEqual(snapFurniture({ x: p.x + 1, y: p.y + 1 }), { x: p.x + 1, y: p.y + 1 })
    for (const c of template.colliders ?? [{ bounds: template.footprint }]) {
      assert(c.bounds.left >= b.left && c.bounds.right <= b.right && c.bounds.top >= b.top && c.bounds.bottom <= b.bottom)
    }
  }
})

test('whole furnishing footprints reject shared space even when narrow physical bases do not touch', () => {
  const runtime = createOfficeRuntime(), world = runtime.readWorld()
  const template = id => runtime.template(id)
  const original = world.props.find(p => p.id === 'whiteboard-1')
  world.props = [{ ...original, position: { x: 8, y: 6 } }, { ...original, id: 'second-board', position: { x: 9, y: 6 } }]
  assert.throws(() => validateFurnitureFootprints(world, template), e => e.code === 'OVERLAP')
  world.props[1].position.y = 7
  assert.doesNotThrow(() => validateFurnitureFootprints(world, template))
})

test('grid-snapped placements retain reachable seats and preserve old layouts until moved', () => {
  const runtime = createOfficeRuntime(), original = runtime.readWorld()
  beginOk(runtime)
  assert.deepEqual(runtime.editorSnapshot().document.props.map(p => p.position), original.props.map(p => p.position))
  const prop = desk(runtime), position = snapFurniture(prop.position, runtime.template(prop.templateId))
  ok(edit(runtime, { action: 'patch', operations: [{ op: 'prop.put', prop: { ...prop, position } }], requireValid: true }))
  ok(edit(runtime, { action: 'commit' }))
  assert.equal(runtime.readWorld().gridSize, 1)
  assert.deepEqual(runtime.readWorld().props[0].position, position)
  assert.doesNotThrow(() => runtime.navigation.validate(runtime.readWorld()))
})
