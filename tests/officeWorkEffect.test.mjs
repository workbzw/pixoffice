import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { Container, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'
import { buildOfficeCraftingAtlas, OFFICE_WORK_EFFECT_SOURCE } from '../scripts/build-office-assets.mjs'

let server, effect, createReferenceOfficePresentation
before(async () => {
  server = await createTestServer()
  effect = await server.ssrLoadModule('/packages/scene-office/src/pixi/effects/OfficeWorkEffect.ts')
  ;({ createReferenceOfficePresentation } = await server.ssrLoadModule('/packages/scene-office/src/pixi/index.ts'))
})
after(() => server?.close())

function fixture() {
  const world = { actors: [{ id: 'worker', position: { x: 13, y: 7 }, homeId: 'desk', posture: 'seated' }],
    props: [{ id: 'desk', templateId: 'office.reference-workstation', position: { x: 12, y: 5 } }] }
  const actor = { id: 'worker', depth: 365, status: 'working', intent: { view: 'back' }, furniture: { seated: true, transitioning: false },
    task: { id: 'task', title: 'Development', status: 'running' } }
  return { world, actor, runtime: { isEditing: false } }
}

function atlas() { return new Texture({ source: new TextureSource({ width: 480, height: 320 }) }) }

test('the renderer can supply current actor projections without a second effect projection', () => {
  const { world, actor, runtime } = fixture(), texture = atlas()
  const view = effect.createOfficeWorkEffects(texture, runtime, ['worker'], () => { throw new Error('Redundant projection') }, () => false)
  try {
    for (let frame = 0; frame < 60; frame++) view.update(.05, world, [actor])
    assert.equal(view.roots[0].visible, true)
    const idle = { ...actor, status: 'idle', task: { ...actor.task, status: 'idle' } }
    for (let frame = 0; frame < 60; frame++) view.update(.05, world, [idle])
    assert.equal(view.roots[0].visible, false, 'the supplied state can stop the effect immediately')
  } finally { view.dispose(); view.roots.forEach(root => root.destroy({ children: true })); texture.destroy(true) }
})

test('work clouds are opt-in and require a running task at the actor own workstation', () => {
  const { world, actor } = fixture()
  assert.equal(createReferenceOfficePresentation().createAmbientViews, undefined)
  assert.equal(typeof createReferenceOfficePresentation({ workEffects: true }).createAmbientViews, 'function')
  assert.equal(effect.officeWorkEffectActive(actor, world), true)
  assert.deepEqual(effect.officeWorkEffectSeat(actor, world), { x: 700, y: 365 })
  for (const status of ['queued', 'blocked', 'completed', 'failed', 'idle']) {
    assert.equal(effect.officeWorkEffectActive({ ...actor, task: { ...actor.task, status } }, world), false)
  }
  for (const change of [{ motion: {} }, { step: {} }, { seatTransition: {} }, { speech: {} }, { expression: 'wave' }, { position: { x: 14, y: 7 } }]) {
    assert.equal(effect.officeWorkEffectActive(actor, { ...world, actors: [{ ...world.actors[0], ...change }] }), false)
  }
  assert.equal(effect.officeWorkEffectActive({ ...actor, status: 'talking' }, world), false)
  assert.equal(effect.officeWorkEffectActive({ ...actor, intent: { view: 'front' } }, world), false)
})

test('work clock fades on interruption and celebrates matching completion only once', () => {
  const clock = new effect.OfficeWorkEffectClock()
  for (let i = 0; i < 30; i++) clock.update(.05, true, 'task', false)
  assert.equal(clock.opacity, 1)
  clock.update(0, false, 'task', true)
  assert.equal(clock.completion, 1)
  for (let i = 0; i < 40; i++) clock.update(.05, false, 'task', true)
  assert.equal(clock.opacity, 0)
  assert.equal(clock.completion, 0)
  clock.update(.05, true, 'next', false)
  clock.update(.05, false, 'other', true)
  assert.equal(clock.completion, 0)
  clock.update(.05, false, 'next', false)
  clock.update(.05, false, 'next', true)
  assert.equal(clock.completion, 0, 'a paused/cancelled job must not later emit a success cue')
})

test('work clock pauses with the renderer and bounds large frame deltas', () => {
  const clock = new effect.OfficeWorkEffectClock()
  clock.update(0, true, 'task', false)
  assert.equal(clock.time, 0)
  clock.update(10000, true, 'task', false)
  assert.equal(clock.time, .05)
  clock.update(-1, true, 'task', false)
  assert.equal(clock.time, .05)
})

test('zero-time runtime notifications cannot swallow a business completion cue', () => {
  const clock = new effect.OfficeWorkEffectClock()
  clock.update(.05, true, 'task', false)
  clock.update(0, false, 'task', false)
  clock.update(0, false, 'task', true)
  assert.equal(clock.completion, 1)
})

test('work effect swaps six small atlas frames without procedural tool motion or world mutations', () => {
  const { world, actor, runtime } = fixture(), before = structuredClone(world)
  const texture = atlas(), view = effect.createOfficeWorkEffects(texture, runtime, ['worker'], () => [actor], () => false)
  const root = view.roots[0], frames = new Set()
  try {
    assert.equal(root.children.length, 1)
    const sprite = root.children[0]
    assert.equal(sprite.width, 160, 'the cloud must extend beyond the worker without adding outer puffs')
    assert.equal(sprite.height, 160)
    assert(!sprite.filters?.length, 'the outline is removed in the atlas, not with a runtime filter')
    for (let i = 0; i < 6000; i++) {
      view.update(.016, world)
      frames.add(sprite.texture)
      assert.equal(sprite.rotation, 0)
      assert.equal(sprite.x, 0)
      assert.equal(sprite.y, 0)
    }
    assert.deepEqual(world, before)
    assert.equal(frames.size, 6)
    assert([...frames].every(frame => frame.source === texture.source && frame.frame.width === 160 && frame.frame.height === 160))
    assert.equal(root.eventMode, 'none')
    assert.equal(root.visible, true)
    assert.equal(root.x, 700)
    assert.equal(root.y, 333)
    assert.equal(root.zIndex, actor.depth - .5, 'the worker must cover overlapping smoke and tools')
    runtime.isEditing = true
    view.update(.05, world)
    assert.equal(root.visible, false)
    runtime.isEditing = false
    world.actors[0].motion = {}
    view.update(.05, world)
    assert.equal(root.visible, false, 'an occupied desk must not emit tools after its worker leaves')
    view.dispose(); view.dispose()
    assert([...frames].every(frame => frame.destroyed))
    assert.equal(texture.source.destroyed, false, 'frame disposal must not destroy the shared atlas')
  } finally { view.dispose(); root.destroy({ children: true }); texture.destroy(true) }
})

test('work clouds reach full opacity and only fade during entry, interruption and completion', () => {
  const { world, actor, runtime } = fixture(), texture = atlas()
  const view = effect.createOfficeWorkEffects(texture, runtime, ['worker'], () => [actor], () => false)
  const root = view.roots[0], sprite = root.children[0]
  try {
    for (let i = 0; i < 30; i++) {
      view.update(.05, world)
      assert(sprite.alpha > 0 && sprite.alpha <= 1)
    }
    assert.equal(sprite.alpha, 1, 'steady work must not apply an extra transparency multiplier')
    actor.task.status = 'completed'
    view.update(0, world)
    assert.equal(sprite.alpha, 1, 'completion starts at the same full opacity as steady work')
    for (let i = 0; i < 30; i++) {
      view.update(.05, world)
      assert(sprite.alpha >= 0 && sprite.alpha <= 1)
    }
    assert.equal(root.visible, false)
  } finally { view.dispose(); root.destroy({ children: true }); texture.destroy(true) }
})

test('work effect sorts above the desk but behind the seated worker and chair', () => {
  const { world, actor, runtime } = fixture(), texture = atlas()
  const view = effect.createOfficeWorkEffects(texture, runtime, ['worker'], () => [actor], () => false)
  const root = view.roots[0], layer = new Container()
  const desk = new Container(), person = new Container(), chair = new Container()
  desk.zIndex = actor.depth - 1; person.zIndex = actor.depth; chair.zIndex = actor.depth + 2
  layer.sortableChildren = true
  layer.addChild(chair, person, root, desk)
  try {
    view.update(.05, world); layer.sortChildren()
    assert.deepEqual(layer.children, [desk, root, person, chair])
    actor.task.status = 'completed'
    view.update(.05, world); layer.sortChildren()
    assert.deepEqual(layer.children, [desk, root, person, chair], 'completion puffs must not jump in front either')
  } finally { view.dispose(); layer.destroy({ children: true }); texture.destroy(true) }
})

test('six workers share six textures and one projection pass while keeping independent work states', () => {
  const source = fixture(), texture = atlas(), ids = Array.from({ length: 6 }, (_, i) => `worker-${i}`)
  const world = {
    actors: ids.map((id, i) => ({ ...source.world.actors[0], id, homeId: `desk-${i}`, position: { x: 13 + i * 4, y: 7 } })),
    props: ids.map((_id, i) => ({ ...source.world.props[0], id: `desk-${i}`, position: { x: 12 + i * 4, y: 5 } })),
  }
  const actors = ids.map(id => ({ ...structuredClone(source.actor), id }))
  let projections = 0
  const view = effect.createOfficeWorkEffects(texture, source.runtime, ids, () => { projections++; return actors }, () => false)
  const sprites = view.roots.map(root => root.children[0])
  try {
    assert.equal(view.roots.length, 6)
    for (let i = 0; i < 30; i++) view.update(.05, world)
    assert.equal(projections, 30, 'all workers must share one actor projection per update')
    assert(view.roots.every(root => root.visible && root.zIndex < source.actor.depth))
    const frames = new Set(sprites.map(sprite => sprite.texture))
    assert.equal(frames.size, 6, 'simultaneous work must be staggered rather than move in lockstep')
    for (let i = 0; i < 120; i++) {
      view.update(.05, world)
      sprites.forEach(sprite => frames.add(sprite.texture))
    }
    assert.equal(frames.size, 6, 'workers reuse the same frame objects, not just the same bitmap source')
    assert([...frames].every(frame => frame.source === texture.source))

    actors[0].task.status = 'completed'
    actors[1].status = 'idle'; actors[1].task.status = 'idle'
    world.actors[2].speech = { text: 'Hello' }
    world.actors[3].motion = {}
    actors[4].task.status = 'blocked'
    view.update(.05, world)
    assert.equal(view.roots[0].visible, true, 'completion keeps its short contracting tail')
    assert.equal(view.roots[2].visible, false, 'talking hides only that worker effect')
    assert.equal(view.roots[3].visible, false, 'walking hides only that worker effect')
    for (let i = 0; i < 30; i++) view.update(.05, world)
    assert.deepEqual(view.roots.map(root => root.visible), [false, false, false, false, false, true])
    source.runtime.isEditing = true
    const before = projections
    view.update(.05, world)
    assert.equal(projections, before)
    assert(view.roots.every(root => !root.visible))
    view.dispose(); view.dispose()
    assert([...frames].every(frame => frame.destroyed))
    assert.equal(texture.source.destroyed, false)
  } finally { view.dispose(); view.roots.forEach(root => root.destroy({ children: true })); texture.destroy(true) }
})

test('reduced motion keeps the working decoration still after fade-in', () => {
  const { world, actor, runtime } = fixture()
  const texture = atlas(), view = effect.createOfficeWorkEffects(texture, runtime, ['worker'], () => [actor], () => true)
  const root = view.roots[0]
  const transforms = () => root.children.map(child => [child.x, child.y, child.scale.x, child.rotation, child.alpha, child.texture.frame.x, child.texture.frame.y])
  try {
    for (let i = 0; i < 30; i++) view.update(.05, world)
    const first = transforms()
    for (let i = 0; i < 60; i++) view.update(.05, world)
    assert.deepEqual(transforms(), first)
  } finally { view.dispose(); root.destroy({ children: true }); texture.destroy(true) }
})

test('the current cloud authoring sheet retains twelve transparent frames without edge clipping', async () => {
  const image = await readFile(OFFICE_WORK_EFFECT_SOURCE)
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 1448); assert.equal(info.height, 1086)
  const hashes = new Set()
  for (let frame = 0; frame < 12; frame++) {
    const bytes = await sharp(image).extract({ left: frame % 4 * 362, top: Math.floor(frame / 4) * 362, width: 362, height: 362 }).png().toBuffer()
    hashes.add(createHash('sha256').update(bytes).digest('hex'))
    let opaque = 0, transparent = 0
    for (let y = 0; y < 362; y++) for (let x = 0; x < 362; x++) {
      const alpha = data[((Math.floor(frame / 4) * 362 + y) * info.width + frame % 4 * 362 + x) * 4 + 3]
      if (alpha >= 128) opaque++
      if (!alpha) transparent++
      if (x < 2 || y < 2 || x >= 360 || y >= 360) assert(alpha < 128, `Frame ${frame + 1} clips its opaque artwork`)
    }
    assert(opaque > 1000 && transparent > 1000)
  }
  assert.equal(hashes.size, 12)
})

