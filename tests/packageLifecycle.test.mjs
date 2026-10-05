import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

async function setup(t, onStep, dispatch = false) {
  const server = await createTestServer()
  t.after(() => server.close())
  const { createSceneRuntime } = await server.ssrLoadModule('/packages/runtime/src/index.ts')
  const { officeScenePack } = await server.ssrLoadModule('/packages/scene-office/src/core/index.ts')
  const { createOfficePresentation } = await server.ssrLoadModule('/packages/scene-office/src/pixi/index.ts')
  const { SceneView, AnimationRegistry } = await server.ssrLoadModule('/packages/renderer-pixi/src/index.ts')
  const runtime = createSceneRuntime(officeScenePack)
  const scene = new SceneView({ runtime, pack: createOfficePresentation(), animations: new AnimationRegistry(),
    resolveAppearance() { throw new Error('not loaded in headless lifecycle test') },
    onStep, dispatchCommand: dispatch ? command => runtime.submit(command) : undefined })
  t.after(() => { scene.destroy(); runtime.dispose() })
  return { scene, runtime }
}

test('a view neither advances nor disposes an externally owned runtime implicitly', async t => {
  const { scene, runtime } = await setup(t)
  const tick = t.mock.method(runtime, 'tick', () => {})
  const dispose = t.mock.method(runtime, 'dispose', () => {})
  scene.onTick({ deltaTime: 1 })
  scene.destroy(); scene.destroy()
  assert.equal(tick.mock.callCount(), 0)
  assert.equal(dispose.mock.callCount(), 0)
})

test('the host clock runs once per ready frame and remains gated during resource loading', async t => {
  const elapsed = []
  const { scene } = await setup(t, ms => elapsed.push(ms))
  scene.onTick({ deltaTime: 3 })
  assert.deepEqual(elapsed, [50])
  scene.actionsReady = false
  scene.onTick({ deltaTime: 3 })
  assert.deepEqual(elapsed, [50])
})

test('editing uses the injected command port and a read-only view rejects writes', async t => {
  const readonly = await setup(t)
  assert.throws(() => readonly.scene.beginEditing(), /no command dispatcher/)
  assert.equal(readonly.runtime.isEditing, false)
  const writable = await setup(t, undefined, true)
  writable.scene.beginEditing()
  assert.equal(writable.runtime.isEditing, true)
  writable.scene.cancelEditing()
  assert.equal(writable.runtime.isEditing, false)
})
