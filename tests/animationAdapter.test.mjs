import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'

let server, FrameAdapter, bindOfficeFrames, ApartmentCharacter, AnimationRegistry, AnimationPresenter, AnimationResources, schema
before(async () => {
  server = await createTestServer()
  ;({ FrameAdapter } = await server.ssrLoadModule('/packages/animation-frame/src/FrameAdapter.ts'))
  ;({ bindOfficeFrames } = await server.ssrLoadModule('/example/office-web/src/application/officeFrames.ts'))
  ;({ ApartmentCharacter } = await server.ssrLoadModule('/example/office-web/src/scene/characters/ApartmentCharacter.ts'))
  ;({ AnimationRegistry } = await server.ssrLoadModule('/packages/renderer-pixi/src/animation/AnimationRegistry.ts'))
  ;({ AnimationPresenter } = await server.ssrLoadModule('/packages/renderer-pixi/src/presentation/AnimationPresenter.ts'))
  ;({ AnimationResources } = await server.ssrLoadModule('/packages/renderer-pixi/src/presentation/AnimationResources.ts'))
  ;({ visualAssetManifestSchema: schema } = await server.ssrLoadModule('/packages/contracts/src/animation.ts'))
})
after(() => server?.close())
const signal = () => new AbortController().signal
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('the default frame adapter loads the manifest URI supplied by an external host', async t => {
  const resources = await server.ssrLoadModule('/packages/animation-frame/src/resources.ts')
  const pack = await characterPackFixture('marvis')
  t.after(() => pack.dispose())
  const uri = 'https://assets.example.invalid/custom/manifest.json'
  const acquire = t.mock.method(resources.characterAssets, 'acquire', async () => ({ value: pack, release() {} }))
  const lease = await new FrameAdapter().acquire(bindOfficeFrames(pack.manifest, uri), signal())
  assert.deepEqual(acquire.mock.calls[0].arguments, ['marvis', uri])
  lease.release()
})
function state(manifest, actionId = 'core.idle', poseId = 'standing', view = 'front', clock = { mode: 'time', elapsedMs: 0, loop: true }, speak = false) {
  const variants = manifest.capabilities.variants.filter(v => v.poseId === poseId && v.view === view && (v.actionId === actionId || speak && v.actionId === 'core.speak'))
  assert.equal(variants.length, speak ? 2 : 1)
  return { entityId: 'one', request: { poseId, view, variantIds: variants.map(v => v.variantId) }, contacts: [],
    actions: variants.map(v => ({ instanceId: v.variantId, variantId: v.variantId, clock })) }
}
async function fixture(t, id = 'marvis') {
  const pack = await characterPackFixture(id)
  pack.ensureClips = async () => {}
  const manifest = bindOfficeFrames(pack.manifest, '/test/character.json')
  let releases = 0
  const adapter = new FrameAdapter(async () => ({ value: pack, release() { releases++ } }))
  const lease = await adapter.acquire(manifest, signal())
  t.after(() => { lease.release(); pack.dispose() })
  return { pack, manifest, adapter, lease, releases: () => releases }
}
function sameSprites(actual, expected, height) {
  for (const key of ['sprite', 'mouthSprite']) {
    const a = actual[key], b = expected[key]
    assert.equal(a.visible, b.visible, key)
    if (!b.visible) continue
    assert.equal(a.texture, b.texture, `${key} frame`)
    assert.deepEqual([a.x, a.y, a.scale.x, a.scale.y, a.anchor.x, a.anchor.y, a.rotation], [b.x, b.y, b.scale.x, b.scale.y, b.anchor.x, b.anchor.y, b.rotation])
  }
  assert.equal(actual.scale.x * height, 1)
  assert.equal(actual.getHeadOffsetY(), expected.getHeadOffsetY())
}

