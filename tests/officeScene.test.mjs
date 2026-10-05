import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Application, Assets, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

async function loadScene(t) {
  const server = await createTestServer()
  t.after(() => server.close())
  return server.ssrLoadModule('/example/office-web/src/scene/OfficeScene.ts')
}

test('tabletop and legs share artwork but keep stable independent ground depths', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { loadOfficeAssets } = await server.ssrLoadModule('/example/office-web/src/scene/assets/loadOfficeAssets.ts')
  const { DeskEntity } = await server.ssrLoadModule('/example/office-web/src/scene/entities/DeskEntity.ts')
  const table = new Texture({ source: new TextureSource({ width: 920, height: 582 }) })
  const chair = new Texture({ source: new TextureSource({ width: 474, height: 492 }) })
  t.mock.method(Assets, 'load', async alias => alias === 'office-chair' ? chair : table)
  await loadOfficeAssets()
  const desk = new DeskEntity({ id: 'test', x: 405, y: 180, seatX: 405, seatY: 225 })
  const top = desk.deskLayer.children[0], legs = desk.deskFrontLayer.children[0]
  assert.equal(top.texture.source, legs.texture.source)
  assert.equal(top.texture.frame.y + top.texture.frame.height, legs.texture.frame.y)
  assert.equal(legs.texture.frame.y + legs.texture.frame.height, table.height)
  assert(Math.abs(top.y + top.height - legs.y) < 1e-9, 'two slices have no gap or overlap')
  desk.updateDepthZ()
  assert.equal(desk.deskLayer.zIndex, 196)
  assert.equal(desk.deskFrontLayer.zIndex, 224)
  assert.equal(desk.deskLayer.y, 172)
  assert.equal(desk.chairLayer.y, 180, 'opening a passage must not move the fixed chair')
  assert.equal(desk.chairLayer.zIndex, 227)
  const chairSprite = desk.chairLayer.children[0]
  const apronY = desk.deskLayer.y + top.y + top.height
  const chairTopY = desk.chairLayer.y + chairSprite.y - chairSprite.anchor.y * chairSprite.height
  assert(chairTopY - apronY > 4 && chairTopY - apronY < 16, 'chair sits close to the working surface, not across an empty aisle')
  assert(desk.deskLayer.y + top.y <= 150, 'monitor remains visible above the seated head after bringing the desk closer')
  const shadowBounds = desk.shadowGfx.getLocalBounds()
  assert(shadowBounds.width <= 52 && shadowBounds.height <= 14, 'chair has a contact shadow rather than a workstation-sized mat')
  desk.setDesk({ id: 'test', x: 500, y: 300, seatX: 500, seatY: 345 })
  desk.updateDepthZ()
  assert.deepEqual([desk.deskLayer.x, desk.deskFrontLayer.x, desk.deskFrontLayer.y, desk.deskFrontLayer.zIndex], [500, 500, 292, 344])
  for (const layer of [desk.shadowGfx, desk.deskLayer, desk.deskFrontLayer, desk.chairLayer, desk.occupiedIndicator]) layer.destroy({ children: true })
  table.destroy(true); chair.destroy(true)
})

test('the new workstation artwork applies to every desk and remains reversible without changing the map', async t => {
  const server = await createTestServer()
  t.after(() => server.close())
  const { loadOfficeAssets } = await server.ssrLoadModule('/example/office-web/src/scene/assets/loadOfficeAssets.ts')
  const { loadWorkstationTrialAssets } = await server.ssrLoadModule('/example/office-web/src/scene/assets/loadWorkstationTrialAssets.ts')
  const { createOfficePropViews } = await server.ssrLoadModule('/example/office-web/src/scene/views/propViews.ts')
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/runtime/createOfficeRuntime.ts')
  const make = (width, height) => new Texture({ source: new TextureSource({ width, height }) })
  const textures = {
    'office-background': make(1402, 1122), 'office-desk': make(920, 582), 'office-chair': make(474, 492),
    'office-workstation-trial-v1-desk': make(1536, 1024), 'office-workstation-trial-v1-chair': make(1214, 1295), 'office-workstation-trial-v1-computer': make(1536, 1024),
  }
  t.mock.method(Assets, 'load', async alias => textures[alias])
  await loadOfficeAssets()
  assert.equal(await loadWorkstationTrialAssets(), true)
  const runtime = createOfficeRuntime(), original = runtime.readWorld()
  t.after(() => runtime.dispose())
  let trial = true
  const registry = createOfficePropViews(() => trial)
  const props = original.props.slice(0, 2), template = runtime.template(props[0].templateId)
  const actors = [{ id: 'marvis', assignedDeskId: props[0].id, seated: true }]
  const views = props.map(prop => registry.create(prop, template))
  t.after(() => {
    views.forEach(view => view.roots.forEach(root => root.destroy({ children: true })))
    Object.values(textures).forEach(texture => texture.destroy(true))
  })
  const update = () => views.forEach((view, i) => view.update(props[i], template, actors))
  update()
  const [top, computer] = views[0].hitTarget.children
  const legs = views[0].roots[4].children[0]
  assert.equal(top.texture.source, textures['office-workstation-trial-v1-desk'].source)
  assert.equal(computer.texture.source, textures['office-workstation-trial-v1-computer'].source)
  assert.equal(top.scale.x, top.scale.y, 'new artwork keeps its authored proportions')
  assert.equal(legs.scale.x, legs.scale.y)
  assert(Math.abs(top.y + top.height - legs.y) < 1e-9, 'the two desk slices have no seam')
  assert.equal(views[1].hitTarget.children.length, 2, 'other workstations use the same artwork')
  assert.equal(views[1].hitTarget.children[0].texture.source, textures['office-workstation-trial-v1-desk'].source)
  const oldSlice = top.texture, oldSource = top.texture.source
  trial = false; update()
  for (const view of views) {
    assert.equal(view.hitTarget.children.length, 1)
    assert.equal(view.hitTarget.children[0].texture.source, textures['office-desk'].source)
  }
  assert.equal(oldSlice.destroyed, true, 'switching releases only derived texture views')
  assert.notEqual(oldSource.destroyed, true, 'shared asset textures remain usable')
  trial = true; actors[0].assignedDeskId = props[1].id; update()
  assert.equal(views[0].hitTarget.children.length, 2)
  assert.equal(views[1].hitTarget.children.length, 2, 'artwork does not depend on who owns the desk')
  assert.deepEqual(runtime.readWorld(), original, 'artwork switching never changes the saved map')
})