test('the runtime atlas uses six downscaled keyframes at less than one tenth of the source pixel area', async () => {
  const source = await readFile(OFFICE_WORK_EFFECT_SOURCE)
  const first = await buildOfficeCraftingAtlas(source), second = await buildOfficeCraftingAtlas(source)
  assert.deepEqual(first, second)
  const metadata = await sharp(first).metadata()
  assert.equal(metadata.width, 480); assert.equal(metadata.height, 320)
  assert.equal(metadata.hasAlpha, true)
  assert(metadata.width * metadata.height < 1448 * 1086 / 10)
  assert.equal(effect.OFFICE_WORK_EFFECT.frameDurationsMs.length, 6)
  const cycle = effect.OFFICE_WORK_EFFECT.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)
  assert(6 / (cycle / 1000) < 6)
  const indices = [0, 2, 4, 6, 8, 11]
  for (const [i, index] of indices.entries()) {
    const expected = await sharp(source).extract({ left: index % 4 * 362, top: Math.floor(index / 4) * 362, width: 362, height: 362 }).resize(160, 160).raw().toBuffer()
    const actual = await sharp(first).extract({ left: i % 3 * 160, top: Math.floor(i / 3) * 160, width: 160, height: 160 }).raw().toBuffer()
    assert(actual.every((value, channel) => Math.abs(value - expected[channel]) <= 1), 'PNG alpha compositing may round an 8-bit channel by one')
  }
})

