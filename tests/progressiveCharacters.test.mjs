import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Assets, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5))

async function resources(t) {
  const server = await createTestServer(); t.after(() => server.close())
  const { CharacterPackResources } = await server.ssrLoadModule('/example/office-web/src/scene/assets/CharacterPackResources.ts')
  const full = await characterPackFixture()
  const pageTextures = full.manifest.pages.map(page => new Texture({ source: new TextureSource({ width: page.width, height: page.height }) }))
  const pack = new CharacterPackResources(full.manifest, pageTextures.map((_, index) => `/test-${index}.webp`))
  const loads = [], unloaded = []
  t.mock.method(Assets, 'load', async url => { loads.push(url); return pageTextures[pack.pageUrls.indexOf(url)] })
  t.mock.method(Assets, 'unload', async url => { unloaded.push(url) })
  t.after(async () => { await pack.dispose(); full.dispose(); pageTextures.forEach(texture => texture.destroy(true)) })
  return { server, pack, full, pageTextures, loads, unloaded }
}

test('progressive packs load only startup pages, deduplicate action loads and preserve fixed texture registration', async t => {
  const { pack, loads, pageTextures } = await resources(t)
  await pack.ensureStartup()
  assert.deepEqual(loads, ['/test-0.webp'])
  assert.equal(pack.isComplete, false)
  assert([...pack.textures.keys()].every(key => pack.manifest.frames[key].page === 0))
  const gate = deferred()
  t.mock.method(Assets, 'load', async url => { loads.push(url); await gate.promise; return pageTextures[1] })
  const actions = Promise.all([pack.ensureClips(['walk.front']), pack.ensureAll(), pack.ensureClips(['idle.left'])])
  await settle()
  assert.deepEqual(loads, ['/test-0.webp', '/test-1.webp'])
  gate.resolve(); await actions
  assert.equal(pack.isComplete, true)
  assert.equal(pack.textures.size, Object.keys(pack.manifest.frames).length)
  for (const texture of pack.textures.values()) assert.deepEqual([texture.orig.width, texture.orig.height], [pack.manifest.canvas.width, pack.manifest.canvas.height])
})

test('failed deferred pages leave startup poses intact and can be retried', async t => {
  const { pack, pageTextures, loads } = await resources(t)
  await pack.ensureStartup()
  const initial = [...pack.textures.values()]
  let attempt = 0
  t.mock.method(Assets, 'load', async url => { loads.push(url); if (++attempt === 1) throw new Error('offline'); return pageTextures[1] })
  await assert.rejects(pack.ensureAll(), /offline/)
  assert.equal(pack.isComplete, false)
  assert(initial.every(texture => !texture.destroyed))
  await pack.ensureAll()
  assert.equal(pack.isComplete, true)
  assert.equal(attempt, 2)
})

test('disposing during deferred loading waits for late pages, creates no late views and unloads only owned pages', async t => {
  const { pack, pageTextures, unloaded } = await resources(t)
  await pack.ensureStartup()
  const gate = deferred(), started = deferred()
  t.mock.method(Assets, 'load', async () => { started.resolve(); await gate.promise; return pageTextures[1] })
  const pending = pack.ensureAll(), rejected = assert.rejects(pending, /disposed/)
  await started.promise
  const disposing = pack.dispose()
  gate.resolve(); await rejected; await disposing
  assert.equal(pack.textures.size, 0)
  assert.deepEqual(unloaded.sort(), ['/test-0.webp', '/test-1.webp'])
  await assert.rejects(pack.ensureStartup(), /disposed/)
})

test('old manifests without page groups still load fully and invalid page dimensions are retryable', async t => {
  const { pack, pageTextures, loads, unloaded } = await resources(t)
  pack.manifest.pages.forEach(page => { delete page.group })
  const invalid = new Texture({ source: new TextureSource({ width: 1, height: 1 }) })
  t.after(() => invalid.destroy(true))
  let wrong = true
  t.mock.method(Assets, 'load', async url => { loads.push(url); return url === '/test-1.webp' && wrong ? invalid : pageTextures[pack.pageUrls.indexOf(url)] })
  await assert.rejects(pack.ensureStartup(), /dimensions mismatch/)
  assert.deepEqual(unloaded, ['/test-1.webp'])
  wrong = false; await pack.ensureStartup()
  assert.equal(pack.isComplete, true)
  assert.equal(loads.filter(url => url === '/test-0.webp').length, 1)
})

