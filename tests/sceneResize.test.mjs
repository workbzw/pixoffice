import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Container } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, SceneView
before(async () => {
  server = await createTestServer()
  ;({ SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts'))
})
after(async () => { await server?.close() })

function fixture(t, overrides = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else delete globalThis.window
  })
  const events = [], frames = [], data = { width: 24, height: 19, props: [], actors: [] }
  let ticks = 0
  const scene = new SceneView({
    runtime: { readWorld: () => data, isEditing: false },
    pack: { cellPixels: 50, createPropViews: () => ({}), projectActors: () => [], ...overrides },
    onStep: () => ticks++,
  })
  const renderer = { resolution: 1, screen: { width: 1, height: 1 }, resize(width, height, resolution) {
    events.push('resize')
    this.screen = { width, height }; this.resolution = resolution
  } }
  const stage = new Container(), world = new Container(), layer = new Container()
  world.addChild(scene.grid, layer); stage.addChild(world)
  scene.app = {
    renderer, stage, canvas: { style: {} }, ticker: { remove() {} },
    get screen() { return renderer.screen },
    render() {
      events.push('render')
      frames.push({ width: renderer.screen.width, height: renderer.screen.height, resolution: renderer.resolution,
        scale: world.scale.x, x: world.x, y: world.y })
    },
    destroy() { stage.destroy({ children: true }) },
  }
  scene.world = world; scene.layer = layer
  t.after(() => scene.destroy())
  return { scene, renderer, world, data, events, frames, ticks: () => ticks }
}

test('a loaded scene repaints synchronously after resize with its updated camera and without advancing animation', t => {
  const { scene, world, events, frames, ticks } = fixture(t)
  scene.resize(800, 600)
  assert.deepEqual(events, ['resize', 'render'])
  const scale = 600 / 950
  assert.deepEqual(frames, [{ width: 800, height: 600, resolution: 1, scale, x: (800 - 1200 * scale) / 2, y: 0 }])
  assert.equal(world.scale.y, scale)
  assert.equal(ticks(), 0)
})

test('repeated equal sizes neither clear the drawing buffer nor add redundant renders', t => {
  const { scene, events } = fixture(t)
  scene.resize(800, 600); events.length = 0
  for (let i = 0; i < 5; i++) scene.resize(800, 600)
  assert.deepEqual(events, [])
})

test('pixel-density changes repaint at the same CSS size and retain camera scale', t => {
  const { scene, world, events, frames } = fixture(t)
  scene.resize(800, 600); events.length = 0
  const scale = world.scale.x
  window.devicePixelRatio = 2
  scene.resize(800, 600)
  assert.deepEqual(events, ['resize', 'render'])
  assert.equal(frames.at(-1).resolution, 2)
  assert.equal(world.scale.x, scale)
  assert.equal(frames.at(-1).width, 800)
})

test('a suspended scene stays hidden during resize and repaints when resumed', t => {
  const { scene, events } = fixture(t)
  scene.setRenderingSuspended(true)
  scene.resize(800, 600)
  assert.deepEqual(events, ['resize'])
  scene.setRenderingSuspended(false)
  assert.deepEqual(events, ['resize', 'render'])
})

test('prop display frames run while visible but stop when suspended or destroyed', t => {
  const { scene } = fixture(t), updates = []
  scene.runtime.getRevision = () => 0
  scene.propViews.set('board', { roots: [], hitTarget: new Container(), update() {}, updateFrame(dt) { updates.push(dt) } })
  scene.onTick({ deltaTime: 1.2 })
  assert.deepEqual(updates, [.02])
  scene.setRenderingSuspended(true)
  scene.onTick({ deltaTime: 1.2 })
  assert.deepEqual(updates, [.02])
  scene.destroy(); scene.onTick({ deltaTime: 1.2 })
  assert.deepEqual(updates, [.02])
})

test('idle rendering saves frames without slowing simulation or losing visual elapsed time', t => {
  let moving = false
  const actor = { id: 'one', intent: { actionId: 'core.idle' } }
  const { scene, frames, ticks } = fixture(t, {
    rendering: { idleFPS: 20 },
    projectActors: () => [{ ...actor, intent: { actionId: moving ? 'core.walk' : 'core.idle' } }],
  })
  scene.runtime.getRevision = () => 0
  const elapsed = []
  scene.propViews.set('board', { roots: [], updateFrame: dt => elapsed.push(dt) })
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(ticks(), 60)
  assert.equal(frames.length, 20)
  assert(Math.abs(elapsed.reduce((a, b) => a + b, 0) - 1) < 1e-8)
  assert(elapsed.every(dt => Math.abs(dt - .05) < 1e-8))

  moving = true; scene.syncActors(0)
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(ticks(), 120)
  assert.equal(frames.length, 80, 'walking returns to 60 FPS')
  moving = false; scene.syncActors(0)
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(frames.length, 100, 'seated work returns to its low-power cadence')
})

test('unconfigured scenes keep their normal frame rate and projection reuses the same world snapshot', t => {
  const snapshots = []
  const { scene, data, frames } = fixture(t, { projectActors: (_runtime, world) => { snapshots.push(world); return [] } })
  scene.runtime.getRevision = () => 0
  const reads = t.mock.method(scene.runtime, 'readWorld', () => data)
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(frames.length, 60)
  assert.equal(reads.mock.callCount(), 60)
  assert(snapshots.every(world => world === data))
})

