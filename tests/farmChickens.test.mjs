import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { Texture, TextureSource } from 'pixi.js'
import { createFarmFlock, createFarmWorld, farmObjects } from '@pixoffice/scene-farm'
import { GridNavigation } from '@pixoffice/runtime/navigation'
import { createFarmChickenView } from '../packages/scene-farm/dist/pixi/chickenView.js'

const templates = { template: id => farmObjects.templates.find(item => item.id === id) }
function random(seed = 17) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 } }

test('the farm has two independent decorative chickens without changing workers or props', () => {
  const world = createFarmWorld(), original = structuredClone(world), flock = createFarmFlock(world, templates, random())
  assert.deepEqual(world, original)
  const birds = flock.read()
  assert.equal(birds.length, 2); assert.equal(new Set(birds.map(bird => bird.id)).size, 2)
  assert(birds.every(bird => bird.visible))
  assert(birds.every(bird => bird.mode === 'peck'))
  birds[0].position.x = -100
  assert.notEqual(flock.read()[0].position.x, -100)
})

test('chickens roam orthogonally, stop to peck, and avoid plots, facilities and each other', () => {
  const world = createFarmWorld(), navigation = new GridNavigation(templates), flock = createFarmFlock(world, templates, random())
  const modes = new Set(), positions = new Set()
  for (let tick = 0; tick < 2400; tick++) {
    const before = flock.read(); flock.tick(50, world)
    const birds = flock.read()
    for (const [i, bird] of birds.entries()) {
      const dx = Math.abs(before[i].position.x - bird.position.x), dy = Math.abs(before[i].position.y - bird.position.y)
      assert(dx < 1e-8 || dy < 1e-8, `${bird.id} moved diagonally`)
      assert(dx + dy <= 50 / 760 + 1e-8, `${bird.id} jumped between cells`)
      for (const x of new Set([Math.floor(bird.position.x), Math.ceil(bird.position.x)])) for (const y of new Set([Math.floor(bird.position.y), Math.ceil(bird.position.y)])) assert(navigation.walkable(world, { x, y }))
      modes.add(`${bird.id}:${bird.mode}`)
      positions.add(`${bird.id}:${Math.round(bird.position.x)},${Math.round(bird.position.y)}`)
    }
    assert(Math.abs(birds[0].position.x - birds[1].position.x) + Math.abs(birds[0].position.y - birds[1].position.y) > .5)
  }
  for (const bird of flock.read()) for (const mode of ['walk', 'peck']) assert(modes.has(`${bird.id}:${mode}`))
  assert(positions.size > 12)
})

test('a paused flock does not advance movement or pecking frames', () => {
  const world = createFarmWorld(), flock = createFarmFlock(world, templates, random())
  for (let i = 0; i < 100; i++) flock.tick(50, world)
  const before = flock.read()
  for (const dt of [0, -1, NaN, Infinity]) flock.tick(dt, world)
  assert.deepEqual(flock.read(), before)
})

test('chickens keep their entire route inside the lawn, clear of the foreground fence', () => {
  for (const seed of [1, 7, 17, 42, 100]) {
    const world = createFarmWorld(), original = structuredClone(world), flock = createFarmFlock(world, templates, random(seed))
    for (let tick = 0; tick < 6000; tick++) {
      flock.tick(250, world)
      for (const bird of flock.read()) {
        assert(bird.visible)
        assert(bird.position.x >= 2 && bird.position.x <= 21)
        assert(bird.position.y >= 4 && bird.position.y <= 14, `${bird.id} entered the foreground fence row`)
      }
    }
    assert.deepEqual(world, original, 'chicken boundaries must not alter the farmers\' navigation area')
  }
})

test('chickens never use the fence row as a relocation fallback', () => {
  const world = createFarmWorld(), flock = createFarmFlock(world, templates, random())
  world.blockedAreas = [{ id: 'inner-lawn-blocked', bounds: { left: 2, top: 4, right: 22, bottom: 15 } }]
  assert(new GridNavigation(templates).walkable(world, { x: 8, y: 15 }), 'the outer row remains available to the shared scene')
  flock.tick(50, world)
  assert(flock.read().every(bird => !bird.visible), 'no safe lawn means hiding, not placing chickens outside the fence')
  world.blockedAreas = []
  world.bounds = { ...world.bounds, bottom: 14 }
  flock.tick(50, world)
  assert(flock.read().every(bird => bird.visible && bird.position.y < 14), 'the yard also respects tighter scene bounds')
})

test('chickens feed continuously for long stretches and only take short strolls between spots', () => {
  const world = createFarmWorld(), flock = createFarmFlock(world, templates, random())
  const metrics = flock.read().map(() => ({ walking: 0, feeding: 0, distance: 0, stoppedAt: 0, strolls: 0 }))
  const ticks = 2400, dt = 50
  for (let tick = 0; tick < ticks; tick++) {
    const before = flock.read(); flock.tick(dt, world)
    for (const [i, bird] of flock.read().entries()) {
      const metric = metrics[i]
      assert(['walk', 'peck'].includes(bird.mode), 'chickens must not stand idle between feeding spots')
      metric.distance += Math.abs(before[i].position.x - bird.position.x) + Math.abs(before[i].position.y - bird.position.y)
      if (bird.mode === 'walk') metric.walking++
      if (bird.mode === 'peck') metric.feeding++
      if (before[i].mode !== 'walk' && bird.mode === 'walk') {
        assert((tick + 1) * dt - metric.stoppedAt >= 16000)
        metric.strolls++
      }
      if (before[i].mode === 'walk' && bird.mode !== 'walk') {
        assert(metric.distance <= 3 + 1e-8)
        metric.distance = 0; metric.stoppedAt = (tick + 1) * dt
      }
      if (before[i].mode === 'peck' && bird.mode !== 'peck') assert.equal(bird.mode, 'walk')
    }
  }
  for (const metric of metrics) { assert(metric.strolls >= 3); assert(metric.walking / ticks < .2); assert(metric.feeding / ticks > .8) }
})

