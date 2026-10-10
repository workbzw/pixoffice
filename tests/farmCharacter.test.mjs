import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

test('farm work frames keep both feet planted instead of sliding the legs during a lean', async () => {
  const root = new URL('../art/farm/', import.meta.url)
  const character = JSON.parse(await readFile(new URL('character/character.json', root), 'utf8'))
  const registration = JSON.parse(await readFile(new URL('registration.json', root), 'utf8'))
  assert.equal(registration.schemaVersion, 2)
  assert.equal(registration.frames.length, 12)
  for (const action of ['plant', 'water', 'harvest']) {
    const clip = character.clips[`farm.${action}`]
    assert.equal(clip.loop, false); assert.equal(clip.frames.length, 4)
    for (const frame of clip.frames) {
      const record = registration.frames.find(item => item.file === frame.file)
      assert.equal(record.scale, .735); assert.deepEqual(record.foot, { x: 128, y: 344 })
      const { data, info } = await sharp(new URL(`character/${frame.file}`, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      assert.equal(info.width, 256); assert.equal(info.height, 384)
      let left = 185, right = -1, bottom = -1
      for (let y = 326; y < 350; y++) for (let x = 70; x < 185; x++) if (data[(y * info.width + x) * 4 + 3] >= 128) {
        left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y)
      }
      assert(right >= left, `${frame.file}: missing ground contact`)
      assert(Math.abs((left + right + 1) / 2 - 128) <= 1, `${frame.file}: feet shifted sideways`)
      assert(Math.abs(bottom + 1 - 344) <= 1, `${frame.file}: feet shifted vertically`)
    }
  }
})

test('fixing the farm work registration does not redraw standing or walking frames', async () => {
  const root = new URL('../art/farm/', import.meta.url)
  const before = JSON.parse(await readFile(new URL('motion-v1/character.json', root), 'utf8'))
  const after = JSON.parse(await readFile(new URL('character/character.json', root), 'utf8'))
  const source = new URL('../characters/packs/marvis/', root)
  for (const [name, clip] of Object.entries(after.clips)) {
    if (name.startsWith('farm.')) continue
    assert.deepEqual(clip, before.clips[name])
    for (const frame of clip.frames ?? []) assert.deepEqual(await readFile(new URL(`character/${frame.file}`, root)), await readFile(new URL(frame.file, source)))
  }
})
