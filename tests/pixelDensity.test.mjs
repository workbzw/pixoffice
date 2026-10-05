import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderResolution, watchPixelDensity } from '../packages/renderer-pixi/src/pixelDensity.ts'

test('render density follows fractional zoom and keeps the existing GPU budget', t => {
  const previous = globalThis.window
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  globalThis.window = { devicePixelRatio: 1.25 }
  assert.equal(renderResolution(), 1.25)
  globalThis.window.devicePixelRatio = 3
  assert.equal(renderResolution(), 2)
  globalThis.window.devicePixelRatio = undefined
  assert.equal(renderResolution(), 1)
  watchPixelDensity(() => assert.fail('no media query support'))()
})

test('density subscription re-arms across repeated display changes and stops on disposal', t => {
  const previous = globalThis.window, queries = [], changes = []
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  globalThis.window = { devicePixelRatio: 1, matchMedia(media) {
    const query = { media, listeners: new Set(),
      addEventListener(_, listener) { this.listeners.add(listener) },
      removeEventListener(_, listener) { this.listeners.delete(listener) },
    }
    queries.push(query)
    return query
  } }
  const dispose = watchPixelDensity(() => changes.push(renderResolution()))
  for (const density of [2, 1.5, 1]) {
    globalThis.window.devicePixelRatio = density
    const previousQuery = queries.at(-1)
    for (const listener of previousQuery.listeners) listener()
    assert.equal(previousQuery.listeners.size, 0)
    assert.equal(queries.at(-1).media, `(resolution: ${density}dppx)`)
  }
  assert.deepEqual(changes, [2, 1.5, 1])
  dispose(); dispose()
  assert(queries.every(query => query.listeners.size === 0))
})
