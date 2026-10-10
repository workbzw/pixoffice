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

function fixture(t) {
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
    pack: { cellPixels: 50, createPropViews: () => ({}), projectActors: () => [] },
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
