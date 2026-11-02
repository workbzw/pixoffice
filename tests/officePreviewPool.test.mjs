import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Application } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, OfficePreviewPool, OfficeScene
before(async () => {
  server = await createTestServer()
  ;({ OfficePreviewPool } = await server.ssrLoadModule('/example/office-web/src/dispatch/OfficePreviewPool.ts'))
  ;({ OfficeScene } = await server.ssrLoadModule('/example/office-web/src/application/OfficeScene.ts'))
})
after(() => server?.close())

function fixture(t, { sharedRenderer = true } = {}) {
  let now = 0
  const canvas = () => ({ width: 0, height: 0, clientWidth: 320, clientHeight: 240, dataset: {}, getContext: () => ({ drawImage() {} }) })
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false, createElement: tag => tag === 'canvas' ? canvas() : {} } })
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document })
  t.mock.method(performance, 'now', () => now)
  t.mock.method(console, 'warn', () => {})
  t.mock.method(OfficeScene.prototype, 'prepareActions', async () => {})
  t.mock.method(OfficeScene.prototype, 'resize', () => {})
  t.mock.method(OfficeScene.prototype, 'renderPreview', function () { return !this.grid.destroyed })
  t.mock.method(OfficeScene.prototype, 'whenFrameReady', async () => true)
  const runtime = { sceneId: 'preview', readActors: () => [{ id: 'actor', templateId: 'office-lead' }], readWorld: () => ({ width: 24, height: 19, actors: [], props: [] }) }
  const session = { runtime, simulation: { runtime, subscribe: () => () => {} }, getSnapshot: () => ({ dashboard: null }) }
  const pool = new OfficePreviewPool(), states = [], target = canvas()
  t.mock.method(pool, 'schedule', () => {})
  if (sharedRenderer) t.mock.method(pool, 'renderer', async () => ({ canvas: canvas() }))
  pool.watch('preview', session, target, state => states.push(state))
  t.after(() => pool.stop())
  return { pool, states, target, canvas, advance: value => { now = value } }
}

test('a failed preview is destroyed and recreated after a retry delay', async t => {
  const { pool, states, target, advance } = fixture(t), scenes = []
  const init = t.mock.method(OfficeScene.prototype, 'init', async function () {
    scenes.push(this)
    if (scenes.length === 1) { this.destroy(); throw new Error('temporary resource failure') }
  })
  await pool.sample(0)
  assert.deepEqual(states, ['loading', 'error'])
  assert.equal(scenes[0].grid.destroyed, true)
  await pool.sample(0); advance(999); await pool.sample(0)
  assert.equal(init.mock.callCount(), 1)
  advance(1000); await pool.sample(0)
  assert.equal(init.mock.callCount(), 2)
  assert.notEqual(scenes[0], scenes[1])
  assert.equal(states.at(-1), 'ready')
  assert.equal(target.dataset.frame, '1')
})

test('persistent preview failures back off and closing cancels pending retries', async t => {
  const { pool, advance } = fixture(t)
  const init = t.mock.method(OfficeScene.prototype, 'init', async () => { throw new Error('offline') })
  for (const time of [0, 1000, 3000, 7000]) { advance(time); await pool.sample(0) }
  assert.equal(init.mock.callCount(), 4)
  advance(8000); await pool.sample(0)
  assert.equal(init.mock.callCount(), 4)
  pool.stop(); advance(30000); await pool.sample(0)
  assert.equal(init.mock.callCount(), 4)
})

test('a rejected shared renderer initialization is released and can recover on the next retry', async t => {
  const { pool, states, target, canvas, advance } = fixture(t, { sharedRenderer: false })
  let attempts = 0
  const init = t.mock.method(Application.prototype, 'init', async function () {
    if (++attempts === 1) throw new Error('temporary renderer failure')
    this.renderer = { canvas: canvas() }
  })
  t.mock.method(Application.prototype, 'destroy', function () { this.stage.destroy({ children: true }) })
  t.mock.method(OfficeScene.prototype, 'init', async () => {})
  await pool.sample(0)
  assert.equal(states.at(-1), 'error')
  assert.equal(pool.application, undefined)
  await pool.sample(0)
  assert.equal(init.mock.callCount(), 1)
  advance(1000); await pool.sample(0)
  assert.equal(init.mock.callCount(), 2)
  assert.equal(states.at(-1), 'ready')
  assert.equal(target.dataset.frame, '1')
  pool.stop()
  await new Promise(resolve => setImmediate(resolve))
})
