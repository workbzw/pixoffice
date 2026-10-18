import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createTestServer } from './helpers/vite.mjs'
import { characterPackFixture } from './helpers/characterPack.mjs'
import { frameVisualFixture } from './helpers/frameVisual.mjs'

const root = new URL('../art/characters/packs/office-lead/', import.meta.url)
const pixels = async file => sharp(await readFile(new URL(file, root))).ensureAlpha().raw().toBuffer()

test('quiet work changes only generated finger regions and preserves the working pose', async () => {
  const source = JSON.parse(await readFile(new URL('character.json', root), 'utf8'))
  const recipe = JSON.parse(await readFile(new URL('../art/characters/office-lead-quiet-work-v2/registration.json', import.meta.url), 'utf8'))
  const master = await pixels('work/quiet-back-v2/001.png')
  const resting = await pixels('standard-v2/sit/back/001.png')
  assert(!master.equals(resting), 'working must not reuse the dangling-arm resting pose')
  const frames = await Promise.all(['001', '002', '003', '004'].map(n => pixels(`work/quiet-back-v2/${n}.png`)))
  assert(frames[0].equals(master)); assert(frames[2].equals(master))
  for (const [index, { patch }] of recipe.motion.candidates.entries()) {
    const frame = frames[index === 0 ? 1 : 3]
    let changes = 0
    for (let y = 0; y < 384; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4
      const same = master.subarray(i, i + 4).equals(frame.subarray(i, i + 4))
      const inside = x >= patch.left && x < patch.left + patch.width && y >= patch.top && y < patch.top + patch.height
      if (!inside) assert(same, `unexpected change at ${x},${y}`)
      else changes += !same
    }
    assert(changes > 20 && changes < 1500, 'the motion is a real, local edit')
  }
  const clip = source.clips['work.quiet-back']
  assert(clip.loop)
  assert.equal(new Set(clip.frames.map(frame => frame.file)).size, 4)
  assert.equal(clip.frames.length, 13)
  assert.equal(clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0), 4000)
  assert.equal(clip.frames.at(-1).durationMs, 1000)
  for (let i = 0; i < 12; i++) {
    assert.equal(clip.frames[i].durationMs, 250)
    assert.equal(clip.frames[i].file, `work/quiet-back-v2/00${i % 4 + 1}.png`)
  }
})

test('all other employees play their own complete quiet-work frames', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { characterPreviewTimeline, sampleCharacterLayers } = await server.ssrLoadModule('@pixoffice/assets-office/frame/packSchema')
  const recipe = JSON.parse(await readFile(new URL('../art/characters/office-quiet-work-v4/registration.json', import.meta.url), 'utf8'))
  const reference = JSON.parse(await readFile(new URL('character.json', root), 'utf8')).clips['work.quiet-back']
  for (const id of ['code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']) {
    const model = await frameVisualFixture(t, server, id), { pack } = model
    const { manifest } = pack
    const files = ['001', '002', '003', '004'].map(n => `work/quiet-back-v4/${n}.png`)
    const clip = manifest.clips['work.quiet-back']
    assert(clip?.loop, `${id} has a dedicated frame clip`)
    assert.deepEqual([...new Set(clip.frames.map(frame => frame.frame))], files)
    const timeline = characterPreviewTimeline(manifest, 'work.quiet-back')
    assert.equal(timeline.frames.length, 13)
    assert.equal(timeline.frames.reduce((sum, frame) => sum + frame.durationMs, 0), 4000)
    assert.deepEqual(timeline.frames.map(frame => frame.durationMs), reference.frames.map(frame => frame.durationMs), `${id} follows the leader's actual timing`)
    const neutral = sampleCharacterLayers(manifest, 'work.quiet-back', 0)
    const leftPress = sampleCharacterLayers(manifest, 'work.quiet-back', 250)
    const rightPress = sampleCharacterLayers(manifest, 'work.quiet-back', 750)
    const pause = sampleCharacterLayers(manifest, 'work.quiet-back', 3500)
    assert.deepEqual([neutral, leftPress, rightPress, pause].map(sample => sample.body.key),
      [files[0], files[1], files[3], files[0]])
    assert([neutral, leftPress, rightPress, pause].every(sample => sample.work === undefined), `${id} needs no runtime arm sprites`)
    const sourceRoot = new URL(`../art/characters/packs/${id}/`, import.meta.url)
    const frames = await Promise.all(files.map(async file => sharp(await readFile(new URL(file, sourceRoot))).ensureAlpha().raw().toBuffer()))
    assert(frames[0].equals(frames[2]), `${id} has a stationary neutral pose`)
    assert(!frames[0].equals(frames[1]) && !frames[0].equals(frames[3]), `${id} has both press poses`)
    const entry = recipe.characters.find(character => character.id === id)
    assert(entry?.neutralOutputId && entry.motion.outputId, `${id}: retains generated whole-image provenance`)
    assert.notEqual(entry.neutralOutputId, entry.motion.outputId)
    const standard = JSON.parse(await readFile(new URL('standard.json', sourceRoot), 'utf8'))
    assert(standard.requiredClips.includes('work.quiet-back'), `${id}: validates working proportions during every build`)
    for (const file of files) assert.equal(standard.frames[file].footY, 377)
    for (const frame of frames) assert.equal(frame.length, 256 * 384 * 4)
    const character = model.sample({ actionId: 'office.type', poseId: 'seated', view: 'back', elapsedMs: 250 })
    assert.equal(character.sprite.texture, pack.textures.get(leftPress.body.key), `${id} uses quiet work in the live character`)
    assert.equal(character.children.length, 3, `${id} mounts only shadow, body and mouth`)
    model.sample({ poseId: 'seated', view: 'right' })
    assert.equal(character.children.length, 3)
  }
})

