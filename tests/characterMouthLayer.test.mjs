import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { mouthRegistration } from '../art/characters/office-lead-mouth-layer/registration.mjs'
import { officeMouthRegistrations } from '../art/characters/mouth-layers/registration.mjs'
import { CharacterSourceSchema, CharacterManifestSchema, sampleCharacterLayers, sampleCharacterClip, characterPreviewTimeline } from '@pixoffice/assets-office/frame/packSchema'
import { characterPackFixture, legacyCharacterPackFixture } from './helpers/characterPack.mjs'
import { createTestServer } from './helpers/vite.mjs'
import { frameVisualFixture } from './helpers/frameVisual.mjs'

let server
before(async () => {
  server = await createTestServer()
})
after(() => server?.close())

async function figure(t, id) {
  return frameVisualFixture(t, server, id)
}

for (const [id, registrations] of Object.entries({ 'office-lead': mouthRegistration, ...officeMouthRegistrations })) {
test(`${id}: mouthless bodies preserve the original pose, canvas, alpha and every pixel outside the mouth`, async () => {
  const root = new URL(`../art/characters/packs/${id}/`, import.meta.url)
  for (const { file, patch: [x, y, width, height] } of registrations) {
    const original = await sharp(new URL(file, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const body = await sharp(new URL(`body/${file}`, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(body.info, original.info)
    let changes = 0
    for (let row = 0; row < body.info.height; row++) for (let col = 0; col < body.info.width; col++) {
      const offset = (row * body.info.width + col) * 4
      assert.equal(body.data[offset + 3], original.data[offset + 3], `${file}: alpha must not change`)
      if (body.data.subarray(offset, offset + 4).equals(original.data.subarray(offset, offset + 4))) continue
      changes++
      assert(col >= x && col < x + width && row >= y && row < y + height, `${file}: changed outside mouth`)
    }
    assert(changes > 10, `${file}: mouth removal missing`)
  }
})

test(`${id}: speech animates a second sprite without swapping or moving the body`, async t => {
  const model = await figure(t, id), { pack, texture } = model
  const c = model.sample()
  const body = c.sprite.texture
  assert(c.mouthSprite.visible)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-closed'))
  model.sample({ speechMs: 0 })
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-speaking'))
  model.sample({ elapsedMs: 120, speechMs: 120 })
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-speaking', 120))
  model.sample({ elapsedMs: 120 })
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-closed'))
  assert.equal(c.sprite.scale.y, pack.manifest.displayHeight / pack.manifest.referenceHeight)
})

test(`${id}: walking keeps the mouth closed and follows per-frame anchors and mirrored directions`, async t => {
  const model = await figure(t, id), { pack, texture } = model
  for (const direction of ['front', 'right', 'left']) {
    for (let i = 0; i < 4; i++) {
      const c = model.sample({ actionId: 'core.walk', view: direction, elapsedMs: i * 125 })
      const { body, mouth } = sampleCharacterLayers(pack.manifest, `walk.${direction}`, i * 125)
      assert(c.mouthSprite.visible)
      assert.equal(c.sprite.texture, texture(`walk.${direction}`, i * 125))
      assert.equal(c.mouthSprite.texture, texture(direction === 'front' ? 'mouth.front-closed' : 'mouth.right-closed'))
      const scale = pack.manifest.displayHeight / pack.manifest.referenceHeight
      const mirror = body.clip.mirrorX ? -1 : 1
      assert.equal(c.mouthSprite.x, (mouth.attachment.x - pack.manifest.pivot.x) * scale * mirror)
      assert.equal(c.mouthSprite.y, (mouth.attachment.y - pack.manifest.pivot.y) * scale)
      assert.equal(Math.sign(c.mouthSprite.scale.x), mirror)
    }
  }
  assert.equal(model.sample({ actionId: 'core.walk', view: 'back' }).mouthSprite.visible, false)
  assert.equal(model.sample({ actionId: 'core.emote.surprised' }).mouthSprite.visible, false, 'authored expression must not get a second mouth')
})

test(`${id}: seated speech uses its own anchor and scale; transitions hide the side mouth without changing posture`, async t => {
  const model = await figure(t, id), { pack, texture } = model
  const c = model.sample({ poseId: 'seated', view: 'right' })
  const body = c.sprite.texture
  const { mouth } = sampleCharacterLayers(pack.manifest, 'talk.seated-right')
  const scale = pack.manifest.displayHeight / pack.manifest.referenceHeight
  assert.equal(c.mouthSprite.y, (mouth.attachment.y - pack.manifest.pivot.y) * scale)
  assert.equal(c.mouthSprite.scale.y, scale * mouth.attachment.scale)
  model.sample({ poseId: 'seated', view: 'right', speechMs: 120 })
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.right-speaking', 120))
  model.sample({ poseId: 'seated', view: 'left', speechMs: 120 })
  assert(c.mouthSprite.scale.x < 0)
  model.sample({ actionId: 'core.stand-up', poseId: 'transition', view: 'back', progress: .25 })
  assert.equal(c.sprite.texture, texture('pose.lean'))
  assert.equal(c.mouthSprite.visible, false)
  model.sample({ poseId: 'seated', view: 'back' })
  assert.equal(c.mouthSprite.visible, false)
})

test(`${id}: preview and canvas share body/mouth sampling and speech timing`, async t => {
  const { pack } = await figure(t, id)
  const timeline = characterPreviewTimeline(pack.manifest, 'speak.left')
  assert.equal(timeline.frames.length, 6)
  assert.equal(timeline.loop, true)
  assert.equal(timeline.frames.reduce((sum, frame) => sum + frame.durationMs, 0), 730)
  for (const time of [0, 110, 210, 310, 430, 520, 730]) {
    const preview = sampleCharacterLayers(pack.manifest, 'speak.left', time)
    const canvas = sampleCharacterLayers(pack.manifest, 'idle.left', 999, undefined, time)
    assert.equal(preview.body.key, canvas.body.key)
    assert.equal(preview.mouth.key, canvas.mouth.key)
    assert.equal(preview.body.clip.mirrorX, true)
  }
})

test(`${id}: mouth metadata survives packing and rejects invalid transforms or references`, async t => {
  const { pack } = await figure(t, id)
  const source = JSON.parse(await readFile(new URL(`../art/characters/packs/${id}/character.json`, import.meta.url), 'utf8'))
  assert(CharacterSourceSchema.safeParse(source).success)
  assert.deepEqual(source.clips['walk.right'].frames.map(frame => frame.mouth), pack.manifest.clips['walk.right'].frames.map(frame => frame.mouth))
  for (const mutate of [
    value => { value.clips['idle.front'].frames[0].mouth.view = 'missing' },
    value => { value.clips['idle.front'].frames[0].mouth.x = 999 },
    value => { value.clips['idle.front'].frames[0].mouth.scale = 0 },
    value => { value.clips['idle.front'].frames[0].mouth.rotation = 181 },
    value => { value.mouth.pivot.x = 999 },
    value => { value.mouth.views.front.speaking = 'missing.mouth' },
    value => { delete value.mouth },
  ]) {
    const invalidSource = structuredClone(source); mutate(invalidSource)
    const invalidManifest = structuredClone(pack.manifest); mutate(invalidManifest)
    assert.equal(CharacterSourceSchema.safeParse(invalidSource).success, false)
    assert.equal(CharacterManifestSchema.safeParse(invalidManifest).success, false)
  }
})
}

test('legacy packs keep full-frame speech without a mouth layer', async t => {
  const legacy = await legacyCharacterPackFixture()
  t.after(() => legacy.dispose())
  assert.equal(sampleCharacterLayers(legacy.manifest, 'speak.right', 120).mouth, undefined)
  assert.equal(characterPreviewTimeline(legacy.manifest, 'speak.right').frames.length, 6)
})

test('scene gait is distance-driven, freezes at obstacles and retains phase through turns', async t => {
  const model = await figure(t, 'office-lead'), { texture } = model
  const c = model.sample({ actionId: 'core.walk', travelledDu: 0, elapsedMs: 1000 })
  assert.equal(c.sprite.texture, texture('walk.front', 0), 'blocked movement must not pedal')
  model.sample({ actionId: 'core.walk', travelledDu: .72 * .3 })
  assert.equal(c.sprite.texture, texture('walk.front', 240))
  model.sample({ actionId: 'core.walk', view: 'back', travelledDu: .72 * .3 })
  assert.equal(c.sprite.texture, texture('walk.back', 240), 'a turn must not restart the stride')
  model.sample({ actionId: 'core.walk', view: 'back', travelledDu: .72 * .8 })
  assert.equal(c.sprite.texture, texture('walk.back', 640))
  model.sample({ actionId: 'core.walk', view: 'back', travelledDu: 0 })
  assert.equal(c.sprite.texture, texture('walk.back', 0), 'a new walk starts a fresh cycle')
})

test('scene stride phase is independent of frame rate', async t => {
  const fixtures = [await figure(t, 'office-lead'), await figure(t, 'office-lead')]
  for (const [i, fps] of [30, 120].entries()) {
    const model = fixtures[i], actor = { id: 'one', displayHeight: 84, position: { x: 0, y: 0 }, intent: { actionId: 'core.walk', poseId: 'standing', view: 'front' } }
    model.present(actor, 0)
    for (let frame = 1; frame <= fps; frame++) { actor.position.y = 84 * .72 * 1.6 * frame / fps; model.present(actor, 1 / fps) }
    assert.equal(model.root.sprite.texture, model.texture('walk.front', 480))
  }
})

test('unchanged lateral fourth walking frames preserve their second-frame pose, not the idle pose', async () => {
  for (const id of Object.keys(officeMouthRegistrations)) for (const view of ['right']) {
    const root = new URL(`../art/characters/packs/${id}/`, import.meta.url)
    const second = await sharp(new URL(`walk/${view}/002.png`, root).pathname).raw().toBuffer()
    const fourth = await sharp(new URL(`walk/${view}/004.png`, root).pathname).raw().toBuffer()
    assert(second.equals(fourth), `${id}/${view}`)
    const source = JSON.parse(await readFile(new URL('character.json', root), 'utf8'))
    assert.equal(source.clips[`walk.${view}`].frames[1].file, `body/walk/${view}/002.png`)
    assert.equal(source.clips[`walk.${view}`].frames[3].file, `body/walk/${view}/002.png`)
  }
})