test('all six frame adapters preserve existing standing, walking, working, speech and transition samples', async t => {
  for (const id of ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    const { pack, manifest, lease } = await fixture(t, id)
    for (const view of ['front', 'back', 'left', 'right']) for (const walking of [false, true]) {
      const legacy = new ApartmentCharacter(id); legacy.pack = pack
      legacy.setViewFacing(view); legacy.playState(walking ? 'walking' : 'idle')
      const visual = lease.create(state(manifest, walking ? 'core.walk' : 'core.idle', 'standing', view))
      let elapsed = 0
      for (const dt of [0, .1, .18, .5, 1]) {
        elapsed += dt * 1000; legacy.update(dt)
        visual.sample(state(manifest, walking ? 'core.walk' : 'core.idle', 'standing', view, { mode: 'time', elapsedMs: elapsed, loop: true }))
        sameSprites(visual.root, legacy, pack.manifest.displayHeight)
      }
      visual.dispose(); legacy.destroy({ children: true })
    }
    for (const [view, action, work] of [['back', 'core.idle', false], ['back', 'office.type', true], ['left', 'core.idle', false], ['right', 'core.idle', false]]) {
      const legacy = new ApartmentCharacter(id); legacy.pack = pack
      legacy.setAtDesk(true); legacy.setViewFacing(view); legacy.playState(work ? 'working' : 'idle')
      const visual = lease.create(state(manifest, action, 'seated', view))
      legacy.update(.35); visual.sample(state(manifest, action, 'seated', view, { mode: 'time', elapsedMs: 350, loop: true }))
      sameSprites(visual.root, legacy, pack.manifest.displayHeight)
      if (view !== 'back') {
        legacy.setSpeechText('Hello'); legacy.update(.12)
        const speaking = state(manifest, action, 'seated', view, { mode: 'time', elapsedMs: 470, loop: true }, true)
        speaking.actions.find(a => a.variantId.startsWith('core.speak')).clock.elapsedMs = 120
        visual.sample(speaking)
        sameSprites(visual.root, legacy, pack.manifest.displayHeight)
      }
      visual.dispose(); legacy.destroy({ children: true })
    }
    for (const stage of ['rising', 'sitting']) {
      const legacy = new ApartmentCharacter(id); legacy.pack = pack
      const action = stage === 'rising' ? 'core.stand-up' : 'core.sit-down'
      const visual = lease.create(state(manifest, action, 'transition', 'back', { mode: 'progress', progress: 0 }))
      for (const progress of [0, .25, .5, .75, 1]) {
        legacy.setSeatTransition({ stage, progress, seatedAmount: stage === 'rising' ? 1 - progress : progress }); legacy.update(0)
        visual.sample(state(manifest, action, 'transition', 'back', { mode: 'progress', progress }))
        sameSprites(visual.root, legacy, pack.manifest.displayHeight)
      }
      visual.dispose(); legacy.destroy({ children: true })
    }
  }
})

test('instances share textures but keep independent clocks; leases wait for the last instance', async t => {
  const { pack, manifest, lease, releases } = await fixture(t)
  const a = lease.create(state(manifest, 'core.walk')), b = lease.create(state(manifest, 'core.walk'))
  const original = b.root.sprite.texture
  a.sample(state(manifest, 'core.walk', 'standing', 'front', { mode: 'distance', travelledDu: .3, strideDu: .72 }))
  assert.notEqual(a.root.sprite.texture, original)
  assert.equal(b.root.sprite.texture, original)
  lease.release(); lease.release()
  assert.equal(releases(), 0)
  assert.throws(() => lease.create(state(manifest)), /released/)
  a.dispose(); a.dispose()
  assert.equal(releases(), 0)
  b.sample(state(manifest, 'core.walk'))
  assert.equal(original.destroyed, false)
  b.dispose(); assert.equal(releases(), 1)
  assert.throws(() => b.sample(state(manifest)), /disposed/)
  assert([...pack.textures.values()].every(texture => !texture.destroyed))
})

test('frame manifests reject invalid versions, combinations, clocks, resources and contact retargeting', async t => {
  const { manifest, adapter, lease, releases } = await fixture(t)
  const bad = structuredClone(manifest); bad.asset.revision = 'wrong'
  await assert.rejects(adapter.acquire(bad, signal()), /revision mismatch/)
  assert.equal(releases(), 1)
  const gesture = structuredClone(manifest); gesture.capabilities.variants[0].channel = 'gesture'
  await assert.rejects(adapter.acquire(gesture, signal()), /one base/)
  const duplicate = structuredClone(manifest); duplicate.capabilities.variants.push(duplicate.capabilities.variants[0])
  assert.equal(schema.safeParse(duplicate).success, false)
  const cross = structuredClone(manifest); cross.capabilities.combinations.push(['core.idle.standing.front', 'core.idle.standing.back'])
  assert.equal(schema.safeParse(cross).success, false)
  const wrongFormat = structuredClone(manifest); wrongFormat.source.bindings = null
  await assert.rejects(adapter.acquire(wrongFormat, signal()))
  const request = state(manifest)
  const visual = lease.create(request)
  const contacts = structuredClone(request); contacts.contacts.push({ socketId: 'hand.right', position: { x: 0, y: 0 }, toleranceDu: .1 })
  assert.throws(() => visual.sample(contacts), /retargeting/)
  const invalidClock = structuredClone(request); invalidClock.actions[0].clock.elapsedMs = NaN
  assert.throws(() => visual.sample(invalidClock))
  const missing = structuredClone(request); missing.request.variantIds = ['missing']; missing.actions[0].variantId = 'missing'
  assert.throws(() => visual.sample(missing), /Unsupported/)
  visual.dispose()
})

