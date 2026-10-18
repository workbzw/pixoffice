import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { access, readFile } from 'node:fs/promises'
import { createTestServer } from './helpers/vite.mjs'

let server
before(async () => { server = await createTestServer() })
after(async () => { await server?.close() })
const load = path => server.ssrLoadModule(path)

test('SceneRuntime is the sole runtime class and obsolete playback and whiteboard entries are absent', async () => {
  const runtime = JSON.parse(await readFile(new URL('../packages/runtime/package.json', import.meta.url), 'utf8'))
  const office = JSON.parse(await readFile(new URL('../packages/scene-office/package.json', import.meta.url), 'utf8'))
  assert.equal(runtime.exports['./OfficeRuntime'], undefined)
  assert.equal(office.exports['./markdown'], undefined)
  assert.throws(() => import.meta.resolve('@pixoffice/runtime/OfficeRuntime'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  assert.throws(() => import.meta.resolve('@pixoffice/scene-office/markdown'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  for (const file of ['packages/runtime/src/OfficeRuntime.ts', 'packages/runtime/dist/OfficeRuntime.js',
    'packages/scene-office/src/markdown.ts', 'packages/scene-office/dist/markdown.js',
    'packages/assets-office/src/frame/FrameSprite.ts', 'packages/assets-office/dist/frame/FrameSprite.js',
    'example/office-web/src/scene/characters/ApartmentCharacter.ts', 'example/office-web/src/scene/entities/AgentEntity.ts',
    'example/office-web/src/scene/simulation/OfficeSimulator.ts', 'example/office-web/src/scene/systems/MovementSystem.ts']) {
    await assert.rejects(access(new URL('../' + file, import.meta.url)), { code: 'ENOENT' })
  }
})

test('dimetric build isolation rejects classic content but permits shared players and future dimetric packages', async () => {
  const { isClassicProductModule } = await load('/example/dimetric/vite.config.ts')
  for (const id of ['/repo/packages/scene-office/dist/index.js', '/repo/node_modules/@pixoffice/assets-farm/dist/index.js', '/repo/example/classroom/src/App.tsx']) assert.equal(isClassicProductModule(id), true)
  for (const id of ['/repo/packages/animation-frame/dist/index.js', '/repo/packages/scene-dimetric-office/dist/index.js', '/repo/packages/assets-dimetric-office/dist/index.js', '/repo/packages/runtime/dist/index.js']) assert.equal(isClassicProductModule(id), false)
})

test('protocol has a single package owner and retired source paths are absent', async () => {
  const wire = await load('@pixoffice/protocol'), runtime = await load('@pixoffice/runtime')
  for (const name of ['commandSchema', 'batchSchema', 'SceneFault', 'protocolDescription', 'canonical']) assert.equal(runtime[name], undefined)
  const command = { protocolVersion: '2.0', sceneId: 'office', commandId: 'one', type: 'activity.start', capability: 'office.visit', participants: [{ entityId: 'one', role: 'visitor' }], params: {} }
  assert.deepEqual(wire.commandSchema.parse(command), command)
  assert.deepEqual(wire.sceneError(new wire.SceneFault('BUSY', 'Busy')), { code: 'BUSY', message: 'Busy' })
  assert.throws(() => import.meta.resolve('@pixoffice/runtime/protocol'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  for (const file of ['packages/runtime/src/protocol.ts', 'packages/runtime/dist/protocol.js',
    'example/office-web/src/runtime/createOfficeRuntime.ts', 'example/office-web/src/runtime/adapters/legacy.ts',
    'example/office-web/src/scene/OfficeScene.ts', 'example/office-web/src/scene/assets/loadApartmentAssets.ts',
    'example/office-web/src/scene/layout/officeLayout.ts', 'example/office-web/src/store/officeStore.ts',
    'example/office-web/src/dashboard/contract.ts', 'example/office-web/src/chat/contract.ts']) {
    await assert.rejects(access(new URL('../' + file, import.meta.url)), { code: 'ENOENT' })
  }
})

test('both projections invert coordinates and pick integer cells without changing the logical grid', async () => {
  const { createOrthogonalProjection, createDimetricProjection, pickGridCell } = await load('/packages/renderer-pixi/src/projection.ts')
  for (const projection of [createOrthogonalProjection(50), createDimetricProjection(64)]) {
    for (let x = -5; x <= 10; x++) for (let y = -5; y <= 10; y++) {
      const point = { x: x + .375, y: y + .625 }, restored = projection.screenToGrid(projection.gridToScreen(point))
      assert(Math.abs(restored.x - point.x) < 1e-9 && Math.abs(restored.y - point.y) < 1e-9)
      assert.deepEqual(pickGridCell(projection, projection.cellCenter({ x, y })), { x, y })
    }
  }
  const iso = createDimetricProjection()
  assert.deepEqual(iso.bounds({ left: 0, top: 0, right: 10, bottom: 10 }), { left: -320, top: 0, right: 320, bottom: 320 })
  assert.deepEqual(iso.cellPolygon({ x: 0, y: 0 }), [{ x: 0, y: 0 }, { x: 32, y: 16 }, { x: 0, y: 32 }, { x: -32, y: 16 }])
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => createDimetricProjection(invalid))
})

test('world direction maps to product-specific sprite views while legacy facings retain their meaning', async () => {
  const { worldDirectionFromFacing, facingFromWorldDirection } = await load('/packages/protocol/src/spatial.ts')
  const { createOrthogonalProjection, createDimetricProjection } = await load('/packages/renderer-pixi/src/projection.ts')
  const { viewDirectionSchema } = await load('/packages/contracts/src/animation.ts')
  for (const facing of ['front', 'back', 'left', 'right']) assert.equal(facingFromWorldDirection(worldDirectionFromFacing(facing)), facing)
  const direction = worldDirectionFromFacing('back')
  assert.equal(createOrthogonalProjection().viewDirection(direction), 'back')
  assert.equal(createDimetricProjection().viewDirection(direction), 'back-right')
  assert.equal(viewDirectionSchema.parse('back-right'), 'back-right')
  assert.equal(viewDirectionSchema.safeParse('anything').success, false)
})

test('product storage uses current namespaced keys and ignores retired scene saves', async () => {
  const { browserPersistence, sceneStorageKey } = await load('/packages/runtime/src/adapters/storage.ts')
  const retiredKey = 'ai-office:plugin-runtime:v1:office-1'
  const values = new Map([[retiredKey, '{"retired":true}']]), reads = [], storage = { getItem: k => { reads.push(k); return values.get(k) ?? null }, setItem: (k, v) => values.set(k, v) }
  const classic = browserPersistence(storage, 'office-1'), iso = browserPersistence(storage, 'office-1', 'dimetric')
  assert.equal(classic.load(), undefined)
  classic.save({ current: true }); iso.save({ fresh: true })
  assert.deepEqual(classic.load(), { current: true }); assert.deepEqual(iso.load(), { fresh: true })
  assert.equal(sceneStorageKey('office-1'), 'pixoffice:classic:runtime:v2:office-1')
  assert.equal(reads.includes(retiredKey), false)
  assert.equal(values.get(retiredKey), '{"retired":true}')
  assert.notEqual(sceneStorageKey('a:b', 'c'), sceneStorageKey('b', 'c:a'))
  assert.throws(() => sceneStorageKey('office-1', ' '))
  assert.throws(() => sceneStorageKey(' '))
})

test('product appearance profiles reject accidentally selected classic artwork', async () => {
  const { assertProductAppearance } = await load('/packages/contracts/src/product.ts')
  const { product } = await load('/example/dimetric/src/assembly.ts')
  const { markerManifest } = await load('/example/dimetric/src/appearance.ts')
  assert.doesNotThrow(() => assertProductAppearance(product, markerManifest))
  assert.throws(() => assertProductAppearance(product, { ...markerManifest, presentationProfileId: 'office-character-v1' }), /incompatible/)
})

test('ground-space gait is independent of projection scale and screen travel distance', async () => {
  const { AnimationPresenter } = await load('/packages/renderer-pixi/src/presentation/AnimationPresenter.ts')
  const { markerManifest } = await load('/example/dimetric/src/appearance.ts')
  const actor = { id: 'one', displayHeight: 32, position: { x: 0, y: 0 }, intent: { actionId: 'core.walk', poseId: 'standing', view: 'front-right' }, locomotion: { position: { x: 0, y: 0 }, strideCells: 1 } }
  const a = new AnimationPresenter(), b = new AnimationPresenter()
  a.sample(actor, markerManifest, 0); b.sample(actor, markerManifest, 0)
  const moved = { ...actor, locomotion: { ...actor.locomotion, position: { x: .5, y: 0 } } }
  const first = a.sample({ ...moved, position: { x: 16, y: 8 } }, markerManifest, .02)
  const second = b.sample({ ...moved, position: { x: 80, y: 40 } }, markerManifest, .02)
  assert.deepEqual(first.actions[0].clock, second.actions[0].clock)
  assert.equal(first.actions[0].clock.travelledDu, .36)
})

test('the independent product moves, reserves furniture, works, exits and cancels through the shared runtime', async t => {
  const { createSceneRuntime } = await load('/packages/runtime/src/index.ts')
  const { dimetricScene } = await load('/example/dimetric/src/scene.ts')
  const rt = createSceneRuntime(dimetricScene); t.after(() => rt.dispose())
  const start = (id, capability, params) => rt.submit({ protocolVersion: '2.0', sceneId: rt.sceneId, commandId: id, type: 'activity.start', capability, participants: [{ entityId: 'visitor', role: 'actor' }], params })
  assert.equal(start('work', 'lab.work', {}).status, 'running')
  for (let i = 0; i < 600 && rt.getRecord('work').status === 'running'; i++) rt.tick(50)
  assert.equal(rt.getRecord('work').status, 'completed')
  assert.equal(rt.readActors()[0].posture, 'seated')
  assert.equal(start('leave', 'scene.move', { targetId: 'origin', anchor: 'cell-2-6' }).status, 'running')
  for (let i = 0; i < 600 && rt.getRecord('leave').status === 'running'; i++) rt.tick(50)
  assert.equal(rt.getRecord('leave').status, 'completed')
  assert.deepEqual(rt.readActors()[0].position, { x: 2, y: 6 })
  start('cancel-me', 'scene.move', { targetId: 'origin', anchor: 'cell-9-9' })
  rt.tick(50)
  rt.submit({ protocolVersion: '2.0', sceneId: rt.sceneId, commandId: 'cancel', type: 'command.cancel', targetCommandId: 'cancel-me' })
  for (let i = 0; i < 100; i++) rt.tick(50)
  assert.equal(rt.getRecord('cancel-me').status, 'cancelled')
  assert.equal(rt.readActors()[0].posture, 'standing')
})