test('switching workstation artwork does not alter world state or command history', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  t.after(() => scene.destroy())
  const before = scene.runtime.snapshot()
  scene.setWorkstationTrial(false)
  scene.setWorkstationTrial(true)
  assert.deepEqual(scene.runtime.snapshot(), before)
})

test('destroying during renderer initialization cancels mounting and disposes the late renderer', async t => {
  const { OfficeScene } = await loadScene(t)
  const background = new Texture({ source: new TextureSource({ width: 10, height: 10 }) })
  t.mock.method(Assets, 'load', async () => background)
  t.after(() => background.destroy(true))
  let release
  const ready = new Promise(resolve => { release = resolve })
  t.mock.method(Application.prototype, 'init', () => ready)
  const destroy = t.mock.method(Application.prototype, 'destroy', () => {})
  const previousWindow = globalThis.window
  globalThis.window = { devicePixelRatio: 1 }
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })
  let mounted = 0
  const scene = new OfficeScene()
  const initializing = scene.init({ appendChild() { mounted++ } }, 400, 300)
  scene.destroy()
  release()
  await initializing
  assert.equal(mounted, 0)
  assert.equal(scene.app, null)
  assert.equal(scene.world, null)
  assert.equal(destroy.mock.callCount(), 1)
  await scene.init({ appendChild() { mounted++ } }, 400, 300)
  assert.equal(mounted, 0)
})

test('legacy tour entrypoint reserves future hosts through the runtime', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  t.after(() => scene.destroy())
  const tour = scene.requestDeskVisitTour(1, [2, 3])
  assert.equal(tour.status, 'running')
  assert.equal(scene.requestDeskVisit(3, 4, 'wait').status, 'queued')
  assert.equal(scene.requestDeskVisit(5, 6, 'parallel').status, 'running')
  assert.equal(scene.runtime.snapshot().resources.find(r => r.resource === 'actor:file-agent:body').holders[0], tour.activityId)
})

test('demo is opt-in and cannot interrupt an existing activity', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  t.after(() => scene.destroy())
  scene.onTick({ deltaTime: 1 })
  assert.equal(scene.runtime.snapshot().records.length, 0)
  scene.setDemo(true)
  scene.onTick({ deltaTime: 1 })
  assert.equal(scene.runtime.snapshot().activities.length, 3)
  for (let i = 0; i < 50; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(scene.runtime.snapshot().activities.length, 3)
})

test('a manual five-person tour still has no intermediate return to the leader seat', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  t.after(() => scene.destroy())
  scene.requestDeskVisitTour(1, [2, 3, 4, 5, 6])
  const [record] = scene.runtime.snapshot().records
  const commandId = record.command.commandId
  const hosts = scene.runtime.readActors().slice(1).map(a => a.id)
  assert.deepEqual(record.command.params.stops.map(s => s.hostId), hosts)
  const stages = [], greeted = new Set()
  for (let i = 0; i < 2400 && scene.runtime.getRecord(commandId).status === 'running'; i++) {
    const actor = scene.runtime.readActors()[0]
    const stage = actor.seatTransition?.stage
    if (stage !== stages.at(-1)) stages.push(stage)
    const activity = scene.runtime.snapshot().activities.find(a => a.status === 'active')
    if (activity?.plan.phases[activity.phaseIndex]?.title === '返回工位') assert.equal(greeted.size, 5)
    for (const host of scene.runtime.readActors().slice(1)) if (host.speech) greeted.add(host.id)
    scene.onTick({ deltaTime: 3 })
  }
  assert.equal(scene.runtime.getRecord(commandId).status, 'completed')
  assert.equal(greeted.size, 5)
  assert.equal(stages.filter(s => s === 'rising').length, 1)
  assert.equal(stages.filter(s => s === 'entering').length, 1)
  assert.equal(stages.filter(s => s === 'sitting').length, 1)
  assert.equal(scene.runtime.snapshot().records.length, 1)
})