test('working fingertips stay above the actual trial desktop front, not down beside the lap', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { workstationSurface } = await server.ssrLoadModule('@pixoffice/scene-office/pixi/workstationSurface')
  const { WORKSTATION_SEAT_Y } = await server.ssrLoadModule('@pixoffice/scene-office/pixi/workstationArtwork')
  const surface = workstationSurface('trial')
  const front = 344 + (surface.bounds.front - WORKSTATION_SEAT_Y) / .3
  for (const n of ['001', '002', '003', '004']) {
    const data = await pixels(`work/quiet-back-v2/${n}.png`)
    for (const [left, right] of [[52, 71], [187, 203]]) {
      let fingertips = 0
      for (let y = 222; y < front - 7; y++) for (let x = left; x < right; x++) {
        const i = (y * 256 + x) * 4
        if (data[i + 3] > 200 && data[i] > 220 && data[i + 1] > 155 && data[i + 2] > 130 && data[i] > data[i + 1] + 10) fingertips++
      }
      assert(fingertips > 20, `${n}: missing visible fingertips on the desk plane`)
    }
  }
})

test('quiet work uses complete frames, pauses on the working pose and exits for walking, seating or conversation', async t => {
  const server = await createTestServer(); t.after(() => server.close())
  const { sampleCharacterLayers, sampleCharacterClip, characterPreviewTimeline } = await server.ssrLoadModule('@pixoffice/assets-office/frame/packSchema')
  const model = await frameVisualFixture(t, server), { pack } = model
  const character = model.sample({ actionId: 'office.type', poseId: 'seated', view: 'back' })
  const seen = new Set()
  for (let elapsed = 0; elapsed <= 12000; elapsed += 50) {
    model.sample({ actionId: 'office.type', poseId: 'seated', view: 'back', elapsedMs: elapsed })
    const sample = sampleCharacterLayers(pack.manifest, 'work.quiet-back', elapsed)
    assert.equal(sample.work, undefined)
    assert.equal(character.sprite.texture, pack.textures.get(sample.body.key))
    assert.equal(character.children.length, 3)
    assert.equal(character.sprite.scale.y, .3)
    assert.equal(character.sprite.x, 0); assert.equal(character.sprite.y, 0)
    seen.add(sample.body.key)
    if (elapsed % 4000 >= 3000) assert.equal(sample.body.key, 'work/quiet-back-v2/001.png')
  }
  assert.equal(seen.size, 4)
  assert.equal(characterPreviewTimeline(pack.manifest, 'work.quiet-back').frames.length, 13)
  model.sample({ poseId: 'seated', view: 'left' })
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'talk.seated-left').key))
  model.sample({ actionId: 'core.stand-up', poseId: 'transition', view: 'back', progress: .5 })
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'stand-up.back', 0, .5).key))
  for (const [actionId, poseId, clip] of [['core.walk', 'standing', 'walk.back'], ['core.idle', 'seated', 'sit.back']]) {
    model.sample({ actionId, poseId, view: 'back' })
    assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, clip).key))
  }
  model.sample({ view: 'back' })
  assert.equal(character.sprite.texture, pack.textures.get(sampleCharacterClip(pack.manifest, 'idle.back').key))
})