test('partial character poses retain the previous complete body and mouth until all new layers exist', async t => {
  const { server, full } = await resources(t)
  const { ApartmentCharacter } = await server.ssrLoadModule('/example/office-web/src/scene/characters/ApartmentCharacter.ts')
  const { sampleCharacterLayers } = await server.ssrLoadModule('/example/office-web/src/scene/characters/packSchema.ts')
  const character = new ApartmentCharacter('marvis'); character.pack = full
  t.after(() => character.destroy())
  character.setViewFacing('front'); character.update(0)
  const body = character.sprite.texture, mouth = character.mouthSprite.texture, head = character.getHeadOffsetY()
  const next = sampleCharacterLayers(full.manifest, 'idle.right'), missing = full.textures.get(next.mouth.key)
  full.textures.delete(next.mouth.key)
  character.setViewFacing('right'); character.update(0)
  assert.equal(character.sprite.texture, body)
  assert.equal(character.mouthSprite.texture, mouth)
  assert.equal(character.mouthSprite.visible, true)
  assert.equal(character.getHeadOffsetY(), head)
  assert.match(character.actionError, /loading/)
  full.textures.set(next.mouth.key, missing); character.update(0)
  assert.equal(character.sprite.texture, full.textures.get(next.body.key))
  assert.equal(character.actionError, undefined)
})

test('scene keeps current animations ticking but gates simulation and gateway until actions are ready, including retry', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { OfficeScene } = await server.ssrLoadModule('/example/office-web/src/scene/OfficeScene.ts')
  const { isOfficeSceneReady } = await server.ssrLoadModule('/example/office-web/src/scene/officeSceneBridge.ts')
  const states = [], scene = new OfficeScene({ onActionProgress: state => states.push(state) })
  scene.firstFrameReady = true
  t.after(() => scene.destroy())
  const gate = deferred()
  let failed = true, released = 0
  scene.characterLease = { size: 1, completed: 0, isComplete: false, prepareAll: async () => { await gate.promise; if (failed) throw new Error('offline') }, release: () => { released++ } }
  const ticks = t.mock.method(scene.runtime, 'tick', () => {}), visuals = t.mock.method(scene, 'syncActors', () => {})
  const preparing = scene.prepareActions()
  scene.onTick({ deltaTime: 1 })
  assert.equal(ticks.mock.callCount(), 0)
  assert.equal(visuals.mock.callCount(), 1)
  assert(visuals.mock.calls[0].arguments[0] > 0)
  assert.equal(isOfficeSceneReady(), false)
  assert.throws(() => scene.setDemo(true), /准备/)
  assert.throws(() => scene.beginEditing(), /准备/)
  assert.throws(() => scene.requestDeskVisit(1, 2, 'hello'), /准备/)
  gate.resolve(); await preparing
  assert.match(states.at(-1).error, /offline/)
  assert.equal(scene.areActionsReady, false)
  failed = false; await scene.prepareActions()
  assert.equal(scene.areActionsReady, true)
  assert.equal(isOfficeSceneReady(), true)
  scene.onTick({ deltaTime: 1 }); assert.equal(ticks.mock.callCount(), 1)
  scene.destroy(); assert.equal(released, 1); assert.equal(isOfficeSceneReady(), false)
})

test('destroyed scenes cannot publish late action readiness or bind the gateway', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { OfficeScene } = await server.ssrLoadModule('/example/office-web/src/scene/OfficeScene.ts')
  const { isOfficeSceneReady } = await server.ssrLoadModule('/example/office-web/src/scene/officeSceneBridge.ts')
  const gate = deferred(), started = deferred(), states = []
  const scene = new OfficeScene({ onActionProgress: state => states.push(state) })
  scene.firstFrameReady = true
  scene.characterLease = { size: 1, completed: 0, isComplete: false, prepareAll: async () => { started.resolve(); await gate.promise }, release() {} }
  const pending = scene.prepareActions(); await started.promise
  scene.destroy(); const count = states.length
  gate.resolve(); await pending
  assert.equal(states.length, count)
  assert.equal(isOfficeSceneReady(), false)
})

test('preparing actions before the first office frame cannot expose an uninitialized gateway', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { OfficeScene } = await server.ssrLoadModule('/example/office-web/src/scene/OfficeScene.ts')
  const { isOfficeSceneReady } = await server.ssrLoadModule('/example/office-web/src/scene/officeSceneBridge.ts')
  const scene = new OfficeScene(); t.after(() => scene.destroy())
  await scene.prepareActions()
  assert.equal(isOfficeSceneReady(), false)
})
