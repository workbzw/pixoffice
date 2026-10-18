import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Container } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, SceneView
before(async () => {
  server = await createTestServer()
  ;({ SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts'))
})
after(() => server?.close())

function fixture(update = () => {}) {
  const template = { id: 'stateful', name: 'Stateful', initialState: { count: 0, nested: { ready: true } } }
  const world = { props: [], actors: [], blockedAreas: [] }, roots = []
  const view = new SceneView({ runtime: { sceneId: 'test', isEditing: true, template: () => template, readWorld: () => world, readEditorWorld: () => structuredClone(world) },
    pack: { cellPixels: 50, projectActors: () => [], createPropViews: () => ({ create() {
      const root = new Container(); roots.push(root)
      return { roots: [root], hitTarget: root, update }
    } }) } })
  return { view, template, roots }
}

test('drag previews use isolated template state instead of an empty object', t => {
  const { view, template } = fixture(); t.after(() => view.destroy())
  view.previewProp({ id: 'preview', templateId: 'stateful', position: { x: 1, y: 1 } })
  const prop = view.viewWorld().props[0]
  assert.deepEqual(prop.state, template.initialState)
  prop.state.nested.ready = false
  assert.equal(template.initialState.nested.ready, true)
})

test('furniture thumbnails use template defaults and always destroy temporary views', async t => {
  let state
  const { view, template, roots } = fixture(prop => { state = prop.state; assert.equal(prop.state.count, 0) })
  t.after(() => { view.app = null; view.destroy() })
  view.app = { renderer: { extract: { base64: async () => 'data:image/png;base64,preview' } } }
  assert.equal(await view.furnitureThumbnail('stateful'), 'data:image/png;base64,preview')
  assert.deepEqual(state, template.initialState)
  assert.notEqual(state, template.initialState)
  assert.equal(roots[0].destroyed, true)
})

test('failed thumbnail rendering does not leak its temporary display objects', async t => {
  const { view, roots } = fixture(() => { throw new Error('invalid view state') })
  t.after(() => { view.app = null; view.destroy(); roots.forEach(root => { if (!root.destroyed) root.destroy({ children: true }) }) })
  view.app = { renderer: { extract: { base64: async () => 'unused' } } }
  await assert.rejects(view.furnitureThumbnail('stateful'), /invalid view state/)
  assert.equal(roots[0].destroyed, true)
})