test('pending preparation owns its resources and cancellation does not abort another user', async t => {
  const { pack, manifest, lease, releases } = await fixture(t)
  const gate = deferred(), controller = new AbortController()
  pack.ensureClips = () => gate.promise
  const pending = lease.prepare([state(manifest).request], controller.signal)
  const rejected = assert.rejects(pending, /aborted/)
  controller.abort(); lease.release()
  assert.equal(releases(), 0)
  gate.resolve(); await rejected
  assert.equal(releases(), 1)
  const next = await new FrameAdapter(async () => ({ value: pack, release() {} })).acquire(manifest, signal())
  await next.prepare([state(manifest).request], signal())
  next.release()
})

test('unprepared frames fail explicitly without leaking instances', async t => {
  const { pack, manifest, lease, releases } = await fixture(t)
  const textures = pack.textures; pack.textures = new Map()
  assert.throws(() => lease.create(state(manifest)), /not prepared/)
  pack.textures = textures; lease.release(); assert.equal(releases(), 1)
})

test('presenter preserves walking phase across directions and resets only semantic actions', async t => {
  const { manifest } = await fixture(t)
  const presenter = new AnimationPresenter()
  const actor = { id: 'one', displayHeight: 84, position: { x: 0, y: 0 }, intent: { actionId: 'core.walk', poseId: 'standing', view: 'front' } }
  const start = presenter.sample(actor, manifest, .1)
  actor.position.y = 42; actor.intent.view = 'left'
  const turn = presenter.sample(actor, manifest, .1)
  assert.equal(turn.actions[0].instanceId, start.actions[0].instanceId)
  assert.equal(turn.actions[0].clock.travelledDu, .5)
  actor.intent.actionId = 'core.idle'
  const stop = presenter.sample(actor, manifest, 0)
  assert.notEqual(stop.actions[0].instanceId, turn.actions[0].instanceId)
  assert.equal(stop.actions[0].clock.elapsedMs, 0)
})

test('neutral resource host selects a registered alternate adapter, deduplicates appearances and releases late loads', async t => {
  const { manifest } = await fixture(t)
  const custom = { ...manifest, adapterId: 'test.other', source: { format: 'test-only', uri: '/fixture' } }
  const registry = new AnimationRegistry(), releases = [], prepared = []
  let acquired = 0
  registry.register({ id: 'test.other', apiVersion: 1, rendererApiVersion: 'pixi-1', async acquire(manifest) {
    acquired++
    return { manifest, async prepare(requests) { prepared.push(requests) }, release() { releases.push(manifest.asset.id) } }
  } })
  const actor = { appearanceId: 'same', intent: { actionId: 'core.idle', poseId: 'standing', view: 'front' } }
  const resources = await AnimationResources.load([actor, actor], registry, async () => custom, signal(), () => {})
  assert.equal(acquired, 1); assert.equal(resources.size, 1)
  await resources.prepareAll(signal(), () => {})
  assert.equal(resources.isComplete, true); assert.equal(prepared.length, 2)
  resources.release(); resources.release(); assert.equal(releases.length, 1)
  const gate = deferred()
  const pending = AnimationResources.load([actor, { ...actor, appearanceId: 'broken' }], registry, async id => {
    if (id === 'broken') throw new Error('missing metadata')
    await gate.promise; return custom
  }, signal(), () => {})
  const rejection = assert.rejects(pending, /missing metadata/)
  gate.resolve(); await rejection; assert.equal(releases.length, 2)
  assert.throws(() => registry.register({ id: 'test.other', apiVersion: 1, rendererApiVersion: 'pixi-1' }), /Duplicate/)
  assert.throws(() => registry.acquire({ ...custom, adapterId: 'unregistered' }, signal()), /Incompatible/)
})

test('hot replacement preserves shared lease ownership when a newer preview closes', async () => {
  const { ResourceLeaseCache } = await server.ssrLoadModule('/packages/animation-frame/src/resources/ResourceLeaseCache.ts')
  const hotData = {}, disposed = [], loaded = []
  const load = generation => async id => { loaded.push(`${generation}:${id}`); return { dispose() { disposed.push(id) } } }
  const initial = ResourceLeaseCache.retained(load('old'), hotData)
  const scene = await initial.acquire('person')
  const updated = ResourceLeaseCache.retained(load('new'), hotData)
  assert.equal(initial, updated)
  const preview = await updated.acquire('person')
  assert.equal(scene.value, preview.value)
  preview.release(); updated.clearUnused(); await Promise.resolve()
  assert.deepEqual(disposed, [])
  assert.deepEqual(loaded, ['old:person'])
  const other = await updated.acquire('new-person')
  assert.deepEqual(loaded, ['old:person', 'new:new-person'])
  other.release(); scene.release(); updated.clearUnused(); await Promise.resolve()
  assert.deepEqual(disposed.sort(), ['new-person', 'person'])
})
