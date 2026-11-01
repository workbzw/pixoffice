import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Application, Assets, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, viewport, backdrop
before(async () => {
  server = await createTestServer()
  ;({ adaptiveOfficeViewport: viewport, createAdaptiveOfficeBackdrop: backdrop } = await server.ssrLoadModule('/packages/scene-office/src/pixi/adaptiveOffice.ts'))
})
after(() => server?.close())
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`)

test('adaptive room centers the unchanged work area and preserves the window at every viewport ratio', () => {
  const texture = new Texture({ source: new TextureSource({ width: 1774, height: 887 }) })
  const view = backdrop(texture), room = view.root.children[0]
  try {
    for (const [width, height] of [[1600, 950], [1920, 1080], [2560, 720], [1000, 900], [390, 220], [370, 650]]) {
      const area = viewport(width, height), scale = Math.min(width / 1600, height / 950)
      near(area.left + area.right, width)
      near(area.right - area.left, 1100 * scale)
      near(area.bottom, 950 * scale)
      assert(area.left >= 0 && area.right <= width)
      assert(area.bottom <= height)
      view.resize(width, height)
      near(view.root.scale.x, view.root.scale.y)
      near(room.width * view.root.scale.x, width)
      near(room.height * view.root.scale.y, height)
      near(room.rightWidth * view.root.scale.x, 400 * scale)
      near(room.leftWidth * view.root.scale.x / scale, 360 * 950 / 887)
      assert(room.leftWidth * view.root.scale.x < area.left + 150 * scale, 'archive and water dispenser area stays left of the walkable area')
      assert(width - room.rightWidth * view.root.scale.x >= area.left + 950 * scale - 1e-7, 'window storage stays right of the walkable area')
      assert.equal(room.topHeight, 740, 'office equipment remains in the unstretched region')
      assert.equal(view.root.eventMode, 'none')
    }
  } finally { view.root.destroy({ children: true }); texture.destroy(true) }
})

test('adaptive board artwork and live content share a hit target and release only their cropped texture', async t => {
  const { loadAdaptiveWhiteboard } = await server.ssrLoadModule('/packages/scene-office/src/pixi/assets/loadReferenceOfficeAssets.ts')
  const { createReferenceOfficePresentation } = await server.ssrLoadModule('/packages/scene-office/src/pixi/index.ts')
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const texture = new Texture({ source: new TextureSource({ width: 2097, height: 750 }) })
  t.mock.method(Assets, 'load', async () => texture)
  await loadAdaptiveWhiteboard()
  const runtime = createOfficeRuntime({ referenceLayout: true })
  const prop = runtime.readWorld().props.find(item => item.id === 'whiteboard-1'), template = runtime.template(prop.templateId)
  const view = createReferenceOfficePresentation({ presentation: 'panorama' }).createPropViews().create(prop, template)
  try {
    view.update(prop, template, [])
    const [sprite, mask, text] = view.roots[0].children, area = view.hitTarget.hitArea
    assert.equal(sprite.mask, mask)
    assert.equal(sprite.texture.source, texture.source)
    assert(area.contains(text.x, text.y))
    assert(area.contains(text.x + 920 * text.scale.x, text.y + 314 * text.scale.y))
    assert.deepEqual([area.width, area.height], [900, 302])
    assert.equal(text.scale.x, .9)
    const cropped = sprite.texture
    view.roots[0].destroy({ children: true })
    assert.equal(cropped.destroyed, true)
    assert.equal(texture.destroyed, false)
  } finally {
    view.roots.filter(root => !root.destroyed).forEach(root => root.destroy({ children: true }))
    runtime.dispose(); texture.destroy(true)
  }
})

test('renderer keeps adaptive backdrop behind the world and transforms picking with the safe viewport', async t => {
  const previousWindow = globalThis.window
  globalThis.window = { devicePixelRatio: 1 }
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow })
  const { SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts')
  const { PropViewRegistry } = await server.ssrLoadModule('/packages/renderer-pixi/src/PropViewRegistry.ts')
  const texture = new Texture({ source: new TextureSource({ width: 1774, height: 887 }) })
  t.mock.method(Application.prototype, 'init', async function ({ width, height, resolution }) {
    this.renderer = { canvas: { style: {} }, resolution, screen: { width, height }, resize(width, height, resolution) { this.screen = { width, height }; this.resolution = resolution } }
    this.ticker = { remove() {}, add() {} }
  })
  t.mock.method(Application.prototype, 'render', () => {})
  t.mock.method(Application.prototype, 'destroy', function () { this.stage.destroy({ children: true }) })
  const world = { width: 22, height: 17, actors: [], props: [] }
  const scene = new SceneView({ runtime: { readWorld: () => world, subscribe: () => () => {} }, animations: {},
    resolveAppearance: async () => assert.fail('empty room has no character assets'),
    pack: { id: 'test', resourceCount: 1, cellPixels: 50, projectActors: () => [],
      contentBounds: () => ({ left: 0, top: -100, right: 1100, bottom: 850 }),
      loadBackground: async () => texture, loadObjects: async () => {}, createPropViews: () => new PropViewRegistry(),
      createBackdrop: backdrop, viewportBounds: viewport,
    },
  })
  try {
    await scene.init({ appendChild() {} }, 1600, 950)
    assert.equal(scene.app.stage.children[0], scene.backdrop.root)
    assert.equal(scene.app.stage.children[1], scene.world)
    for (const [width, height] of [[1600, 950], [2400, 720], [390, 500]]) {
      scene.resize(width, height)
      const scale = Math.min(width / 1600, height / 950)
      near(scene.world.scale.x, scale)
      near(scene.world.x + 550 * scale, width / 2)
      const point = { x: scene.world.x + 325 * scale, y: scene.world.y + 225 * scale }
      assert.deepEqual(scene.screenToCell(point), { x: 6, y: 4 })
      assert.equal(scene.screenToCell({ x: width - 1, y: height / 2 }), null)
      near(scene.backdrop.root.children[0].width * scene.backdrop.root.scale.x, width)
    }
    const backgroundRoot = scene.backdrop.root
    scene.destroy()
    assert.equal(backgroundRoot.destroyed, true)
    assert.equal(texture.destroyed, false)
  } finally { scene.destroy(); texture.destroy(true) }
})
