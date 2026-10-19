import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { Container, Texture, TextureSource } from 'pixi.js'
import { createTestServer } from './helpers/vite.mjs'
import { buildOfficeCraftingAtlas } from '../scripts/build-office-assets.mjs'

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

test('the combined work effect stays translucent during work and completion', () => {
  const { world, actor, runtime } = fixture(), texture = atlas()
  const view = effect.createOfficeWorkEffects(texture, runtime, ['worker'], () => [actor], () => false)
  const root = view.roots[0], sprite = root.children[0]
  try {
    for (let i = 0; i < 30; i++) {
      view.update(.05, world)
      assert(sprite.alpha > 0 && sprite.alpha <= .8)
    }
    assert.equal(sprite.alpha, .8)
    actor.task.status = 'completed'
    view.update(0, world)
    assert.equal(sprite.alpha, .8, 'the completion tail must not flash back to opaque')
    for (let i = 0; i < 30; i++) {
      view.update(.05, world)
      assert(sprite.alpha >= 0 && sprite.alpha <= .8)
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

for (const file of ['spritesheet.png', 'spritesheet-small-tools.png', 'spritesheet-small-tools-white-smoke.png']) test(`${file}: authoring sheet retains twelve transparent frames without edge clipping`, async () => {
  const image = await readFile(new URL(`../art/office/work-crafting-v1/${file}`, import.meta.url))
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
  const source = await readFile(new URL('../art/office/work-crafting-v1/spritesheet-small-tools-white-smoke.png', import.meta.url))
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

test('the smaller notebook keeps its half-size footprint through the smoke recoloring', async () => {
  const notebookBounds = async (file, frame, denoise = false) => {
    const { data, info } = await sharp(new URL(`../art/office/work-crafting-v1/${file}`, import.meta.url).pathname)
      .extract({ left: frame % 4 * 362, top: Math.floor(frame / 4) * 362, width: 362, height: 362 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let left = info.width, right = -1, top = info.height, bottom = -1
    const teal = i => data[i + 3] >= 192 && data[i] < 100 && data[i + 1] > data[i] * 1.3 && data[i + 2] > data[i] * 1.1 && data[i + 1] > data[i + 2]
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      if (teal(i)) {
        // Ignore isolated color noise when comparing the recolored outline.
        if (denoise) {
          let neighbors = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && x + dx >= 0 && x + dx < info.width && y + dy >= 0 && y + dy < info.height
              && teal(i + (dy * info.width + dx) * 4)) neighbors++
          }
          if (neighbors < 2) continue
        }
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
    }
    assert(right >= left && bottom >= top)
    return { width: right - left + 1, height: bottom - top + 1 }
  }
  for (const frame of [0, 2, 11]) {
    const original = await notebookBounds('spritesheet.png', frame)
    const smaller = await notebookBounds('spritesheet-small-tools.png', frame)
    const beforeColor = await notebookBounds('spritesheet-small-tools.png', frame, true)
    const afterColor = await notebookBounds('spritesheet-small-tools-white-smoke.png', frame, true)
    for (const axis of ['width', 'height']) {
      assert(smaller[axis] / original[axis] >= .4 && smaller[axis] / original[axis] <= .6,
        `frame ${frame + 1}: ${axis} must remain close to half size, regardless of flight placement`)
      assert(Math.abs(afterColor[axis] - beforeColor[axis]) * effect.OFFICE_WORK_EFFECT.cellPixels / 362 <= 4,
        `frame ${frame + 1}: the painted tool outline must stay within four runtime pixels of its prior footprint`)
    }
  }
})

test('every active smoke frame uses neutral white shading instead of yellow', async () => {
  const { data, info } = await sharp(new URL('../art/office/work-crafting-v1/spritesheet-small-tools-white-smoke.png', import.meta.url).pathname)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let frame = 0; frame < 12; frame++) {
    const channels = [0, 0, 0]
    let samples = 0
    // The middle of the lower puff is smoke only, clear of tools and sparkles.
    for (let y = 260; y < 300; y++) for (let x = 130; x < 220; x++) {
      const i = ((Math.floor(frame / 4) * 362 + y) * info.width + frame % 4 * 362 + x) * 4
      if (data[i + 3] < 200) continue
      samples++
      channels.forEach((_value, channel) => { channels[channel] += data[i + channel] })
    }
    assert(samples >= 3000, `frame ${frame + 1}: smoke must retain its original coverage`)
    const averages = channels.map(value => value / samples)
    assert(Math.min(...averages) > 200, `frame ${frame + 1}: smoke must remain light`)
    assert(Math.max(...averages) - Math.min(...averages) < 5, `frame ${frame + 1}: smoke must be neutral white/gray`)
  }
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