test('a locked save cannot start demo or report a running demo state', async t => {
  const { OfficeScene } = await loadScene(t)
  const changes = []
  const scene = new OfficeScene({ onDemoChange: enabled => changes.push(enabled) })
  t.after(() => scene.destroy())
  scene.runtime.persistenceError = '旧存档布局重叠'
  assert.throws(() => scene.setDemo(true), /先点击.*备份并恢复布局/)
  assert.equal(scene.isDemoRunning, false)
  assert.deepEqual(changes, [])
  for (let i = 0; i < 200; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(scene.runtime.snapshot().records.length, 0)
  scene.runtime.persistenceError = undefined
  scene.setDemo(true)
  scene.onTick({ deltaTime: 1 })
  assert.equal(scene.isDemoRunning, true)
  assert.deepEqual(changes, [true])
  assert.equal(scene.runtime.snapshot().activities.length, 3)
})

test('a rejected demo command stops demo and publishes its error instead of silently retrying', async t => {
  const { OfficeScene } = await loadScene(t)
  const changes = [], notices = []
  const scene = new OfficeScene({ onDemoChange: enabled => changes.push(enabled), onDraftChange: notice => notices.push(notice) })
  t.after(() => scene.destroy())
  scene.runtime.setPluginEnabled('office.visits', false)
  scene.setDemo(true)
  scene.onTick({ deltaTime: 1 })
  assert.equal(scene.isDemoRunning, false)
  assert.deepEqual(changes, [true, false])
  assert.equal(notices.length, 1)
  assert.ok(notices[0])
  const records = scene.runtime.snapshot().records.length
  for (let i = 0; i < 200; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(scene.runtime.snapshot().records.length, records)
})

test('expressions and HTTP visits share body resources; view state is not authoritative', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  t.after(() => scene.destroy())
  assert.equal(scene.playAgentAnimation('marvis', 'emotes/wave').status, 'running')
  const visit = scene.requestDeskVisit(1, 2, '外部拜访')
  assert.equal(visit.status, 'queued')
  const projection = scene.getAgents()
  projection[0].x = -999
  assert.notEqual(scene.runtime.readActors()[0].position.x, -999)
  for (let i = 0; i < 500 && scene.runtime.getRecord(visit.commandId).status === 'queued'; i++) scene.runtime.tick(50)
  assert.equal(scene.runtime.getRecord(visit.commandId).status, 'running')
})

test('preview suspension stops drawing, not visits; resuming restores view updates', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  let renders = 0
  scene.app = { render() { renders++ } }
  scene.layer = { sortChildren() {} }
  const sync = t.mock.method(scene, 'syncActors', () => {})
  t.after(() => { scene.app = null; scene.layer = null; scene.destroy() })

  scene.setRenderingSuspended(true)
  const visit = scene.requestDeskVisit(1, 2, '继续推进任务')
  for (let i = 0; i < 2400 && scene.runtime.getRecord(visit.commandId).status === 'running'; i++) {
    scene.onTick({ deltaTime: 3 })
  }
  assert.equal(scene.runtime.getRecord(visit.commandId).status, 'completed')
  assert.equal(renders, 0)
  assert.equal(sync.mock.callCount(), 0)

  scene.setRenderingSuspended(false)
  assert.equal(renders, 1)
  assert.equal(sync.mock.callCount(), 1)
  scene.onTick({ deltaTime: 1 })
  assert.equal(renders, 2)
  assert.equal(sync.mock.callCount(), 2)
  scene.setRenderingSuspended(false)
  assert.equal(renders, 2)
})

test('repeated preview open/close does not disable the demo or freeze actors', async t => {
  const { OfficeScene } = await loadScene(t)
  const scene = new OfficeScene()
  t.after(() => scene.destroy())
  scene.setDemo(true)
  for (let cycle = 0; cycle < 3; cycle++) {
    scene.setRenderingSuspended(true)
    for (let i = 0; i < 50; i++) scene.onTick({ deltaTime: 3 })
    scene.setRenderingSuspended(false)
    const positions = new Set()
    for (let i = 0; i < 300; i++) {
      scene.onTick({ deltaTime: 3 })
      positions.add(JSON.stringify(scene.runtime.readActors().map(actor => actor.position)))
    }
    assert.ok(positions.size > 10, 'actors must keep moving after closing preview, including after conversation pauses')
  }
  assert.ok(scene.runtime.snapshot().activities.some(a => a.status === 'active'))
})