test('every published frame contains restrained white clouds without dark outlines or outward plumes', async () => {
  const source = await readFile(OFFICE_WORK_EFFECT_SOURCE)
  const atlas = await buildOfficeCraftingAtlas(source)
  const published = await readFile(new URL('../public/assets/office/effects/work-crafting-lite-v1.png', import.meta.url))
  assert.deepEqual(published, atlas, 'the live asset must use the compact white-cloud source')
  const hashes = new Set()
  const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let frame = 0; frame < 6; frame++) {
    const channels = [0, 0, 0]
    const brightness = [], pixels = []
    let samples = 0, transparent = 0
    let left = 160, right = 0, top = 160, bottom = 0
    for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
      const i = ((Math.floor(frame / 3) * 160 + y) * info.width + frame % 3 * 160 + x) * 4
      pixels.push(...data.subarray(i, i + 4))
      if (!data[i + 3]) transparent++
      if (x === 0 || y === 0 || x === 159 || y === 159) assert(data[i + 3] < 128, `frame ${frame + 1}: clouds must not bleed into adjacent frames`)
      if (y < 40 || y >= 150) assert(data[i + 3] < 128, `frame ${frame + 1}: retain compact puffs and a transparent footer`)
      if (data[i + 3] < 64) continue
      assert(Math.min(data[i], data[i + 1], data[i + 2]) >= 170, `frame ${frame + 1}: no dark outline may remain`)
      assert(Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) <= 20,
        `frame ${frame + 1}: no colored tool or sparkle may remain`)
      if (data[i + 3] < 200) continue
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      samples++
      brightness.push(Math.min(data[i], data[i + 1], data[i + 2]))
      channels.forEach((_value, channel) => { channels[channel] += data[i + channel] })
    }
    hashes.add(createHash('sha256').update(Uint8Array.from(pixels)).digest('hex'))
    assert(samples >= 1000 && transparent >= 1000, `frame ${frame + 1}: retain visible puffs and transparent space`)
    const averages = channels.map(value => value / samples)
    brightness.sort((a, b) => a - b)
    assert(brightness[Math.floor(brightness.length / 2)] > 225, `frame ${frame + 1}: clouds must remain bright white`)
    assert(right - left < 115 && bottom - top < 70, `frame ${frame + 1}: contain the cloud in a compact central envelope`)
    const visibleWidth = (right - left + 1) * effect.OFFICE_WORK_EFFECT.displayPixels / effect.OFFICE_WORK_EFFECT.cellPixels
    assert(visibleWidth >= 95, `frame ${frame + 1}: the compact cloud must remain wider than the seated worker`)
    assert(Math.max(...averages) - Math.min(...averages) < 5, `frame ${frame + 1}: smoke must be neutral white/gray`)
  }
  assert.equal(hashes.size, 6, 'the effect must still animate through six distinct frames')
})

