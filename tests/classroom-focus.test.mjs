import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'

let server, createClassroomFocus
before(async () => {
  server = await createTestServer()
  ;({ createClassroomFocus } = await server.ssrLoadModule('/example/classroom/src/focusMode.ts'))
})
after(async () => { await server?.close() })

function fixture(t) {
  const document = new EventTarget(), changes = [], requests = []
  Object.assign(document, {
    fullscreenEnabled: true, fullscreenElement: null, exitCalls: 0,
    exitFullscreen() {
      this.exitCalls++
      this.fullscreenElement = null
      this.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    },
  })
  const element = { ownerDocument: document, requestFullscreen(options) {
    requests.push(options)
    document.fullscreenElement = element
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  } }
  const mode = createClassroomFocus(element, value => changes.push(value))
  t.after(() => mode.dispose())
  return { document, element, changes, requests, mode }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

test('focus mode requests native fullscreen directly and native exit restores the regular layout', async t => {
  const { document, changes, requests, mode } = fixture(t)
  mode.enter()
  assert.deepEqual(changes, [true])
  assert.deepEqual(requests, [{ navigationUI: 'hide' }])
  await flush()
  await document.exitFullscreen()
  assert.deepEqual(changes, [true, false])
})

test('unsupported fullscreen still permits entering and exiting in-page focus mode', t => {
  for (const disabled of [true, false]) {
    const { document, element, changes, requests, mode } = fixture(t)
    if (disabled) document.fullscreenEnabled = false
    else element.requestFullscreen = undefined
    mode.enter(); mode.enter(); mode.exit(); mode.exit()
    assert.deepEqual(changes, [true, false])
    assert.deepEqual(requests, [])
  }
})

test('rejected or synchronously throwing fullscreen requests retain the focus fallback', async t => {
  for (const asyncFailure of [true, false]) {
    const { element, changes, mode } = fixture(t)
    element.requestFullscreen = () => {
      if (asyncFailure) return Promise.reject(new Error('Not permitted'))
      throw new Error('Not supported')
    }
    assert.doesNotThrow(() => mode.enter())
    await flush()
    assert.deepEqual(changes, [true])
    mode.exit()
    assert.deepEqual(changes, [true, false])
  }
})

test('Escape exits both native fullscreen and in-page focus mode without cancelling other keys', t => {
  for (const native of [true, false]) {
    const { document, changes, mode } = fixture(t)
    document.fullscreenEnabled = native
    const key = value => {
      const event = new Event('keydown')
      Object.defineProperty(event, 'key', { value })
      document.dispatchEvent(event)
    }
    mode.enter(); key('Enter')
    assert.deepEqual(changes, [true])
    key('Escape')
    assert.deepEqual(changes, [true, false])
    assert.equal(document.fullscreenElement, null)
    assert.equal(document.exitCalls, native ? 1 : 0)
  }
})

test('exiting focus never exits another element\'s fullscreen', t => {
  const { document, changes, requests, mode } = fixture(t)
  document.fullscreenElement = { other: true }
  mode.enter(); mode.exit(); mode.dispose()
  assert.deepEqual(changes, [true, false])
  assert.deepEqual(requests, [])
  assert.equal(document.exitCalls, 0)
})

test('a late fullscreen success after exit or disposal cannot trap the classroom in fullscreen', async t => {
  for (const dispose of [true, false]) {
    const { document, element, changes, mode } = fixture(t)
    let resolve
    element.requestFullscreen = () => new Promise(done => { resolve = done })
    mode.enter()
    if (dispose) mode.dispose()
    else mode.exit()
    document.fullscreenElement = element
    resolve()
    await flush()
    assert.equal(document.fullscreenElement, null)
    assert.equal(document.exitCalls, 1)
    assert.deepEqual(changes, dispose ? [true] : [true, false])
  }
})

test('disposing removes keyboard/fullscreen listeners and refuses re-entry', async t => {
  const { document, changes, requests, mode } = fixture(t)
  mode.enter()
  await flush()
  mode.dispose(); mode.enter()
  const event = new Event('keydown')
  Object.defineProperty(event, 'key', { value: 'Escape' })
  document.dispatchEvent(event)
  document.dispatchEvent(new Event('fullscreenchange'))
  assert.deepEqual(changes, [true])
  assert.equal(requests.length, 1)
  assert.equal(document.fullscreenElement, null)
})