test('60 FPS office motion preserves elapsed time and simulation speed while seated work stays at 20 FPS', t => {
  let moving = true
  const { scene, data, frames, ticks } = fixture(t, {
    rendering: { idleFPS: 20, motionFPS: 60 },
    projectActors: () => [{ id: 'one', intent: { actionId: moving ? 'core.walk' : 'core.idle' } }],
  })
  scene.runtime.getRevision = () => 0
  const elapsed = []
  scene.propViews.set('board', { roots: [], updateFrame: dt => elapsed.push(dt) })
  scene.syncActors(0)
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(frames.length, 60)
  assert.equal(ticks(), 60)
  assert(elapsed.every(dt => Math.abs(dt - 1 / 60) < 1e-8))
  assert(Math.abs(elapsed.reduce((a, b) => a + b, 0) - 1) < 1e-8)

  moving = false; scene.syncActors(0)
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(frames.length, 80, 'seated work still uses 20 FPS')
  scene.runtime.isEditing = true; scene.runtime.readEditorWorld = () => data
  for (let i = 0; i < 60; i++) scene.onTick({ deltaTime: 1 })
  assert.equal(frames.length, 140, 'layout editing remains responsive at 60 FPS')
  assert.equal(ticks(), 180)
})

test('30 FPS rendering carries scheduling remainder without counting animation time twice', t => {
  const { scene, frames, ticks } = fixture(t, {
    rendering: { motionFPS: 30 },
    projectActors: () => [{ id: 'one', intent: { actionId: 'core.walk' } }],
  })
  scene.runtime.getRevision = () => 0
  const elapsed = []
  scene.propViews.set('board', { roots: [], updateFrame: dt => elapsed.push(dt) })
  scene.syncActors(0)
  for (let i = 0; i < 20; i++) for (const deltaTime of [1.01, .98, 1.01]) scene.onTick({ deltaTime })
  assert.equal(frames.length, 30, 'minor ticker jitter must not repeatedly drop motion to 20 FPS')
  assert.equal(ticks(), 60)
  assert(Math.abs(elapsed.reduce((a, b) => a + b, 0) - 1) < 1e-8)
})

test('mounted furniture reuses its template until a different template replaces it', t => {
  const { scene, data } = fixture(t)
  const templates = t.mock.fn(id => ({ id, view: 'test' })), updates = [], roots = []
  scene.runtime.template = templates
  scene.viewRegistry = { create(_prop, template) {
    const root = new Container(); roots.push(root)
    return { roots: [root], hitTarget: root, update(_p, t) { updates.push(t); assert.equal(t, template) } }
  } }
  data.props.push({ id: 'desk', templateId: 'first' })
  scene.syncProps()
  for (let i = 0; i < 60; i++) scene.syncActors(1 / 60)
  assert.equal(templates.mock.callCount(), 1, 'templates must not be cloned for every render')
  assert.equal(updates.length, 61)
  data.props[0].templateId = 'second'
  scene.syncProps()
  assert.equal(templates.mock.callCount(), 2)
  assert.equal(roots[0].destroyed, true)
  assert.equal(updates.at(-1).id, 'second')
})

test('changed world dimensions update the camera without needlessly resizing the framebuffer', t => {
  const { scene, data, world, events } = fixture(t)
  scene.resize(800, 600); events.length = 0
  data.width = 48
  scene.resize(800, 600)
  assert.deepEqual(events, ['render'])
  assert.equal(world.scale.x, 800 / 2400)
  assert.equal(world.x, 0)
})

test('optional ambient views share the scene frame, pause while editing, and dispose exactly once', t => {
  const { scene, data } = fixture(t), frames = []
  let disposed = 0
  scene.ambientViews = [{ roots: [], update(dt, world) { frames.push({ dt, world }) }, dispose() { disposed++ } }]
  scene.syncActors(.02)
  assert.deepEqual(frames, [{ dt: .02, world: data }])
  scene.runtime.isEditing = true; scene.runtime.readEditorWorld = () => data
  scene.syncActors(.02)
  assert.equal(frames.at(-1).dt, 0)
  scene.destroy(); scene.destroy()
  assert.equal(disposed, 1)
})

test('dimetric viewport contains all four map corners and reverses picking after resize', async t => {
  const { createDimetricProjection } = await server.ssrLoadModule('/packages/renderer-pixi/src/projection.ts')
  const projection = createDimetricProjection(), { scene, world, data } = fixture(t, { projection })
  for (const [width, height] of [[900, 600], [360, 480], [1400, 600]]) {
    scene.resize(width, height)
    for (const p of projection.areaPolygon({ left: 0, top: 0, right: data.width, bottom: data.height })) {
      const screen = { x: p.x * world.scale.x + world.x, y: p.y * world.scale.y + world.y }
      assert(screen.x >= -1e-7 && screen.x <= width + 1e-7)
      assert(screen.y >= -1e-7 && screen.y <= height + 1e-7)
    }
    const point = projection.cellCenter({ x: 8, y: 6 })
    assert.deepEqual(scene.screenToCell({ x: point.x * world.scale.x + world.x, y: point.y * world.scale.y + world.y }), { x: 8, y: 6 })
    const outside = projection.cellCenter({ x: -1, y: 3 })
    assert.equal(scene.screenToCell({ x: outside.x * world.scale.x + world.x, y: outside.y * world.scale.y + world.y }), null)
  }
})