test('the frame clock respects authored holds and loops to the compact first puff', () => {
  const durations = effect.OFFICE_WORK_EFFECT.frameDurationsMs
  let elapsed = 0
  durations.forEach((duration, i) => {
    assert.equal(effect.officeWorkEffectFrame((elapsed + duration / 2) / 1000), i)
    elapsed += duration
  })
  assert.equal(effect.officeWorkEffectFrame(elapsed / 1000), 0)
})

test('all six office appearances support energetic work without changing normal work bindings', async t => {
  t.mock.method(globalThis, 'fetch', async uri => new Response(await readFile(new URL(`../public${String(uri)}`, import.meta.url))))
  const { resolveOfficeAppearance } = await server.ssrLoadModule('/example/office-web/src/application/officeFrames.ts')
  for (const id of ['office-lead', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    const normal = await resolveOfficeAppearance(id)
    const crafting = await resolveOfficeAppearance(id, { energeticWork: true })
    const variant = 'office.type.seated.back'
    assert.equal(normal.source.bindings[variant].clip, 'work.quiet-back')
    assert.equal(crafting.source.bindings[variant].clip, 'work.typing-back')
    assert.deepEqual(crafting.capabilities, normal.capabilities)
    assert.equal((await resolveOfficeAppearance(id)).source.bindings[variant].clip, 'work.quiet-back')
  }
})

test('connected offices enable all workstation effects without requiring the local demo source', async t => {
  t.mock.method(globalThis, 'fetch', async uri => new Response(await readFile(new URL(`../public${String(uri)}`, import.meta.url))))
  const { createOfficeRuntime } = await server.ssrLoadModule('/example/office-web/src/application/createOfficeRuntime.ts')
  const { OfficeScene } = await server.ssrLoadModule('/example/office-web/src/application/OfficeScene.ts')
  const { OfficeSimulation } = await server.ssrLoadModule('/example/office-web/src/application/OfficeSimulation.ts')
  const runtime = createOfficeRuntime({ referenceLayout: true }), simulation = new OfficeSimulation(runtime)
  const scene = new OfficeScene({ runtime, simulation })
  t.after(() => { scene.destroy(); runtime.dispose() })
  assert.equal(simulation.canDemo, false)
  assert.equal(typeof scene.pack.createAmbientViews, 'function')
  assert.equal(scene.pack.resourceCount, 9, 'all workers add only one shared image resource')
  for (const actor of runtime.readActors()) {
    const manifest = await scene.options.resolveAppearance(actor.templateId)
    assert.equal(manifest.source.bindings['office.type.seated.back'].clip, 'work.typing-back')
  }
})
