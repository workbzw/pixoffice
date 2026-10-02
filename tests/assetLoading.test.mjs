import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Application, Assets, Texture, TextureSource } from 'pixi.js'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { AssetLoadQueue } from '../src/scene/assets/AssetLoadQueue.ts'
import { buildOfficeAssets, OFFICE_IMAGES } from '../scripts/build-office-assets.mjs'
import { createTestServer } from './helpers/vite.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('texture queue runs in parallel, bounds concurrency and continues after synchronous or async failure', async () => {
  assert.throws(() => new AssetLoadQueue(0), /concurrency/)
  const queue = new AssetLoadQueue(2), gates = Array.from({ length: 5 }, deferred), started = []
  const jobs = gates.map((gate, i) => queue.run(() => { started.push(i); return gate.promise }))
  const outcomes = Promise.allSettled(jobs)
  await settle(); assert.deepEqual(started, [0, 1])
  gates[1].reject(new Error('network')); await settle(); assert.deepEqual(started, [0, 1, 2])
  gates[0].resolve(0); await settle(); assert.deepEqual(started, [0, 1, 2, 3])
  gates[2].resolve(2); gates[3].resolve(3); await settle(); assert.deepEqual(started, [0, 1, 2, 3, 4])
  gates[4].resolve(4)
  assert.deepEqual((await outcomes).map(result => result.status), ['fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled'])
  await assert.rejects(queue.run(() => { throw new Error('sync') }), /sync/)
  assert.equal(await queue.run(async () => 42), 42)
})

test('character groups acquire all unique packs concurrently and preserve caller order', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { characterAssets, acquireCharacterPacks } = await server.ssrLoadModule('/src/scene/assets/loadApartmentAssets.ts')
  const gates = new Map(['a', 'b', 'c'].map(id => [id, deferred()])), started = [], loaded = [], released = []
  t.mock.method(characterAssets, 'acquire', async id => {
    started.push(id); await gates.get(id).promise
    return { value: id, release: () => released.push(id) }
  })
  const pending = acquireCharacterPacks(['a', 'b', 'a', 'c'], id => loaded.push(id), { preload: 'startup' })
  assert.deepEqual(started, ['a', 'b', 'c'])
  gates.get('c').resolve(); await settle(); assert.deepEqual(loaded, ['c'])
  gates.get('a').resolve(); gates.get('b').resolve()
  const lease = await pending
  assert.deepEqual(lease.packs, ['a', 'b', 'c'])
  lease.release(); assert.deepEqual(released.sort(), ['a', 'b', 'c'])
})

test('a failed character group releases late successful leases before rejecting', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { characterAssets, acquireCharacterPacks } = await server.ssrLoadModule('/src/scene/assets/loadApartmentAssets.ts')
  const late = deferred(), released = []
  t.mock.method(characterAssets, 'acquire', async id => {
    if (id === 'failed') throw new Error('missing pack')
    if (id === 'late') await late.promise
    return { value: id, release: () => released.push(id) }
  })
  const rejection = assert.rejects(acquireCharacterPacks(['early', 'failed', 'late'], undefined, { preload: 'startup' }), /missing pack/)
  await settle(); assert.deepEqual(released, [])
  late.resolve(); await rejection
  assert.deepEqual(released.sort(), ['early', 'late'])
})

test('missing frame packs report the failure and return the procedural-placeholder path', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { characterAssets, loadApartmentAssets } = await server.ssrLoadModule('/src/scene/assets/loadApartmentAssets.ts')
  const requested = [], errors = [], failure = new Error('missing frame pack')
  t.mock.method(characterAssets, 'acquire', async id => { requested.push(id); throw failure })
  t.mock.method(console, 'error', (...args) => errors.push(args))
  t.mock.method(Assets, 'load', () => assert.fail('missing frame packs must not load an alternate character renderer'))
  assert.equal(await loadApartmentAssets(['marvis'], undefined, { preload: 'startup' }), undefined)
  assert.deepEqual(requested, ['marvis'])
  assert.equal(errors.length, 1)
  assert.equal(errors[0][1], failure)
})

test('default character acquisition waits for full actions and releases every lease if action preparation fails', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { characterAssets, acquireCharacterPacks } = await server.ssrLoadModule('/src/scene/assets/loadApartmentAssets.ts')
  const gates = new Map(['a', 'b'].map(id => [id, deferred()])), loaded = [], released = []
  t.mock.method(characterAssets, 'acquire', async id => ({ value: { ensureAll: () => gates.get(id).promise }, release: () => released.push(id) }))
  const pending = acquireCharacterPacks(['a', 'b'], id => loaded.push(id)), rejection = assert.rejects(pending, /missing action/)
  await settle(); assert.deepEqual(loaded, [])
  gates.get('b').reject(new Error('missing action')); await settle(); assert.deepEqual(released, [])
  gates.get('a').resolve(); await rejection
  assert.deepEqual(loaded, ['a'])
  assert.deepEqual(released.sort(), ['a', 'b'])
})