test('layout changes relocate chickens to free ground and completely blocked maps hide them safely', () => {
  const world = createFarmWorld(), flock = createFarmFlock(world, templates, random()), navigation = new GridNavigation(templates)
  const position = flock.read()[0].position
  world.blockedAreas = [{ id: 'new-obstacle', bounds: { left: position.x, top: position.y, right: position.x + 1, bottom: position.y + 1 } }]
  flock.tick(50, world)
  assert(flock.read().every(bird => navigation.walkable(world, bird.position)))
  world.blockedAreas = [{ id: 'no-floor', bounds: world.bounds }]
  flock.tick(50, world)
  assert(flock.read().every(bird => !bird.visible))
})

test('chicken atlas has six complete clips, transparent gutters and one fixed foot baseline', async () => {
  const root = new URL('../public/farm-assets/', import.meta.url), manifest = JSON.parse(await readFile(new URL('chickens.json', root), 'utf8'))
  const { data, info } = await sharp(await readFile(new URL('chickens.webp', root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(Object.keys(manifest.clips).length, 6); assert.equal(manifest.registration.length, 24)
  assert.deepEqual(manifest.pivot, { x: 96, y: 146 })
  for (const frames of Object.values(manifest.clips)) {
    assert.equal(frames.length, 4)
    for (const frame of frames) {
      assert.equal(frame.width, 192); assert.equal(frame.height, 160)
      let bottom = -1, pixels = 0
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const alpha = data[((frame.y + y) * info.width + frame.x + x) * 4 + 3]
        if (alpha >= 128) { bottom = Math.max(bottom, y); pixels++ }
        if (!x || !y || x === frame.width - 1 || y === frame.height - 1) assert(alpha < 32)
      }
      assert(pixels > 2000); assert(Math.abs(bottom + 1 - manifest.pivot.y) <= 1)
    }
  }
})

test('the farm logo is a standalone transparent chicken image', async () => {
  const { data, info } = await sharp(await readFile(new URL('../public/farm-assets/chicken-logo.webp', import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 128); assert.equal(info.height, 128)
  let visible = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3]
    if (alpha >= 128) visible++
    if (x < 8 || y < 8 || x >= 120 || y >= 120) assert.equal(alpha, 0)
  }
  assert(visible > 3000)
})

test('corrected side walk and rear peck use the reviewed replacement images', async () => {
  const root = new URL('../public/farm-assets/', import.meta.url), manifest = JSON.parse(await readFile(new URL('chickens.json', root), 'utf8'))
  for (const frame of manifest.registration) assert.equal(frame.source, ['walk.left', 'peck.back'].includes(frame.id) ? 'chickens-motion-v2.png' : 'chickens.png')
  const { data, info } = await sharp(await readFile(new URL('chickens.webp', root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const feet = frame => {
    const mask = []
    for (let y = 122; y < 147; y++) for (let x = 0; x < frame.width; x++) {
      const i = ((frame.y + y) * info.width + frame.x + x) * 4
      mask.push(data[i + 3] >= 128 && data[i] > 100 && data[i + 1] > 50 && data[i + 2] < 100)
    }
    return mask
  }
  const left = manifest.clips['walk.left'], first = feet(left[0]), opposite = feet(left[2])
  assert(first.filter((pixel, i) => pixel !== opposite[i]).length > 50, 'opposite steps must not reuse one leg pose')
})

test('chicken view obeys the host pause and releases only its own atlas frames', async t => {
  const manifest = JSON.parse(await readFile(new URL('../public/farm-assets/chickens.json', import.meta.url), 'utf8'))
  const source = new TextureSource({ width: 768, height: 960 }), atlas = new Texture({ source })
  const world = createFarmWorld(), runtime = { ...templates, readWorld: () => world }
  let now = 0
  const view = createFarmChickenView(atlas, manifest, runtime, () => now, 50)
  t.after(() => { view.roots.forEach(root => root.destroy({ children: true })); atlas.destroy(true) })
  view.update(0, world)
  assert.equal(view.roots.length, 2)
  const state = () => view.roots.map(root => ({ x: root.x, y: root.y, texture: root.children[1].texture }))
  const paused = state()
  for (let i = 0; i < 100; i++) view.update(.05, world)
  assert.deepEqual(state(), paused)
  const feedingFrames = view.roots.map(() => new Set())
  for (let i = 0; i < 200; i++) {
    now += 50; view.update(0, world); view.update(.05, world)
    for (const [index, root] of view.roots.entries()) {
      const frame = root.children[1].texture.frame
      feedingFrames[index].add(frame.x)
      assert([192, 384].includes(frame.x), 'feeding must keep looping lowered-head poses, not hold an upright frame')
      assert.equal(root.x, paused[index].x); assert.equal(root.y, paused[index].y)
    }
  }
  assert(feedingFrames.every(frames => frames.size === 2), 'both chickens must keep pecking beyond the first animation cycle')
  const texture = view.roots[0].children[1].texture
  view.dispose()
  assert(texture.destroyed); assert(!source.destroyed)
})
