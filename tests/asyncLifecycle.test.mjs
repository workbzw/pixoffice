import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Application } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, SceneView, AnimationResources
before(async () => {
  server = await createTestServer()
  ;({ SceneView } = await server.ssrLoadModule('/packages/renderer-pixi/src/SceneView.ts'))
  ;({ AnimationResources } = await server.ssrLoadModule('/packages/renderer-pixi/src/presentation/AnimationResources.ts'))
})
after(() => server?.close())

function fixture(options = {}) {
  const world = { width: 2, height: 2, actors: [], props: [] }
  return new SceneView({ runtime: { readWorld: () => world, getRevision: () => 0, subscribe: () => () => {}, isEditing: false },
    pack: { cellPixels: 50, resourceCount: 1, createPropViews: () => ({}), projectActors: () => [],
      loadBackground: async () => null, loadObjects: async () => {} }, ...options })
}

test('renderer initialization and background failures are handled without detached promise errors', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/scene-init-failure.mjs', import.meta.url))])
  const result = JSON.parse(stdout.trim().split('\n').at(-1))
  assert.equal(result.failure, 'app-init-failed')
  assert.deepEqual(result.unhandled, [])
  assert.equal(result.destroyed, true)
})

test('concurrent init calls share one application and a failed init cleans its canvas', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } })
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window })
  let release, initialized = 0, destroyed = 0
  const gate = new Promise(resolve => { release = resolve })
  t.mock.method(Application.prototype, 'init', async function () {
    initialized++
    this.renderer = { screen: { width: 100, height: 100 }, resolution: 1, canvas: { style: {} }, render() {}, resize() {} }
    this.ticker = { remove() {}, add() {} }
    await gate
  })
  t.mock.method(Application.prototype, 'destroy', function () { destroyed++; this.stage.destroy({ children: true }) })
  const scene = fixture({ onLoadProgress() { throw new Error('progress observer failed') } })
  const host = { clientWidth: 100, clientHeight: 100, appendChild() {} }
  const first = scene.init(host, 100, 100), second = scene.init(host, 100, 100)
  const settled = Promise.allSettled([first, second])
  t.after(async () => { release(); await settled; scene.destroy() })
  assert.equal(first, second)
  assert.equal(initialized, 1)
  release()
  const results = await settled
  assert(results.every(result => result.status === 'rejected' && result.reason.message === 'progress observer failed'))
  assert.equal(destroyed, 1)
  assert.equal(scene.areActionsReady, false)
  assert.equal(scene.grid.destroyed, true)
})

test('one failed cleanup cannot retain the application, other ambient views or animation leases', t => {
  t.mock.method(console, 'warn', () => {})
  const scene = fixture(), calls = []
  scene.unsubscribe = () => { calls.push('unsubscribe'); throw new Error('unsubscribe failed') }
  scene.unwatchPixelDensity = () => calls.push('density')
  scene.onDestroy = () => { calls.push('hook'); throw new Error('hook failed') }
  scene.ambientViews = [
    { roots: [], dispose() { calls.push('ambient-a'); throw new Error('ambient failed') } },
    { roots: [], dispose() { calls.push('ambient-b') } },
  ]
  scene.app = { ticker: { remove() { calls.push('ticker'); throw new Error('ticker failed') } }, destroy() { calls.push('app') } }
  scene.characterLease = { release() { calls.push('lease') } }
  t.after(() => { if (!scene.grid.destroyed) scene.grid.destroy(); if (!scene.overlays.destroyed) scene.overlays.destroy({ children: true }) })
  assert.doesNotThrow(() => scene.destroy())
  assert.deepEqual(calls, ['unsubscribe', 'density', 'hook', 'ambient-a', 'ambient-b', 'ticker', 'app', 'lease'])
  scene.destroy()
  assert.equal(calls.length, 8)
  assert.equal(scene.grid.destroyed && scene.overlays.destroyed, true)
})

test('a failed adapter release does not prevent release of other appearances', t => {
  t.mock.method(console, 'warn', () => {})
  const resources = new AnimationResources(), calls = []
  resources.leases.set('first', { release() { calls.push('first'); throw new Error('adapter release failed') } })
  resources.leases.set('second', { release() { calls.push('second') } })
  assert.doesNotThrow(() => resources.release())
  resources.release()
  assert.deepEqual(calls, ['first', 'second'])
})

test('disposing from a host step stops the current frame before sampling or post-frame callbacks', () => {
  const scene = fixture({ onStep: () => scene.destroy() }), calls = []
  scene.syncActors = () => calls.push('sample')
  scene.afterTick = () => calls.push('after')
  scene.onTick({ deltaTime: 1 })
  scene.onTick({ deltaTime: 1 })
  assert.deepEqual(calls, [])
  assert.equal(scene.areActionsReady, false)
})