test('office WebP generation is lossless, deterministic and leaves PNG sources unchanged', async () => {
  const originals = await Promise.all(OFFICE_IMAGES.map(name => readFile(new URL(`../public/assets/office/${name}.png`, import.meta.url))))
  const first = await buildOfficeAssets()
  assert.deepEqual(await buildOfficeAssets(), first)
  for (const [index, name] of OFFICE_IMAGES.entries()) {
    assert((await readFile(new URL(`../public/assets/office/${name}.png`, import.meta.url))).equals(originals[index]))
    const before = await sharp(originals[index]).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const after = await sharp(new URL(`../public/assets/office/${name}.webp`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(after.info, before.info)
    for (let offset = 0; offset < before.data.length; offset += 4) {
      if (after.data[offset + 3] !== before.data[offset + 3] || before.data[offset + 3] &&
        !after.data.subarray(offset, offset + 3).equals(before.data.subarray(offset, offset + 3))) assert.fail(`Changed visible pixel: ${name}, ${offset / 4}`)
    }
  }
  assert(first.reduce((sum, file) => sum + file.webpBytes, 0) < first.reduce((sum, file) => sum + file.originalBytes, 0))
})

test('office textures fall back to retained PNGs when WebP cannot load', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { loadOfficeTexture } = await server.ssrLoadModule('/src/scene/assets/loadOfficeTexture.ts')
  const texture = new Texture({ source: new TextureSource({ width: 10, height: 10 }) })
  t.after(() => texture.destroy(true))
  const requests = []
  t.mock.method(Assets, 'load', async url => {
    requests.push(url)
    if (url === 'test-office-fallback') throw new Error('WebP failed')
    return texture
  })
  assert.equal(await loadOfficeTexture('test-office-fallback', 'desk'), texture)
  assert.deepEqual(requests, ['test-office-fallback', '/assets/office/desk.png'])
})

test('scene paints white and then the background without waiting for characters or furniture', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { OfficeScene } = await server.ssrLoadModule('/src/scene/OfficeScene.ts')
  const { characterAssets } = await server.ssrLoadModule('/src/scene/assets/loadApartmentAssets.ts')
  const remaining = deferred(), backgroundVisible = deferred(), progress = [], frames = []
  const released = []
  const background = new Texture({ source: new TextureSource({ width: 1402, height: 1122 }) })
  t.after(() => background.destroy(true))
  const previousWindow = globalThis.window
  globalThis.window = { devicePixelRatio: 1 }
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow })
  t.mock.method(Application.prototype, 'init', async function ({ width, height }) {
    this.renderer = { canvas: { style: {} }, screen: { width, height }, resize(width, height) { this.screen = { width, height } } }
    this.ticker = { remove() {}, add() {} }
  })
  t.mock.method(Application.prototype, 'render', function () { frames.push(this.stage.children[0]?.children.length) })
  t.mock.method(Application.prototype, 'destroy', () => {})
  t.mock.method(Assets, 'load', async alias => alias === 'office-background' ? background : remaining.promise)
  t.mock.method(characterAssets, 'acquire', async id => {
    await remaining.promise
    return { value: { manifest: { id, clips: {} }, ensureClips() {} }, release: () => released.push(id) }
  })
  const scene = new OfficeScene({ onLoadProgress: value => {
    progress.push(value)
    if (value.completed === 1) backgroundVisible.resolve()
  } })
  t.after(() => scene.destroy())
  const pending = scene.init({ appendChild() {} }, 400, 300)
  await backgroundVisible.promise
  assert.deepEqual(frames, [0, 1], 'first white frame, then office background')
  assert.equal(scene.layer, null, 'actors and furniture are still loading')
  assert.deepEqual(progress.at(-1), { completed: 1, total: 12 })
  scene.resize(800, 600)
  assert.equal(scene.app.screen.width, 800)
  assert.deepEqual(frames, [0, 1, 1], 'resizing during loading repaints the background')
  scene.destroy(); remaining.resolve(background)
  await pending
  assert.deepEqual(frames, [0, 1, 1], 'late assets cannot draw after scene destruction')
  assert.equal(scene.app, null)
  assert.deepEqual(released.sort(), scene.getAgents().map(agent => agent.appearanceId ?? agent.id).sort(), 'late frame packs are released after scene destruction')
})
