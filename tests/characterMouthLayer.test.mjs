import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { mouthRegistration } from '../scripts/characters/create-marvis-mouth-layer.mjs'
import { officeMouthRegistrations } from '../scripts/characters/create-office-mouth-layers.mjs'
import { CharacterSourceSchema, CharacterManifestSchema, sampleCharacterLayers, sampleCharacterClip, characterPreviewTimeline } from '../src/scene/characters/packSchema.ts'
import { characterPackFixture, legacyCharacterPackFixture } from './helpers/characterPack.mjs'
import { createTestServer } from './helpers/vite.mjs'

let server, ApartmentCharacter
before(async () => {
  server = await createTestServer()
  ;({ ApartmentCharacter } = await server.ssrLoadModule('/src/scene/characters/ApartmentCharacter.ts'))
})
after(() => server?.close())

async function figure(t, id) {
  const pack = await characterPackFixture(id)
  const character = new ApartmentCharacter(id)
  character.pack = pack
  t.after(() => { character.destroy(); pack.dispose() })
  return { character, pack, texture: (name, time = 0) => pack.textures.get(sampleCharacterClip(pack.manifest, name, time).key) }
}

for (const [id, registrations] of Object.entries({ marvis: mouthRegistration, ...officeMouthRegistrations })) {
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
  const { character: c, pack, texture } = await figure(t, id)
  c.setViewFacing('front'); c.playState('idle'); c.update(0)
  const body = c.sprite.texture
  assert(c.mouthSprite.visible)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-closed'))
  c.setSpeechText('Here is the task.')
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-speaking'))
  c.update(.12)
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-speaking', 120))
  c.setSpeechText('Here is the task.'); c.update(0)
  assert.equal(c.speechElapsed, 120)
  c.setSpeechText('New sentence.')
  assert.equal(c.speechElapsed, 0)
  c.setSpeechText(' ')
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.front-closed'))
  assert.equal(c.sprite.scale.y, pack.manifest.displayHeight / pack.manifest.referenceHeight)
})

test(`${id}: walking keeps the mouth closed and follows per-frame anchors and mirrored directions`, async t => {
  const { character: c, pack, texture } = await figure(t, id)
  c.setSpeechText('Stale speech must not open a walking mouth.')
  for (const direction of ['front', 'right', 'left']) {
    c.setViewFacing(direction); c.playState('idle'); c.playState('walking')
    for (let i = 0; i < 4; i++) {
      c.update(i === 0 ? 0 : .125)
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
  c.setViewFacing('back'); c.update(0)
  assert.equal(c.mouthSprite.visible, false)
  c.playState('talking', 'emotes/surprised'); c.update(0)
  assert.equal(c.mouthSprite.visible, false, 'authored expression must not get a second mouth')
})

test(`${id}: seated speech uses its own anchor and scale; transitions hide the side mouth without changing posture`, async t => {
  const { character: c, pack, texture } = await figure(t, id)
  c.setAtDesk(true); c.setViewFacing('right'); c.playState('idle'); c.update(0)
  const body = c.sprite.texture
  const { mouth } = sampleCharacterLayers(pack.manifest, 'talk.seated-right')
  const scale = pack.manifest.displayHeight / pack.manifest.referenceHeight
  assert.equal(c.mouthSprite.y, (mouth.attachment.y - pack.manifest.pivot.y) * scale)
  assert.equal(c.mouthSprite.scale.y, scale * mouth.attachment.scale)
  c.setSpeechText('Received.'); c.update(.12)
  assert.equal(c.sprite.texture, body)
  assert.equal(c.mouthSprite.texture, texture('mouth.right-speaking', 120))
  c.setViewFacing('left'); c.update(0)
  assert(c.mouthSprite.scale.x < 0)
  c.setSeatTransition({ stage: 'rising', seatedAmount: .75, progress: .25 }); c.update(0)
  assert.equal(c.sprite.texture, texture('pose.lean'))
  assert.equal(c.mouthSprite.visible, false)
  c.setSeatTransition(undefined); c.setSpeechText(undefined); c.setViewFacing('back'); c.update(0)
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
  const { character: c, pack, texture } = await figure(t, 'marvis')
  const cycle = pack.manifest.displayHeight * .72
  c.setViewFacing('front'); c.playState('walking')
  c.update(1, 0)
  assert.equal(c.sprite.texture, texture('walk.front', 0), 'blocked movement must not pedal')
  c.update(.001, cycle * .3)
  assert.equal(c.sprite.texture, texture('walk.front', 240))
  c.setViewFacing('back'); c.update(.5, 0)
  assert.equal(c.sprite.texture, texture('walk.back', 240), 'a turn must not restart the stride')
  c.update(.001, cycle * .5)
  assert.equal(c.sprite.texture, texture('walk.back', 640))
  c.playState('idle'); c.playState('walking'); c.update(0, 0)
  assert.equal(c.sprite.texture, texture('walk.back', 0), 'a new walk starts a fresh cycle')
})

test('scene stride phase is independent of frame rate', async t => {
  const fixtures = [await figure(t, 'marvis'), await figure(t, 'marvis')]
  for (const [i, fps] of [30, 120].entries()) {
    const { character: c, pack, texture } = fixtures[i]
    c.setViewFacing('front'); c.playState('walking')
    const distance = pack.manifest.displayHeight * .72 * 1.6
    for (let frame = 0; frame < fps; frame++) c.update(1 / fps, distance / fps)
    assert.equal(c.sprite.texture, texture('walk.front', 480))
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
