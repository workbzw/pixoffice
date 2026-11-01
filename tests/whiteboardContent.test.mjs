import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DOMAdapter, Rectangle, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'

let server, WhiteboardContent
before(async () => {
  server = await createTestServer()
  ;({ WhiteboardContent } = await server.ssrLoadModule('/packages/scene-office/src/pixi/views/WhiteboardContent.ts'))
})
after(() => server?.close())
const settle = () => new Promise(resolve => setImmediate(resolve))

function setup(t) {
  const generated = [], returned = [], copies = [], textures = []
  const sharedImage = { width: 1842, height: 630, version: 0 }
  t.mock.method(DOMAdapter.get(), 'createCanvas', (width, height) => ({ width, height,
    getContext: () => ({ drawImage(resource, ...coordinates) { copies.push({ resource, version: resource.version, coordinates }) } }),
  }))
  const renderer = { htmlText: {
    getTexturePromise(options) {
      let resolve, reject
      const promise = new Promise((yes, no) => { resolve = yes; reject = no })
      generated.push({ options, resolve, reject, promise })
      return promise
    },
    returnTexturePromise(promise) { returned.push(promise) },
  } }
  const complete = index => {
    sharedImage.version = index + 1
    const texture = new Texture({ source: new TextureSource({ resource: sharedImage, width: 1024, height: 512, resolution: 2 }),
      frame: new Rectangle(0, 0, 920, 314) })
    textures.push(texture); generated[index].resolve(texture)
  }
  const view = new WhiteboardContent({ text: 'first', resolution: 2, style: { fontFamily: 'sans-serif', fontSize: 28 } })
  t.after(() => { if (!view.destroyed) view.destroy(); textures.forEach(texture => texture.destroy(true)) })
  return { view, renderer, generated, returned, copies, sharedImage, complete }
}

test('whiteboard keeps a private complete frame while the pooled HTML image is reused', async t => {
  const { view, renderer, generated, returned, copies, sharedImage, complete } = setup(t)
  view.onRender(renderer)
  assert.equal(view.texture, Texture.EMPTY)
  complete(0); await settle()
  const first = view.texture, pixels = first.source.resource
  assert.notEqual(pixels, sharedImage)
  assert.deepEqual([pixels.width, pixels.height, first.width, first.height], [1840, 628, 920, 314])
  assert.equal(copies[0].version, 1)
  assert.deepEqual(returned, [generated[0].promise])
  view.text = 'next'; view.onRender(renderer)
  sharedImage.version = 99
  assert.equal(view.texture, first, 'keep the previous complete frame throughout generation')
  assert.equal(first.destroyed, false)
  assert.equal(copies[0].version, 1, 'later mutations of the pooled image cannot change displayed pixels')
  complete(1); await settle()
  assert.notEqual(view.texture, first)
  assert.equal(first.destroyed, true)
  assert.equal(copies[1].version, 2)
  view.onRender(renderer)
  assert.equal(generated.length, 2, 'unchanged content does not generate another texture')
  const latest = view.texture
  view.destroy()
  assert.equal(latest.destroyed, true)
  assert.equal(Texture.EMPTY.destroyed, false)
})

test('frame readiness waits for the whiteboard raster before a preview captures it', async t => {
  const { view, renderer, complete } = setup(t)
  view.onRender(renderer)
  let ready = false
  const waiting = view.whenReady().then(() => { ready = true })
  await settle()
  assert.equal(ready, false)
  complete(0); await waiting
  assert.equal(ready, true)
  assert.notEqual(view.texture, Texture.EMPTY)
})

test('whiteboard coalesces pending updates, discards stale results and retains the last frame on failure', async t => {
  const { view, renderer, generated, returned, copies, complete } = setup(t)
  view.onRender(renderer); complete(0); await settle()
  const first = view.texture
  view.text = 'second'; view.onRender(renderer)
  view.text = 'third'; view.onRender(renderer)
  assert.equal(generated.length, 2, 'only one rasterization is in flight')
  complete(1); await settle()
  assert.equal(view.texture, first)
  assert.equal(copies.length, 1, 'stale frames are not uploaded or displayed')
  view.onRender(renderer)
  assert.equal(generated[2].options.text, 'third')
  t.mock.method(console, 'warn', () => {})
  t.mock.method(performance, 'now', () => 100)
  generated[2].reject(new Error('SVG decode failed')); await settle()
  assert.equal(view.texture, first)
  view.onRender(renderer)
  assert.equal(generated.length, 3, 'failed generation is not retried every frame')
  t.mock.method(performance, 'now', () => 1101)
  view.onRender(renderer); complete(3); await settle()
  assert.notEqual(view.texture, first)
  assert.equal(returned.length, 4)
})

test('destroying a whiteboard during generation releases the late result without mounting it', async t => {
  const { view, renderer, generated, returned, copies, complete } = setup(t)
  view.onRender(renderer)
  view.destroy()
  complete(0); await settle()
  assert.equal(copies.length, 0)
  assert.deepEqual(returned, [generated[0].promise])
  assert.equal(Texture.EMPTY.destroyed, false)
})

test('a pooled image already reused by another board cannot replace the last complete frame', async t => {
  const { view, renderer, copies, sharedImage, complete } = setup(t)
  view.onRender(renderer); complete(0); await settle()
  const first = view.texture
  view.text = 'next'; view.onRender(renderer)
  t.mock.method(console, 'warn', () => {})
  complete(1); sharedImage.complete = false; await settle()
  assert.equal(view.texture, first)
  assert.equal(first.destroyed, false)
  assert.equal(copies.length, 1)
})
